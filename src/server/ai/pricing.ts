// 料金（2026-10 時点の公表価格。docs/plan.md 4.4）。トークン数 × 「1M トークンあたりのドル」= マイクロドル
import type { AiUsage } from './types'

type Price = { input: number; output: number }

const PRICES: Record<string, Price> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
}
/** 表に無いモデルは高めに見積もる（予算を超えにくい側に倒す） */
const FALLBACK_PRICE: Price = { input: 10, output: 50 }

/** Web 検索は 1,000 回あたり $10 */
export const WEB_SEARCH_MICROS = 10_000

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  webSearchCount: number
}

export function costMicros(model: string, u: TokenUsage): number {
  const price = PRICES[model] ?? FALLBACK_PRICE
  const input =
    u.inputTokens * price.input +
    (u.cacheCreationTokens ?? 0) * price.input * 1.25 +
    (u.cacheReadTokens ?? 0) * price.input * 0.1
  return Math.ceil(input + u.outputTokens * price.output + u.webSearchCount * WEB_SEARCH_MICROS)
}

/** 1回の会場検索の見積もり: 検索3回・入力約25k・出力約4k トークン（docs/plan.md 4.4） */
export function estimateSearchMicros(model: string): number {
  return costMicros(model, { inputTokens: 25_000, outputTokens: 4_000, webSearchCount: 3 })
}

/** ライブ判定の見積もり: 指示 約1.5k ＋ 1件あたり入力 60・出力 80 トークン（考える分の余裕 1k を足す） */
export function estimateClassifyMicros(model: string, count: number): number {
  return costMicros(model, { inputTokens: 1_500 + 60 * count, outputTokens: 1_000 + 80 * count, webSearchCount: 0 })
}

export function usageOf(model: string, u: TokenUsage): AiUsage {
  return {
    inputTokens: u.inputTokens + (u.cacheCreationTokens ?? 0) + (u.cacheReadTokens ?? 0),
    outputTokens: u.outputTokens,
    webSearchCount: u.webSearchCount,
    costUsdMicros: costMicros(model, u),
  }
}
