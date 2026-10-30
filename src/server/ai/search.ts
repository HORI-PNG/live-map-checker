// 会場を開いたときの AI 検索（docs/plan.md 4.2〜4.4）。
// 24時間キャッシュ → 二重起動の防止と予算の確認（1文で） → 検索 → 出典の検証 → 保存、の順に行う
import { and, eq, gte, lte, type SQL, sql } from 'drizzle-orm'
import { addDays, jstDayStartIso, todayJst } from '@/shared/dates'
import { fingerprintOf } from '@/shared/fingerprint'
import { normalizeText } from '@/shared/normalize'
import { aliased as as } from '../db/alias'
import type { Db } from '../db/client'
import { aiSearches, events, prefectures, venues } from '../db/schema'
import { EVENT_WINDOW_DAYS } from '../repo/geo'
import { AI_RESULT_TTL_MS, aiStateQueries, aiView, needsAi, RUNNING_TIMEOUT_MS } from './state'
import { AiError, type AiProvider, type AiUsage, type EventCandidate, eventCandidateSchema } from './types'
import type { SourceCheck, SourceItem } from './verify'

/**
 * 1回の検索で保存する公演・取得する出典の上限。最後の書き込みは「公演 30 + 検証の記録 3 + 2」= 35 文、
 * 最初の読み出し 6 文・行の確保 1 文と合わせて D1 のクエリ 50 に収める（出典の取得もサブリクエスト 50 に収める）
 */
const MAX_CANDIDATES = 30
const MAX_SOURCES = 20
/** 検証の記録を1文にまとめる行数（1文あたりの値は 100 個まで。1行 7 個） */
const VERIFICATION_ROWS_PER_STATEMENT = 14

export type SearchDeps = {
  /** AI の提供元（キーが無いなどで使えなければ AiError('unavailable') を投げる） */
  provider: () => AiProvider
  /** 出典 1件の検証（本番は URL ごとに別の呼び出し。verifier.ts） */
  verify: (url: string, items: SourceItem[]) => Promise<SourceCheck>
  budgetMicros: number
  now?: Date
}

export type SearchOutcome =
  | { status: 'not_needed' | 'fresh' | 'running' }
  | { status: 'unavailable'; reason: 'budget' | 'error' }
  | { status: 'searched'; candidates: number; verified: number }

const INSERT_FINISHED_SQL = `INSERT INTO ai_searches (venue_id, status, provider, model, started_at, finished_at, error)
  VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)`

// 行を作るのは「同じ会場で検索中（running）が無い」かつ「今日の合計（検索中の分の見積もりを含む）＋見積もり ≦ 上限」の
// ときだけ。1文で確かめるので、同時に開かれても上限を超えて走り出さない。
// 見積もり額を先に cost_usd_micros に入れておき（予約）、終わったら実際の額で上書きする。途中で止まっても予算に数えられる
const CLAIM_SQL = `INSERT INTO ai_searches (venue_id, status, provider, model, started_at, cost_usd_micros)
  SELECT ?1, 'running', ?2, ?3, ?4, ?6
  WHERE NOT EXISTS (SELECT 1 FROM ai_searches WHERE venue_id = ?1 AND status = 'running' AND started_at > ?5)
    AND (SELECT coalesce(sum(cost_usd_micros), 0) FROM ai_searches WHERE started_at >= ?7) + ?6 <= ?8
  RETURNING id`

const FINISH_SQL = `UPDATE ai_searches SET status = ?2, finished_at = ?3, expires_at = ?4, input_tokens = ?5,
  output_tokens = ?6, web_search_count = ?7, cost_usd_micros = ?8, candidates = ?9, verified = ?10, error = ?11
  WHERE id = ?1`

