// 取得の1回分: 順番待ちのページを1つだけ取得して、公演を保存し、結果を記録する（docs/plan.md 3.2〜3.4）。
// GitHub Actions から scripts/scrape.mjs が、ページが無くなるまで繰り返し呼ぶ
import { and, asc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { todayJst } from '@/shared/dates'
import { fingerprintOf } from '@/shared/fingerprint'
import { normalizeText } from '@/shared/normalize'
import { classifyByRules, titleHashOf } from '../classify/rules'
import { aliased } from '../db/alias'
import type { Db } from '../db/client'
import {
  events,
  type FETCH_ERROR_KINDS,
  fetchPages,
  fetchRuns,
  robotsCache,
  venueFetchState,
  venues,
} from '../db/schema'
import { SCRAPERS } from './registry'
import { isAllowedByRobots } from './robots'
import { addMonths, type RawEvent } from './types'

export const USER_AGENT = 'LiveMapChecker/1.0 (+https://live-map-checker.horinouchi-yuki189.workers.dev/about/data)'
/** 同じページを取り直す間隔 */
const REFETCH_AFTER_MS = 20 * 60 * 60 * 1000
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 10_000
const MAX_BYTES = 3 * 1024 * 1024

type ErrorKind = (typeof FETCH_ERROR_KINDS)[number]
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export type TickResult =
  | { status: 'idle' }
  | { status: 'success'; venue: string; pageKey: string; eventsFound: number }
  | { status: 'failed' | 'skipped'; venue: string; pageKey: string; errorKind: ErrorKind; message: string }

class FetchError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message)
  }
}

