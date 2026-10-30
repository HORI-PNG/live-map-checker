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
  // ルールで決まらないタイトル（多目的ホールなので、AI のライブ判定（mock）で live になるまで表示しない）
  {
    venue: 'kumamoto-jo-hall',
    inDays: 12,
    artist: 'アーティスト J',
    title: 'アーティスト J スペシャルナイト',
    open: '17:00',
    start: '18:00',
    category: 'unknown',
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

/** 1要素 = 1文。fingerprint（会場とタイトル）で冪等。流し直すと、日付を含むすべての項目を最新にする */
export function buildSampleEventStatements(today: string = todayJst()): string[] {
  const fingerprintOf = (s: Sample) => `sample:${s.venue}:${s.title}`
  // 一覧から外した・鍵の形を変えたサンプルは消す（本物の公演の fingerprint は 'sample:' で始まらない）
  const cleanup = `DELETE FROM events WHERE fingerprint LIKE 'sample:%' AND fingerprint NOT IN (${SAMPLES.map((s) => q(fingerprintOf(s))).join(', ')});`
  const upserts = SAMPLES.map((s, i) => {
    const fingerprint = fingerprintOf(s)
    const date = addDays(today, s.inDays)
    const kind = s.ai ? 'ai' : 'scrape'
    const category = s.category ?? 'live'
    return `INSERT INTO events (venue_id, source_kind, title, artist_name, tour_name, date, open_time, start_time, detail_url, source_url, source_label, category, classified_by, fingerprint) VALUES ((SELECT id FROM venues WHERE slug = ${q(s.venue)}), ${q(kind)}, ${q(s.title)}, ${q(s.artist)}, ${q(s.tour)}, ${q(date)}, ${q(s.open)}, ${q(s.start)}, 'https://example.com/event/${i + 1}', ${q(s.ai?.sourceUrl)}, ${q(s.ai?.sourceLabel)}, ${q(category)}, 'rule', ${q(fingerprint)}) ON CONFLICT(fingerprint) DO UPDATE SET source_kind = excluded.source_kind, title = excluded.title, artist_name = excluded.artist_name, tour_name = excluded.tour_name, date = excluded.date, open_time = excluded.open_time, start_time = excluded.start_time, detail_url = excluded.detail_url, source_url = excluded.source_url, source_label = excluded.source_label, category = excluded.category, is_active = 1;`
  })
  return [cleanup, ...upserts, ...aiStateStatements()]
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

/**
 * AI 検索の状態をそろえる（E2E が毎回同じ画面になるように）。
 * - AI の検索結果・ライブ判定（mock）と記録を消す
 * - サンプル公演を置いた AI の会場は「24時間以内に検索済み」にする（開いても AI 検索が走らない）
 * - 自動取得の会場は「取得に成功している」ことにする（AI で補う対象にしない）。staging の本物の記録は上書きしない
 * それ以外の AI の会場（みずほPayPayドームなど）は、開くと AI 検索（mock）が走る
 */
function aiStateStatements(): string[] {
  const aiVenuesWithSamples = [...new Set(SAMPLES.map((s) => s.venue))]
  return [
    'UPDATE events SET ai_search_id = NULL WHERE ai_search_id IS NOT NULL;',
    "DELETE FROM events WHERE source_kind = 'ai' AND fingerprint NOT LIKE 'sample:%';",
    'DELETE FROM ai_verifications;',
    "DELETE FROM classification_cache WHERE method = 'ai';",
    'DELETE FROM ai_searches;',
    `INSERT INTO ai_searches (venue_id, status, provider, model, started_at, finished_at, expires_at)
      SELECT id, 'succeeded', 'sample', 'sample', ${NOW}, ${NOW}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days')
      FROM venues WHERE fetch_mode = 'ai_only' AND slug IN (${aiVenuesWithSamples.map(q).join(', ')});`,
    `INSERT INTO venue_fetch_state (venue_id, last_attempt_at, last_success_at, consecutive_failures)
      SELECT id, ${NOW}, ${NOW}, 0 FROM venues WHERE fetch_mode = 'scrape'
      ON CONFLICT(venue_id) DO NOTHING;`,
  ]
}