// 取得した公演（source_kind = 'scrape'）と同じ鍵なら上書きしない
const UPSERT_AI_EVENT_SQL = `INSERT INTO events
  (venue_id, source_kind, title, artist_name, artist_norm, tour_name, date, open_time, start_time, source_url,
   source_label, category, classified_by, fingerprint, ai_search_id, first_seen_at, last_seen_at, is_active)
  VALUES (?1, 'ai', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'live', 'ai', ?11, ?12, ?13, ?13, 1)
  ON CONFLICT(fingerprint) DO UPDATE SET
    title = excluded.title, artist_name = excluded.artist_name, artist_norm = excluded.artist_norm,
    tour_name = excluded.tour_name, open_time = excluded.open_time, source_url = excluded.source_url,
    source_label = excluded.source_label, ai_search_id = excluded.ai_search_id,
    last_seen_at = excluded.last_seen_at, is_active = 1
  WHERE events.source_kind = 'ai'`

// 今回の検索で出てこなかった、これからの AI の公演は無効にする（古い AI の公演が残り続けないように）
const DEACTIVATE_OLD_AI_SQL = `UPDATE events SET is_active = 0
  WHERE venue_id = ?1 AND source_kind = 'ai' AND date >= ?2 AND (ai_search_id IS NULL OR ai_search_id <> ?3)`