// D1 への往復は「読み出し1回・書き込み1回」にまとめる（リモートの D1 への往復は遅いため）
export async function runScrapeTick(
  db: Db,
  d1: D1Database,
  fetcher: Fetcher,
  { now = new Date(), syncPages: sync = false }: { now?: Date; syncPages?: boolean } = {},
): Promise<TickResult> {
  const nowIso = now.toISOString()
  const today = todayJst(now)
  // 順番待ちの更新は、まとめて取得する回の最初だけ（scripts/scrape.mjs が指定する）
  if (sync) await syncPages(db, today)

  let read = await readNext(db, now)
  if (!read.candidate && !sync) {
    // 順番待ちがまだ作られていない（初回など）ときは、ここで作る
    await syncPages(db, today)
    read = await readNext(db, now)
  }
  const { candidate, robots } = read
  if (!candidate) return { status: 'idle' }

  const adapter = SCRAPERS.get(candidate.scraperKey ?? '')
  const writes: BatchItem<'sqlite'>[] = []
  const rawWrites: D1PreparedStatement[] = []
  let result: TickResult
  let found = 0
  let live = 0
  let httpStatus: number | null = null
  try {
    if (!adapter) throw new FetchError('parse', `取得ルール ${candidate.scraperKey} が登録されていません`)
    const target = new URL(candidate.url)
    const robotsBody = await robotsFor(db, fetcher, target, robots, now, writes)
    if (!isAllowedByRobots(robotsBody, `${target.pathname}${target.search}`)) {
      throw new FetchError('robots', `robots.txt で禁止: ${target.pathname}`)
    }
    let html: string | null
    try {
      html = await fetchText(fetcher, candidate.url)
      httpStatus = 200
    } catch (error) {
      // 予定が入るまで月のページを作らない会場。今月のページが無いのと、前回は公演があったのに
      // ページが無くなったのは、構造の変化や障害を疑って失敗にする
      const notYet =
        error instanceof FetchError &&
        error.httpStatus === 404 &&
        adapter.futureNotFoundIsEmpty &&
        candidate.pageKey > today.slice(0, 7) &&
        (candidate.lastEventsFound ?? 0) === 0
      if (!notYet) throw error
      html = null
      httpStatus = 404
    }
    let parsed: Awaited<ReturnType<typeof adapter.parse>> = { events: [], invalid: 0 }
    try {
      if (html !== null) parsed = await adapter.parse(html, { pageUrl: candidate.url, pageKey: candidate.pageKey })
    } catch (error) {
      throw new FetchError('parse', `解析中にエラー: ${String(error)}`, 200)
    }
    if (parsed.invalid > 0 && parsed.invalid >= parsed.events.length) {
      throw new FetchError('parse', `解析できない行が ${parsed.invalid} 件（正常 ${parsed.events.length} 件）`, 200)
    }
    // 件数の確認と保存は、そのページの月の公演だけで行う（別の月のページが返ってきたときに気づけるように）
    const inMonth = parsed.events.filter((e) => e.date.startsWith(candidate.pageKey))
    if (parsed.events.length > 0 && inMonth.length === 0) {
      throw new FetchError('parse', `${candidate.pageKey} の公演が1件もありません（別の月のページの可能性）`, 200)
    }
    found = inMonth.length
    const previous = candidate.lastEventsFound ?? 0
    if (found === 0 && previous >= 3) throw new FetchError('empty', `前回 ${previous} 件 → 0 件`, httpStatus)
    if (previous >= 5 && found < previous * 0.2) {
      throw new FetchError('drop', `前回 ${previous} 件 → ${found} 件`, httpStatus)
    }
    live = eventWrites(db, d1, candidate.venueId, candidate.pageKey, inMonth, today, nowIso, writes, rawWrites)
    result = { status: 'success', venue: candidate.venueSlug, pageKey: candidate.pageKey, eventsFound: found }
  } catch (error) {
    const e = error instanceof FetchError ? error : new FetchError('network', String(error))
    httpStatus = e.httpStatus ?? httpStatus
    result = {
      status: e.kind === 'robots' ? 'skipped' : 'failed',
      venue: candidate.venueSlug,
      pageKey: candidate.pageKey,
      errorKind: e.kind,
      message: e.message.slice(0, 500),
    }
  }

  const ok = result.status === 'success'
  const failure = result.status === 'success' ? null : result
  // 公演の書き込み（準備済みの文）とログの書き込みを、同じ1回の往復で流す
  const logWrites: BatchItem<'sqlite'>[] = [
    db.insert(fetchRuns).values({
      venueId: candidate.venueId,
      trigger: 'cron',
      startedAt: nowIso,
      finishedAt: new Date().toISOString(),
      status: result.status,
      errorKind: failure?.errorKind ?? null,
      httpStatus,
      pagesFetched: httpStatus === 200 ? 1 : 0,
      eventsFound: found,
      eventsLive: live,
      message: failure ? `${candidate.pageKey}: ${failure.message}` : candidate.pageKey,
      scraperVersion: adapter?.version ?? null,
    }),
    db
      .update(fetchPages)
      .set({
        lastFetchedAt: nowIso,
        lastStatus: result.status,
        lastEventsFound: ok ? found : candidate.lastEventsFound,
      })
      .where(eq(fetchPages.id, candidate.pageId)),
    // 会場の状態は、その会場の全ページの結果から決める（月ごとのページが1つ成功しただけで回復扱いにしない）。
    // 上の fetch_pages の更新のあとに同じ batch の中で実行されるので、今回の結果も含めて数えられる
    db
      .insert(venueFetchState)
      .values({
        venueId: candidate.venueId,
        lastAttemptAt: nowIso,
        lastSuccessAt: ok ? nowIso : null,
        consecutiveFailures: ok ? 0 : 1,
        lastErrorKind: failure?.errorKind ?? null,
        lastEventsFound: ok ? found : null,
      })
      .onConflictDoUpdate({
        target: venueFetchState.venueId,
        set: ok
          ? {
              lastAttemptAt: nowIso,
              // 失敗中のページが残っていれば、その数を失敗回数として残す
              consecutiveFailures: failingPagesOf(candidate.venueId),
              lastSuccessAt: sql`CASE WHEN ${failingPagesOf(candidate.venueId)} = 0 THEN ${nowIso} ELSE ${venueFetchState.lastSuccessAt} END`,
              lastErrorKind: sql`CASE WHEN ${failingPagesOf(candidate.venueId)} = 0 THEN NULL ELSE ${venueFetchState.lastErrorKind} END`,
              lastEventsFound: sql`(SELECT coalesce(sum(${fetchPages.lastEventsFound}), 0) FROM ${fetchPages} WHERE ${fetchPages.venueId} = ${candidate.venueId})`,
            }
          : {
              lastAttemptAt: nowIso,
              consecutiveFailures: sql`${venueFetchState.consecutiveFailures} + 1`,
              lastErrorKind: failure?.errorKind ?? null,
            },
      }),
    ...writes,
  ]
  await d1.batch([...logWrites.map((w) => toPrepared(d1, w)), ...rawWrites])
  return result
}

/** その会場のページのうち、最後の取得が失敗・見送りだったページの数 */
function failingPagesOf(venueId: number) {
  return sql<number>`(SELECT count(*) FROM ${fetchPages} WHERE ${fetchPages.venueId} = ${venueId} AND ${fetchPages.lastStatus} IN ('failed', 'skipped'))`
}

/** drizzle で組み立てた文を、D1 の準備済みの文に変換する（準備済みの文と同じ batch に入れるため） */
function toPrepared(d1: D1Database, query: BatchItem<'sqlite'>): D1PreparedStatement {
  const { sql: text, params } = (query as unknown as { toSQL(): { sql: string; params: unknown[] } }).toSQL()
  return d1.prepare(text).bind(...params)
}

