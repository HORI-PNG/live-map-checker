// AI 検索の状態（docs/plan.md 2章「AIで補完する会場か」・4.2）。会場画面の読み出しと AI 検索の両方で使う
import { desc, eq, type SQL, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { aiSearches, type FETCH_MODES, venueFetchState } from '../db/schema'

export const AI_RESULT_TTL_MS = 24 * 60 * 60 * 1000
/**
 * これより古い running は、途中で止まったものとみなす。1回の検索は最長 約3分
 * （Claude の呼び出し 60 秒 × 最大 3 回。anthropic.ts）なので、それより長くする
 */
export const RUNNING_TIMEOUT_MS = 5 * 60 * 1000
/** 失敗・予算超過のあと、この間は検索し直さない（開くたびに失敗して費用がかかるのを防ぐ） */
export const RETRY_AFTER_MS = 30 * 60 * 1000
/** 自動取得がこれより長く成功していなければ AI で補う */
const SCRAPE_STALE_MS = 48 * 60 * 60 * 1000

export type AiSearchRow = {
  id: number
  status: 'running' | 'succeeded' | 'failed' | 'budget_exceeded'
  startedAt: string
  finishedAt: string | null
  expiresAt: string | null
}
export type FetchStateRow = { lastSuccessAt: string | null; consecutiveFailures: number }

export type AiView =
  | { needed: false }
  | {
      needed: true
      /** fresh: 24時間以内の結果あり / running: 検索中 / due: 検索してよい / unavailable: 失敗・予算超過の直後 */
      status: 'fresh' | 'running' | 'due' | 'unavailable'
      /** 最後に検索が成功した日時（「最終確認」の表示に使う） */
      checkedAt: string | null
      reason: 'budget' | 'error' | null
    }

export function needsAi(fetchMode: (typeof FETCH_MODES)[number], state: FetchStateRow | null, now: Date): boolean {
  if (fetchMode === 'ai_only') return true
  if (fetchMode !== 'scrape') return false
  if (!state?.lastSuccessAt) return true
  return Date.parse(state.lastSuccessAt) < now.getTime() - SCRAPE_STALE_MS || state.consecutiveFailures >= 2
}

export function aiView(
  needed: boolean,
  latest: AiSearchRow | null,
  lastSuccess: AiSearchRow | null,
  now: Date,
): AiView {
  if (!needed) return { needed: false }
  const t = now.getTime()
  const checkedAt = lastSuccess?.finishedAt ?? null
  if (latest?.status === 'running' && Date.parse(latest.startedAt) > t - RUNNING_TIMEOUT_MS) {
    return { needed, status: 'running', checkedAt, reason: null }
  }
  if (lastSuccess?.expiresAt && Date.parse(lastSuccess.expiresAt) > t) {
    return { needed, status: 'fresh', checkedAt, reason: null }
  }
  if (
    (latest?.status === 'failed' || latest?.status === 'budget_exceeded') &&
    Date.parse(latest.startedAt) > t - RETRY_AFTER_MS
  ) {
    return {
      needed,
      status: 'unavailable',
      checkedAt,
      reason: latest.status === 'budget_exceeded' ? 'budget' : 'error',
    }
  }
  return { needed, status: 'due', checkedAt, reason: null }
}

const searchColumns = {
  id: aiSearches.id,
  status: aiSearches.status,
  startedAt: aiSearches.startedAt,
  finishedAt: aiSearches.finishedAt,
  expiresAt: aiSearches.expiresAt,
}

/**
 * 状態を決めるための読み出し（ほかの読み出しと同じ batch に入れる）。
 * venueId は数値か、会場の id を返す副問い合わせ
 */
export function aiStateQueries(db: Db, venueId: number | SQL<number>) {
  return [
    db
      .select({
        lastSuccessAt: venueFetchState.lastSuccessAt,
        consecutiveFailures: venueFetchState.consecutiveFailures,
      })
      .from(venueFetchState)
      .where(eq(venueFetchState.venueId, venueId)),
    db
      .select(searchColumns)
      .from(aiSearches)
      .where(eq(aiSearches.venueId, venueId))
      .orderBy(desc(aiSearches.startedAt), desc(aiSearches.id))
      .limit(1),
    db
      .select(searchColumns)
      .from(aiSearches)
      .where(sql`${aiSearches.venueId} = ${venueId} AND ${aiSearches.status} = 'succeeded'`)
      .orderBy(desc(aiSearches.startedAt), desc(aiSearches.id))
      .limit(1),
  ] as const
}
