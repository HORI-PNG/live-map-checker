// AI の呼び出しの記録（ai_searches）。費用の予約・日次上限の確認・二重起動の防止を、検索とライブ判定で共通に使う
import type { AI_TASK_KINDS } from '../db/schema'
import type { AiUsage } from './types'

type Kind = (typeof AI_TASK_KINDS)[number]

// 行を作るのは「同じ会場・同じ種類で実行中（running）が無い」かつ「今日の合計（実行中の分の見積もりを含む）＋見積もり ≦ 上限」
// のときだけ。1文で確かめるので、同時に開かれても上限を超えて走り出さない。
// 見積もり額を先に cost_usd_micros に入れておき（予約）、終わったら実際の額で上書きする。途中で止まっても予算に数えられる
const CLAIM_SQL = `INSERT INTO ai_searches (venue_id, kind, status, provider, model, started_at, cost_usd_micros)
  SELECT ?1, ?2, 'running', ?3, ?4, ?5, ?7
  WHERE NOT EXISTS (
      SELECT 1 FROM ai_searches WHERE venue_id = ?1 AND kind = ?2 AND status = 'running' AND started_at > ?6)
    AND (SELECT coalesce(sum(cost_usd_micros), 0) FROM ai_searches WHERE started_at >= ?8) + ?7 <= ?9
  RETURNING id`

const FINISH_SQL = `UPDATE ai_searches SET status = ?2, finished_at = ?3, expires_at = ?4, input_tokens = ?5,
  output_tokens = ?6, web_search_count = ?7, cost_usd_micros = ?8, candidates = ?9, verified = ?10, error = ?11
  WHERE id = ?1`

const INSERT_FINISHED_SQL = `INSERT INTO ai_searches (venue_id, kind, status, provider, model, started_at, finished_at, error)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)`

export type ClaimInput = {
  venueId: number
  kind: Kind
  provider: string
  model: string
  nowIso: string
  /** これより後に始まった running があれば、実行中とみなす */
  runningSinceIso: string
  estimateMicros: number
  dayStartIso: string
  budgetMicros: number
}

/** 実行の行を作る。作れなければ null（実行中の人がいるか、予算を超える） */
export async function claimAiTask(d1: D1Database, c: ClaimInput): Promise<number | null> {
  const row = await d1
    .prepare(CLAIM_SQL)
    .bind(
      c.venueId,
      c.kind,
      c.provider,
      c.model,
      c.nowIso,
      c.runningSinceIso,
      c.estimateMicros,
      c.dayStartIso,
      c.budgetMicros,
    )
    .first<{ id: number }>()
  return row?.id ?? null
}

export type FinishInput = {
  status: 'succeeded' | 'failed'
  finished: Date
  expires: Date | null
  usage: AiUsage
  /** 検索: 候補の数 / ライブ判定: AI に聞いたタイトルの数 */
  candidates: number
  /** 検索: 出典で確かめられた数 / ライブ判定: 判定できた数 */
  verified: number
  error: string | null
}

export function finishAiTask(d1: D1Database, id: number, f: FinishInput): D1PreparedStatement {
  return d1
    .prepare(FINISH_SQL)
    .bind(
      id,
      f.status,
      f.finished.toISOString(),
      f.expires?.toISOString() ?? null,
      f.usage.inputTokens,
      f.usage.outputTokens,
      f.usage.webSearchCount,
      f.usage.costUsdMicros,
      f.candidates,
      f.verified,
      f.error?.slice(0, 500) ?? null,
    )
}

/** AI を呼ばなかった失敗・予算超過を1行で記録する */
export async function recordSkippedAiTask(
  d1: D1Database,
  r: {
    venueId: number
    kind: Kind
    status: 'failed' | 'budget_exceeded'
    provider: string
    model: string
    nowIso: string
    error: string | null
  },
) {
  await d1
    .prepare(INSERT_FINISHED_SQL)
    .bind(r.venueId, r.kind, r.status, r.provider, r.model, r.nowIso, r.error?.slice(0, 500) ?? null)
    .run()
}