/** 次に取得するページと、保存済みの robots.txt を1往復で読む */
async function readNext(db: Db, now: Date) {
  const [pages, robots] = await db.batch([
    db
      .select({
        // batch で結合するので、同じ列名（id）がぶつからないように別名を付ける
        pageId: aliased(fetchPages.id, 'page_id'),
        pageKey: fetchPages.pageKey,
        url: fetchPages.url,
        lastEventsFound: fetchPages.lastEventsFound,
        venueId: aliased(venues.id, 'venue_id'),
        venueSlug: venues.slug,
        scraperKey: venues.scraperKey,
      })
      .from(fetchPages)
      .innerJoin(venues, eq(venues.id, fetchPages.venueId))
      .where(
        and(
          eq(venues.fetchMode, 'scrape'),
          eq(venues.isActive, true),
          or(
            isNull(fetchPages.lastFetchedAt),
            lt(fetchPages.lastFetchedAt, new Date(now.getTime() - REFETCH_AFTER_MS).toISOString()),
          ),
        ),
      )
      .orderBy(sql`${fetchPages.lastFetchedAt} is not null`, asc(fetchPages.lastFetchedAt), asc(fetchPages.id))
      .limit(1),
    db.select().from(robotsCache),
  ])
  return { candidate: pages[0], robots }
}

/** 取得する会場の「今月〜数か月先」のページを順番待ちに入れ、過ぎた月のページを消す */
async function syncPages(db: Db, today: string) {
  const targets = await db
    .select({ id: venues.id, scraperKey: venues.scraperKey, config: venues.scraperConfig })
    .from(venues)
    .where(and(eq(venues.fetchMode, 'scrape'), eq(venues.isActive, true)))
  const broken: BatchItem<'sqlite'>[] = []
  const rows = targets.flatMap((v) => {
    const adapter = SCRAPERS.get(v.scraperKey ?? '')
    try {
      if (!adapter) throw new Error(`取得ルール ${v.scraperKey} が登録されていません`)
      return adapter.pages(v.config ?? null, today).map((p) => ({ venueId: v.id, pageKey: p.key, url: p.url }))
    } catch (error) {
      // 1会場の設定ミスで、ほかの会場の取得を止めない。その会場は失敗として記録する
      broken.push(
        db.insert(fetchRuns).values({
          venueId: v.id,
          trigger: 'cron',
          status: 'failed',
          errorKind: 'parse',
          message: `設定エラー: ${String(error)}`.slice(0, 500),
        }),
      )
      return []
    }
  })
  const thisMonth = today.slice(0, 7)
  const statements: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < rows.length; i += 30) {
    statements.push(
      db
        .insert(fetchPages)
        .values(rows.slice(i, i + 30))
        .onConflictDoNothing(),
    )
  }
  await db.batch([db.delete(fetchPages).where(lt(fetchPages.pageKey, thisMonth)), ...statements, ...broken])
}

/** robots.txt の中身（無ければ null）。1日以上たっていれば取り直し、保存する文を writes に足す */
async function robotsFor(
  _db: Db,
  fetcher: Fetcher,
  target: URL,
  cachedRows: (typeof robotsCache.$inferSelect)[],
  now: Date,
  writes: BatchItem<'sqlite'>[],
): Promise<string | null> {
  const cached = cachedRows.find((r) => r.host === target.host)
  if (cached && now.getTime() - Date.parse(cached.fetchedAt) <= ROBOTS_TTL_MS) return cached.body
  let status: number | null = null
  let body: string | null
  try {
    const res = await fetcher(`${target.origin}/robots.txt`, request())
    status = res.status
    // 4xx は「robots.txt なし（制限なし）」、5xx は「取得できない」ので取得を見合わせる（RFC 9309）
    if (res.status >= 500) throw new FetchError('robots', `robots.txt が取得できません（${res.status}）`, res.status)
    body = res.ok ? (await res.text()).slice(0, 500_000) : null
  } catch (error) {
    if (error instanceof FetchError) throw error
    throw new FetchError('robots', `robots.txt が取得できません（${String(error)}）`, status)
  }
  writes.push(
    _db
      .insert(robotsCache)
      .values({ host: target.host, fetchedAt: now.toISOString(), body, httpStatus: status })
      .onConflictDoUpdate({
        target: robotsCache.host,
        set: { fetchedAt: now.toISOString(), body, httpStatus: status },
      }),
  )
  return body
}

function request(): RequestInit {
  return {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  }
}

async function fetchText(fetcher: Fetcher, url: string): Promise<string> {
  let res: Response
  try {
    res = await fetcher(url, request())
  } catch (error) {
    throw new FetchError('network', String(error))
  }
  if (res.status !== 200) throw new FetchError('http', `HTTP ${res.status}`, res.status)
  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new FetchError('http', `ページが大きすぎます（${length} バイト）`, res.status)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new FetchError('http', 'ページが大きすぎます', res.status)
  return text
}

