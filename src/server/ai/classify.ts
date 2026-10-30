// ルールで決まらなかった（unknown）タイトルの AI によるライブ判定（docs/plan.md 5章）。
// 会場を開いたときに、その会場のこれからの公演について行う。結果は classification_cache に保存し、同じタイトルを二度聞かない
import { and, desc, eq, gte, inArray, type SQL, sql } from 'drizzle-orm'
import { jstDayStartIso, todayJst } from '@/shared/dates'
import { titleHashOf } from '../classify/rules'
import type { Db } from '../db/client'
import { aiSearches, classificationCache, events, venues } from '../db/schema'
import { claimAiTask, finishAiTask, recordSkippedAiTask } from './ledger'
import { RETRY_AFTER_MS, RUNNING_TIMEOUT_MS } from './state'
import { AiError, type AiProvider, type AiUsage, classificationSchema } from './types'

/** 1回に AI に聞くタイトルの上限（1文あたりの値 100 個・D1 のクエリ 50 に収める） */
export const MAX_TITLES = 40
/** 判定のあと、残ったタイトル（AI が答えなかったもの）を聞き直すまでの間 */
const RETRY_AFTER_SUCCESS_MS = 6 * 60 * 60 * 1000
/** 公演の更新を1文にまとめるタイトルの数（1件あたり値 5 個） */
const TITLES_PER_UPDATE = 15
/** classification_cache の保存を1文にまとめる行数（1行あたり値 6 個） */
const CACHE_ROWS_PER_INSERT = 15

export type ClassifyDeps = {
  provider: () => AiProvider
  budgetMicros: number
  now?: Date
}

export type ClassifyOutcome =
  | { status: 'nothing' | 'skipped' | 'running' }
  | { status: 'unavailable'; reason: 'budget' | 'error' }
  | { status: 'classified'; changed: number }

type Row = { status: 'running' | 'succeeded' | 'failed' | 'budget_exceeded'; startedAt: string }

/** 判定待ちのタイトルがあり、いま AI に聞いてよいか（会場画面の読み出しで使う） */
export function classifyPending(unknownCount: number, latest: Row | null, now: Date): boolean {
  if (unknownCount === 0) return false
  if (!latest) return true
  const age = now.getTime() - Date.parse(latest.startedAt)
  if (latest.status === 'running') return age > RUNNING_TIMEOUT_MS
  if (latest.status === 'succeeded') return age > RETRY_AFTER_SUCCESS_MS
  return age > RETRY_AFTER_MS
}

/** 会場の判定待ちの件数と、最後のライブ判定の記録（ほかの読み出しと同じ batch に入れる） */
export function classifyStateQueries(db: Db, venueId: number | SQL<number>, today: string) {
  return [
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(events)
      .where(unknownEventsOf(venueId, today)),
    db
      .select({ status: aiSearches.status, startedAt: aiSearches.startedAt })
      .from(aiSearches)
      .where(and(eq(aiSearches.venueId, venueId), eq(aiSearches.kind, 'classify')))
      .orderBy(desc(aiSearches.startedAt), desc(aiSearches.id))
      .limit(1),
  ] as const
}

function unknownEventsOf(venueId: number | SQL<number>, today: string) {
  return and(
    eq(events.venueId, venueId),
    eq(events.isActive, true),
    eq(events.category, 'unknown'),
    gte(events.date, today),
  )
}

/** 公演の判定をまとめて更新する文（手動の判定は上書きしない） */
function updateEventsSql(count: number): string {
  const cases = Array.from({ length: count }, () => 'WHEN ? THEN ?').join(' ')
  const list = Array.from({ length: count }, () => '?').join(', ')
  return `UPDATE events SET category = CASE title ${cases} END, classified_by = CASE title ${cases} END
    WHERE venue_id = ? AND category = 'unknown' AND (classified_by IS NULL OR classified_by <> 'manual') AND title IN (${list})`
}

type Decision = { title: string; category: 'live' | 'non_live'; method: 'ai' | 'manual' | 'rule' | 'venue_label' }

