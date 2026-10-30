// AI の提供元に依存しない型（docs/plan.md 4.1）。提供元は provider.ts で選ぶ
import { z } from 'zod'

const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()

/** AI が見つけた公演の候補。出典の検証（verify.ts）を通ったものだけ表示する */
export const eventCandidateSchema = z.object({
  artist: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  tour: z.string().trim().max(300).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  open: time,
  start: time,
  source_url: z.string().url().max(2000),
})
export type EventCandidate = z.infer<typeof eventCandidateSchema>

export type VenueSearchInput = {
  venueName: string
  area: string
  prefectureName: string
  officialUrl: string
  scheduleUrl: string | null
  /** 探す期間（JST の YYYY-MM-DD） */
  from: string
  to: string
}

export type AiUsage = {
  inputTokens: number
  outputTokens: number
  webSearchCount: number
  costUsdMicros: number
}

export const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, webSearchCount: 0, costUsdMicros: 0 }

export interface AiProvider {
  name: string
  model: string
  /** 1回の検索の費用の見積もり（予算の確認に使う。マイクロドル） */
  estimateCostMicros(): number
  /** 候補は検証前の生の値（zod で検証するのは呼び出し側） */
  searchVenueEvents(input: VenueSearchInput): Promise<{ candidates: unknown[]; usage: AiUsage }>
  /** 出典ページの取得を差し替える（mock 用。本物は fetch） */
  fetchSource?: (url: string) => Promise<Response>
}

export type AiErrorKind = 'unavailable' | 'refusal' | 'invalid_response' | 'api'

/** 失敗しても費用がかかっていれば usage を持たせて記録する */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly usage: AiUsage = ZERO_USAGE,
  ) {
    super(message)
  }
}