export { fingerprintOf }

// ライブ判定: 手動の上書き（classification_cache の manual）→ ルール → AI の判定結果（キャッシュ）→ unknown。
// キャッシュは同じ文の中で引く（D1 の往復を増やさない）。取り直しで判定が決まらなかったときは前の判定を残し、
// 手動の判定は手動でしか上書きしない
const KEEP_CATEGORY = `excluded.classified_by IS NULL
    OR (events.classified_by = 'manual' AND excluded.classified_by <> 'manual')`
const UPSERT_EVENT_SQL = `INSERT INTO events
  (venue_id, source_kind, title, artist_name, artist_norm, tour_name, date, open_time, start_time, detail_url,
   fingerprint, first_seen_at, last_seen_at, is_active, category, classified_by)
  SELECT ?1, 'scrape', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, 1,
    CASE WHEN c.method = 'manual' THEN c.category ELSE COALESCE(?12, c.category, 'unknown') END,
    CASE WHEN c.method = 'manual' THEN 'manual' ELSE COALESCE(?13, c.method) END
  FROM (SELECT 1) LEFT JOIN classification_cache c ON c.title_hash = ?14
  WHERE true
  ON CONFLICT(fingerprint) DO UPDATE SET
    title = excluded.title, artist_name = excluded.artist_name, artist_norm = excluded.artist_norm,
    tour_name = excluded.tour_name, open_time = excluded.open_time, start_time = excluded.start_time,
    detail_url = excluded.detail_url, last_seen_at = excluded.last_seen_at, is_active = 1,
    category = CASE WHEN ${KEEP_CATEGORY} THEN events.category ELSE excluded.category END,
    classified_by = CASE WHEN ${KEEP_CATEGORY} THEN events.classified_by ELSE excluded.classified_by END`

/**
 * 1か月分の公演を保存する文と、今回見えなかった（中止・終了・掲載終了）公演を無効にする文を writes に足す。
 * 公演の保存は件数に比例して CPU 時間がかかるので、drizzle で組み立てずに準備済みの文を使う。
 * ライブ判定（category）も一緒に入れる（UPSERT_EVENT_SQL）。
 * ルールで「ライブではない」と決まったもの以外の件数を返す（手動・AI の判定は保存する文の中で決まるので数えない）
 */
function eventWrites(
  db: Db,
  d1: D1Database,
  venueId: number,
  pageKey: string,
  raw: RawEvent[],
  today: string,
  nowIso: string,
  writes: BatchItem<'sqlite'>[],
  rawWrites: D1PreparedStatement[],
): number {
  // raw はそのページの月の公演だけ（呼び出し側で絞り込み済み）
  const seen = new Set<string>()
  // 先に無効にしてから、今回見えた公演を有効に戻す（同じ書き込みの中で行うので、途中の状態は見えない）
  writes.push(
    db
      .update(events)
      .set({ isActive: false })
      .where(
        and(
          eq(events.venueId, venueId),
          eq(events.sourceKind, 'scrape'),
          // 今日より前の公演は、ページから消えても（終わった公演の掲載終了）無効にしない
          gte(events.date, `${pageKey}-01` > today ? `${pageKey}-01` : today),
          lt(events.date, `${addMonths(pageKey, 1)}-01`),
          lt(events.lastSeenAt, nowIso),
        ),
      ),
  )
  // 取得できた月は、取得の障害中に AI で補った公演を無効にする（取得した公演と二重に出さない）
  writes.push(
    db
      .update(events)
      .set({ isActive: false })
      .where(
        and(
          eq(events.venueId, venueId),
          eq(events.sourceKind, 'ai'),
          gte(events.date, `${pageKey}-01` > today ? `${pageKey}-01` : today),
          lt(events.date, `${addMonths(pageKey, 1)}-01`),
        ),
      ),
  )
  const upsert = d1.prepare(UPSERT_EVENT_SQL)
  let live = 0
  for (const e of raw) {
    const fingerprint = fingerprintOf(venueId, e.date, e.startTime, e.title)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    const rule = classifyByRules(e.title, e.venueCategory)
    if (rule?.category !== 'non_live') live++
    rawWrites.push(
      upsert.bind(
        venueId,
        e.title,
        e.artistName,
        e.artistName ? normalizeText(e.artistName) : null,
        e.tourName,
        e.date,
        e.openTime,
        e.startTime,
        e.detailUrl,
        fingerprint,
        nowIso,
        rule?.category ?? null,
        rule?.method ?? null,
        titleHashOf(e.title),
      ),
    )
  }
  return live
}
