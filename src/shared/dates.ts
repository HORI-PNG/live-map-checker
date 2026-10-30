// 日付の扱い（サーバー・ブラウザ共通）。公演日は JST の 'YYYY-MM-DD' 文字列で持ち、Date の比較はしない
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** いまの日本時間の日付（'YYYY-MM-DD'）。サーバーのタイムゾーンに左右されない */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** JST のその日の 0 時（UTC の ISO 文字列）。「今日の AI 使用額」などの集計に使う */
export function jstDayStartIso(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00+09:00`)).toISOString()
}

/** 'YYYY-MM-DD' に日数を足す */
export function addDays(date: string, days: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** 表示用に分解する（例: { year: 2026, month: 11, day: 7, weekday: '土' }） */
export function dateParts(date: string) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return { year, month, day, weekday }
}

/** 月ごとの見出し（例: '2026年11月'） */
export function monthLabel(date: string): string {
  const { year, month } = dateParts(date)
  return `${year}年${month}月`
}