function insertVerificationsSql(rows: number): string {
  const values = Array.from({ length: rows }, () => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
  return `INSERT INTO ai_verifications (ai_search_id, url, http_status, artist_found, date_found, verdict, checked_at) VALUES ${values}`
}

export async function runVenueAiSearch(
  db: Db,
  d1: D1Database,
  venueSlug: string,
  deps: SearchDeps,
): Promise<SearchOutcome> {
  const now = deps.now ?? new Date()
  const startedClock = Date.now()
  /** 検索を始めてからの経過を足した「今」（テストで now を固定しても、終了日時がずれないように） */
  const current = () => new Date(now.getTime() + Date.now() - startedClock)
  const nowIso = now.toISOString()
  const today = todayJst(now)
  const to = addDays(today, EVENT_WINDOW_DAYS)
  const dayStart = jstDayStartIso(today)
  const venueId: SQL<number> = sql<number>`(SELECT id FROM ${venues} WHERE ${venues.slug} = ${venueSlug})`

  const [venueRows, stateRows, latestRows, successRows, spentRows, scrapedRows] = await db.batch([
    db
      .select({
        id: as(venues.id, 'venue_id'),
        name: as(venues.name, 'venue_name'),
        area: venues.area,
        officialUrl: venues.officialUrl,
        scheduleUrl: venues.scheduleUrl,
        fetchMode: venues.fetchMode,
        prefectureName: as(prefectures.name, 'prefecture_name'),
      })
      .from(venues)
      .innerJoin(prefectures, eq(prefectures.id, venues.prefectureId))
      .where(and(eq(venues.slug, venueSlug), eq(venues.isActive, true))),
    ...aiStateQueries(db, venueId),
    // 今日（JST）の AI の使用額（全会場の合計。検索中の分は見積もり額）
    db
      .select({ total: sql<number>`coalesce(sum(${aiSearches.costUsdMicros}), 0)`.mapWith(Number) })
      .from(aiSearches)
      .where(gte(aiSearches.startedAt, dayStart)),
    // 取得済みの公演（AI の候補と重なるものは保存しない）
    db
      .select({ date: events.date, artistNorm: events.artistNorm, title: events.title })
      .from(events)
      .where(
        and(
          eq(events.venueId, venueId),
          eq(events.sourceKind, 'scrape'),
          eq(events.isActive, true),
          gte(events.date, today),
          lte(events.date, to),
        ),
      ),
  ])
  const venue = venueRows[0]
  if (!venue) return { status: 'not_needed' }
  const view = aiView(
    needsAi(venue.fetchMode, stateRows[0] ?? null, now),
    latestRows[0] ?? null,
    successRows[0] ?? null,
    now,
  )
  if (!view.needed) return { status: 'not_needed' }
  if (view.status === 'fresh' || view.status === 'running') return { status: view.status }
  if (view.status === 'unavailable') return { status: 'unavailable', reason: view.reason ?? 'error' }

  let provider: AiProvider
  try {
    provider = deps.provider()
  } catch (error) {
    await recordFinished(d1, venue.id, 'failed', 'none', 'none', nowIso, String(error))
    return { status: 'unavailable', reason: 'error' }
  }

  // 予算の確認は省略しない（CLAUDE.md）。行の確保と同じ1文で確かめる
  const estimate = provider.estimateCostMicros()
  const claimed = await d1
    .prepare(CLAIM_SQL)
    .bind(
      venue.id,
      provider.name,
      provider.model,
      nowIso,
      new Date(now.getTime() - RUNNING_TIMEOUT_MS).toISOString(),
      estimate,
      dayStart,
      deps.budgetMicros,
    )
    .first<{ id: number }>()
  if (!claimed) {
    // 作れなかった理由: 予算を超えるなら記録する（しばらくは検索し直さない）。そうでなければ別の人が検索中
    if ((spentRows[0]?.total ?? 0) + estimate > deps.budgetMicros) {
      await recordFinished(d1, venue.id, 'budget_exceeded', provider.name, provider.model, nowIso, null)
      return { status: 'unavailable', reason: 'budget' }
    }
    return { status: 'running' }
  }
  const searchId = claimed.id
  const fail = async (usage: AiUsage, message: string) => {
    await d1
      .prepare(FINISH_SQL)
      .bind(...finishValues(searchId, 'failed', current(), null, usage, 0, 0, message))
      .run()
    return { status: 'unavailable', reason: 'error' } as const
  }

  let raw: unknown[]
  let usage: AiUsage
  try {
    ;({ candidates: raw, usage } = await provider.searchVenueEvents({
      venueName: venue.name,
      area: venue.area,
      prefectureName: venue.prefectureName,
      officialUrl: venue.officialUrl,
      scheduleUrl: venue.scheduleUrl,
      from: today,
      to,
    }))
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError('api', String(error))
    return fail(e.usage, `${e.kind}: ${e.message}`)
  }

  try {
    const candidates = pickCandidates(raw, venue.id, today, to, scrapedRows)
    const groups = groupBySource(candidates)
    const checks = await Promise.all(
      groups.map(([url, list]) =>
        deps
          .verify(
            url,
            list.map((c) => ({ artist: c.artist, date: c.date })),
          )
          .catch(
            (error): SourceCheck => ({
              url,
              httpStatus: null,
              error: String(error).slice(0, 300),
              results: list.map(() => ({ artistFound: false, dateFound: false })),
            }),
          ),
      ),
    )
    // 出典を1件も取得できなかった（相手のサイトの障害など）ときは、前回の結果を消さずに失敗として扱う
    if (groups.length > 0 && checks.every((c) => c.httpStatus !== 200)) {
      return fail(usage, `出典を1件も取得できませんでした（${checks.length} 件）`)
    }

    const finished = current()
    const finishedIso = finished.toISOString()
    const writes: D1PreparedStatement[] = []
    const verificationRows: unknown[][] = []
    const upsert = d1.prepare(UPSERT_AI_EVENT_SQL)
    let verified = 0
    groups.forEach(([url, list], i) => {
      const check = checks[i]
      list.forEach((c, j) => {
        const result = check.results[j] ?? { artistFound: false, dateFound: false }
        const ok = result.artistFound && result.dateFound
        verificationRows.push([
          searchId,
          url,
          check.httpStatus,
          result.artistFound ? 1 : 0,
          result.dateFound ? 1 : 0,
          check.error ? 'error' : ok ? 'verified' : 'rejected',
          finishedIso,
        ])
        if (!ok) return
        verified++
        writes.push(
          upsert.bind(
            venue.id,
            c.title,
            c.artist,
            normalizeText(c.artist),
            c.tour,
            c.date,
            c.open,
            c.start,
            url,
            new URL(url).hostname,
            c.fingerprint,
            searchId,
            finishedIso,
          ),
        )
      })
    })
    for (let i = 0; i < verificationRows.length; i += VERIFICATION_ROWS_PER_STATEMENT) {
      const chunk = verificationRows.slice(i, i + VERIFICATION_ROWS_PER_STATEMENT)
      writes.push(d1.prepare(insertVerificationsSql(chunk.length)).bind(...chunk.flat()))
    }
    writes.push(d1.prepare(DEACTIVATE_OLD_AI_SQL).bind(venue.id, today, searchId))
    writes.push(
      d1
        .prepare(FINISH_SQL)
        .bind(
          ...finishValues(
            searchId,
            'succeeded',
            finished,
            new Date(finished.getTime() + AI_RESULT_TTL_MS),
            usage,
            raw.length,
            verified,
            null,
          ),
        ),
    )
    await d1.batch(writes)
    return { status: 'searched', candidates: raw.length, verified }
  } catch (error) {
    // 検証や保存で失敗しても、AI にかかった費用は記録する
    return fail(usage, `保存に失敗: ${String(error)}`)
  }
}

type PickedCandidate = EventCandidate & { fingerprint: string }

/** 形の正しい候補のうち、期間内で、取得済みの公演と重ならないもの（同じ鍵は1件に） */
function pickCandidates(
  raw: unknown[],
  venueId: number,
  from: string,
  to: string,
  scraped: { date: string; artistNorm: string | null; title: string }[],
): PickedCandidate[] {
  const scrapedByDate = new Map<string, { artistNorm: string | null; titleNorm: string }[]>()
  for (const s of scraped) {
    const list = scrapedByDate.get(s.date) ?? []
    list.push({ artistNorm: s.artistNorm, titleNorm: normalizeText(s.title) })
    scrapedByDate.set(s.date, list)
  }
  const seen = new Set<string>()
  const picked: PickedCandidate[] = []
  for (const row of raw) {
    const parsed = eventCandidateSchema.safeParse(row)
    if (!parsed.success) continue
    const c = parsed.data
    if (c.date < from || c.date > to) continue
    const artist = normalizeText(c.artist)
    const duplicate =
      artist.length >= 2 &&
      (scrapedByDate.get(c.date) ?? []).some((s) => s.artistNorm === artist || s.titleNorm.includes(artist))
    const fingerprint = fingerprintOf(venueId, c.date, c.start, c.title)
    if (duplicate || seen.has(fingerprint)) continue
    seen.add(fingerprint)
    picked.push({ ...c, fingerprint })
    if (picked.length >= MAX_CANDIDATES) break
  }
  return picked
}

/** 同じ出典 URL は1回だけ取得する（1ページに複数の公演が載っていることが多い） */
function groupBySource(candidates: PickedCandidate[]): [string, PickedCandidate[]][] {
  const groups = new Map<string, PickedCandidate[]>()
  for (const c of candidates) {
    const list = groups.get(c.source_url)
    if (list) list.push(c)
    else if (groups.size < MAX_SOURCES) groups.set(c.source_url, [c])
  }
  return [...groups]
}

function finishValues(
  id: number,
  status: 'succeeded' | 'failed',
  finished: Date,
  expires: Date | null,
  usage: AiUsage,
  candidates: number,
  verified: number,
  error: string | null,
) {
  return [
    id,
    status,
    finished.toISOString(),
    expires?.toISOString() ?? null,
    usage.inputTokens,
    usage.outputTokens,
    usage.webSearchCount,
    usage.costUsdMicros,
    candidates,
    verified,
    error?.slice(0, 500) ?? null,
  ]
}

async function recordFinished(
  d1: D1Database,
  venueId: number,
  status: 'failed' | 'budget_exceeded',
  provider: string,
  model: string,
  nowIso: string,
  error: string | null,
) {
  await d1
    .prepare(INSERT_FINISHED_SQL)
    .bind(venueId, status, provider, model, nowIso, error?.slice(0, 500) ?? null)
    .run()
}