function eventUpdates(d1: D1Database, venueId: number, decisions: Decision[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []
  for (let i = 0; i < decisions.length; i += TITLES_PER_UPDATE) {
    const chunk = decisions.slice(i, i + TITLES_PER_UPDATE)
    statements.push(
      d1
        .prepare(updateEventsSql(chunk.length))
        .bind(
          ...chunk.flatMap((d) => [d.title, d.category]),
          ...chunk.flatMap((d) => [d.title, d.method]),
          venueId,
          ...chunk.map((d) => d.title),
        ),
    )
  }
  return statements
}

export async function runVenueClassification(
  db: Db,
  d1: D1Database,
  venueSlug: string,
  deps: ClassifyDeps,
): Promise<ClassifyOutcome> {
  const now = deps.now ?? new Date()
  const startedClock = Date.now()
  const current = () => new Date(now.getTime() + Date.now() - startedClock)
  const nowIso = now.toISOString()
  const today = todayJst(now)
  const dayStart = jstDayStartIso(today)
  const venueId: SQL<number> = sql<number>`(SELECT id FROM ${venues} WHERE ${venues.slug} = ${venueSlug})`

  const [venueRows, titleRows, latestRows, spentRows] = await db.batch([
    db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(and(eq(venues.slug, venueSlug), eq(venues.isActive, true))),
    db
      .selectDistinct({ title: events.title })
      .from(events)
      .where(unknownEventsOf(venueId, today))
      .orderBy(events.title)
      .limit(MAX_TITLES),
    classifyStateQueries(db, venueId, today)[1],
    db
      .select({ total: sql<number>`coalesce(sum(${aiSearches.costUsdMicros}), 0)`.mapWith(Number) })
      .from(aiSearches)
      .where(gte(aiSearches.startedAt, dayStart)),
  ])
  const venue = venueRows[0]
  if (!venue || titleRows.length === 0) return { status: 'nothing' }
  if (!classifyPending(titleRows.length, latestRows[0] ?? null, now)) return { status: 'skipped' }

  // ほかの会場で判定済み（または手動で決めた）タイトルは、AI に聞かずにそれを使う
  const titles = titleRows.map((r) => r.title)
  const hashes = new Map(titles.map((t) => [titleHashOf(t), t]))
  const cached = await db
    .select({
      titleHash: classificationCache.titleHash,
      category: classificationCache.category,
      method: classificationCache.method,
    })
    .from(classificationCache)
    .where(inArray(classificationCache.titleHash, [...hashes.keys()]))
  const decisions: Decision[] = []
  for (const c of cached) {
    const title = hashes.get(c.titleHash)
    if (title && c.category !== 'unknown') decisions.push({ title, category: c.category, method: c.method })
  }
  const decided = new Set(decisions.map((d) => d.title))
  const remaining = titles.filter((t) => !decided.has(t))
  if (remaining.length === 0) {
    await d1.batch(eventUpdates(d1, venue.id, decisions))
    return { status: 'classified', changed: decisions.length }
  }

  let provider: AiProvider
  try {
    provider = deps.provider()
  } catch (error) {
    await recordSkippedAiTask(d1, {
      venueId: venue.id,
      kind: 'classify',
      status: 'failed',
      provider: 'none',
      model: 'none',
      nowIso,
      error: String(error),
    })
    if (decisions.length > 0) await d1.batch(eventUpdates(d1, venue.id, decisions))
    return { status: 'unavailable', reason: 'error' }
  }

  // 予算の確認は省略しない（CLAUDE.md）。検索と同じ日次上限に含める
  const estimate = provider.estimateClassifyMicros(remaining.length)
  const taskId = await claimAiTask(d1, {
    venueId: venue.id,
    kind: 'classify',
    provider: provider.name,
    model: provider.model,
    nowIso,
    runningSinceIso: new Date(now.getTime() - RUNNING_TIMEOUT_MS).toISOString(),
    estimateMicros: estimate,
    dayStartIso: dayStart,
    budgetMicros: deps.budgetMicros,
  })
  if (taskId === null) {
    if (decisions.length > 0) await d1.batch(eventUpdates(d1, venue.id, decisions))
    if ((spentRows[0]?.total ?? 0) + estimate > deps.budgetMicros) {
      await recordSkippedAiTask(d1, {
        venueId: venue.id,
        kind: 'classify',
        status: 'budget_exceeded',
        provider: provider.name,
        model: provider.model,
        nowIso,
        error: null,
      })
      return { status: 'unavailable', reason: 'budget' }
    }
    return { status: 'running' }
  }

  let usage: AiUsage
  let raw: unknown[]
  try {
    ;({ results: raw, usage } = await provider.classifyTitles(venue.name, remaining))
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError('api', String(error))
    await d1.batch([
      ...eventUpdates(d1, venue.id, decisions),
      finishAiTask(d1, taskId, {
        status: 'failed',
        finished: current(),
        expires: null,
        usage: e.usage,
        candidates: remaining.length,
        verified: 0,
        error: `${e.kind}: ${e.message}`,
      }),
    ])
    return { status: 'unavailable', reason: 'error' }
  }

  const answered = new Map<number, { category: 'live' | 'non_live'; reason: string | null }>()
  for (const row of raw) {
    const parsed = classificationSchema.safeParse(row)
    if (parsed.success && parsed.data.index < remaining.length && !answered.has(parsed.data.index)) {
      answered.set(parsed.data.index, parsed.data)
    }
  }
  const createdAt = current().toISOString()
  const cacheRows: unknown[][] = []
  for (const [index, a] of answered) {
    const title = remaining[index]
    decisions.push({ title, category: a.category, method: 'ai' })
    cacheRows.push([titleHashOf(title), title, a.category, a.reason, provider.model, createdAt])
  }
  const writes: D1PreparedStatement[] = []
  for (let i = 0; i < cacheRows.length; i += CACHE_ROWS_PER_INSERT) {
    const chunk = cacheRows.slice(i, i + CACHE_ROWS_PER_INSERT)
    const values = chunk.map(() => "(?, ?, ?, 'ai', ?, ?, ?)").join(', ')
    // 手動で決めた行は上書きしない
    writes.push(
      d1
        .prepare(
          `INSERT INTO classification_cache (title_hash, title, category, method, reason, model, created_at) VALUES ${values} ON CONFLICT(title_hash) DO NOTHING`,
        )
        .bind(...chunk.flat()),
    )
  }
  writes.push(...eventUpdates(d1, venue.id, decisions))
  writes.push(
    finishAiTask(d1, taskId, {
      status: 'succeeded',
      finished: current(),
      expires: null,
      usage,
      candidates: remaining.length,
      verified: answered.size,
      error: null,
    }),
  )
  await d1.batch(writes)
  return { status: 'classified', changed: decisions.length }
}
