// 開発（ローカル）と PR プレビュー（staging）用のサンプル公演。本番には入れない。
// 日付はシードを流した日からの相対で作るので、いつ流しても「これからの公演」になる
import { addDays, todayJst } from '../../../shared/dates.ts'

type Sample = {
  venue: string
  inDays: number
  artist: string
  title: string
  tour?: string
  open?: string
  start: string
  category?: 'live' | 'non_live' | 'unknown'
  ai?: { sourceUrl: string; sourceLabel: string }
}

const SAMPLES: Sample[] = [
  {
    venue: 'marine-messe-fukuoka',
    inDays: 8,
    artist: 'アーティスト A',
    title: 'アーティスト A LIVE',
    tour: '[ツアー名] 2026',
    open: '17:00',
    start: '18:00',
  },
  {
    venue: 'marine-messe-fukuoka',
    inDays: 15,
    artist: 'アーティスト B',
    title: 'アーティスト B TOUR',
    tour: '[ツアー名] 2026',
    open: '16:30',
    start: '17:30',
  },
  {
    venue: 'marine-messe-fukuoka',
    inDays: 23,
    artist: 'アーティスト C',
    title: 'アーティスト C CONCERT',
    tour: '[ツアー名] 2026',
    start: '18:00',
    ai: { sourceUrl: 'https://example.com/artist-c/tour', sourceLabel: 'example.com' },
  },
  {
    venue: 'marine-messe-fukuoka',
    inDays: 29,
    artist: 'アーティスト D',
    title: 'アーティスト D LIVE',
    tour: '[ツアー名] 2026',
    open: '17:00',
    start: '18:00',
  },
  {
    venue: 'marine-messe-fukuoka',
    inDays: 40,
    artist: 'アーティスト E',
    title: 'アーティスト E ワンマン',
    open: '17:30',
    start: '18:30',
  },
  {
    venue: 'marine-messe-fukuoka',
    inDays: 12,
    artist: '',
    title: '福岡○○学会 学術大会',
    start: '09:00',
    category: 'non_live',
  },
  { venue: 'marine-messe-fukuoka', inDays: -3, artist: 'アーティスト Z', title: '終わった公演', start: '18:00' },
  {
    venue: 'zepp-fukuoka',
    inDays: 2,
    artist: 'アーティスト F',
    title: 'アーティスト F TOUR 2026',
    open: '18:00',
    start: '19:00',
  },
  {
    venue: 'zepp-fukuoka',
    inDays: 9,
    artist: 'アーティスト G',
    title: 'アーティスト G LIVE HOUSE TOUR',
    open: '18:00',
    start: '19:00',
    category: 'unknown',
  },
  {
    venue: 'zepp-namba',
    inDays: 5,
    artist: 'アーティスト H',
    title: 'アーティスト H 2026',
    open: '18:00',
    start: '19:00',
  },
  {
    venue: 'kyocera-dome-osaka',
    inDays: 20,
    artist: 'アーティスト I',
    title: 'アーティスト I DOME TOUR',
    open: '16:00',
    start: '18:00',
  },
]

const q = (v: string | null | undefined) =>
  v === null || v === undefined || v === '' ? 'NULL' : `'${v.replaceAll("'", "''")}'`

/** 1要素 = 1文。fingerprint で冪等（流し直すと日付が今日基準に更新される） */
export function buildSampleEventStatements(today: string = todayJst()): string[] {
  return SAMPLES.map((s, i) => {
    const date = addDays(today, s.inDays)
    const kind = s.ai ? 'ai' : 'scrape'
    const category = s.category ?? 'live'
    return `INSERT INTO events (venue_id, source_kind, title, artist_name, tour_name, date, open_time, start_time, detail_url, source_url, source_label, category, classified_by, fingerprint) VALUES ((SELECT id FROM venues WHERE slug = ${q(s.venue)}), ${q(kind)}, ${q(s.title)}, ${q(s.artist)}, ${q(s.tour)}, ${q(date)}, ${q(s.open)}, ${q(s.start)}, 'https://example.com/event/${i + 1}', ${q(s.ai?.sourceUrl)}, ${q(s.ai?.sourceLabel)}, ${q(category)}, 'rule', 'sample:${i + 1}') ON CONFLICT(fingerprint) DO UPDATE SET date = excluded.date, is_active = 1;`
  })
}
