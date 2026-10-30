// 会場ごとの取得ルールの形（docs/plan.md 3.1）。会場の違いは venues.scraper_config に持つ
import { z } from 'zod'

export const rawEventSchema = z.object({
  title: z.string().trim().min(1).max(300),
  artistName: z.string().trim().max(200).nullable(),
  tourName: z.string().trim().max(300).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  detailUrl: z.string().url().nullable(),
  /** 会場サイトにジャンルの表示があれば（「コンサート」「スポーツ」など） */
  venueCategory: z.string().nullable(),
})
export type RawEvent = z.infer<typeof rawEventSchema>

export type PageSpec = { key: string; url: string }

export type ParseResult = { events: RawEvent[]; invalid: number }

export interface ScraperAdapter {
  key: string
  /** 取得ルールを直したら上げる（fetch_runs に記録） */
  version: number
  /** 今日から見て取得するページ（今月〜5か月先など） */
  pages(config: Record<string, unknown> | null, today: string): PageSpec[]
  parse(html: string, ctx: { pageUrl: string; pageKey: string }): Promise<ParseResult>
}

/** 抽出した行を検証し、不正な行は数えて捨てる */
export function validateEvents(rows: unknown[]): ParseResult {
  const events: RawEvent[] = []
  let invalid = 0
  for (const row of rows) {
    const parsed = rawEventSchema.safeParse(row)
    if (parsed.success) events.push(parsed.data)
    else invalid++
  }
  return { events, invalid }
}

/** 'YYYY-MM' から n か月後 */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** 'H:MM' や '18:00〜' から 'HH:MM' を取り出す */
export function toTime(text: string | null | undefined): string | null {
  const match = /(\d{1,2}):(\d{2})/.exec(text ?? '')
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  yen: '¥',
  hellip: '…',
  ndash: '–',
  mdash: '—',
}

/** HTMLRewriter が返す文字は文字参照（&quot; など）のままなので、元の文字に戻す */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}
