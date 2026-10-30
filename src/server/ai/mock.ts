// テスト・PR プレビュー用の AI（固定の候補）。出典ページも固定の HTML を返し、本物のネットワークに出ない。
// 1件は出典に書かれていない候補にして、検証で落ちることを確かめられるようにする
import { addDays } from '@/shared/dates'
import type { AiProvider, VenueSearchInput } from './types'

// 出典の検証は別の呼び出しで行うので、出典ページは URL だけから作れるようにする（検索の開始日を URL に入れる）
const SOURCE_URL = 'https://mock.example/schedule'
export const MOCK_WRONG_URL = 'https://mock.example/other'

function candidates(input: VenueSearchInput) {
  const day = (n: number) => addDays(input.from, n)
  const source = `${SOURCE_URL}?from=${input.from}`
  return [
    {
      artist: 'モック・アーティスト',
      title: 'モック・アーティスト LIVE TOUR 2026',
      tour: 'LIVE TOUR 2026',
      date: day(10),
      open: '17:00',
      start: '18:00',
      source_url: source,
    },
    {
      artist: 'MOCK BAND',
      title: 'MOCK BAND ONE-MAN SHOW',
      tour: null,
      date: day(40),
      open: null,
      start: '19:00',
      source_url: source,
    },
    // 出典に書かれていない（検証で落ちる）
    {
      artist: '架空の出演者',
      title: '架空の公演',
      tour: null,
      date: day(20),
      open: null,
      start: null,
      source_url: MOCK_WRONG_URL,
    },
  ]
}

/** 実際の会場・プレイガイドのページに近い大きさ（約 300KB）にして、検証の CPU 時間を測れるようにする */
function sourcePage(from: string): string {
  const [y1, m1, d1] = addDays(from, 10).split('-').map(Number)
  const [, m2, d2] = addDays(from, 40).split('-').map(Number)
  const filler = '<div class="item"><p>ダミーの文章です。公演情報とは関係ありません。</p></div>\n'.repeat(3000)
  return `<!doctype html><html><head><title>モックのスケジュール</title>
<script>var tracking = "モック・アーティスト ${y1}年1月1日";</script><style>.x{}</style></head><body>
${filler}<h2>${y1}年のスケジュール</h2>
<ul><li>${y1}年${m1}月${d1}日 モック・アーティスト LIVE TOUR 2026 開場17:00 開演18:00</li>
<li>${m2}/${d2}(土) MOCK BAND ONE-MAN SHOW 開演19:00</li></ul>${filler}</body></html>`
}

export function createMockProvider(): AiProvider {
  return {
    name: 'mock',
    model: 'mock',
    estimateCostMicros: () => 0,
    async searchVenueEvents(input) {
      // 画面の「検索中」の表示を確かめられるよう、少しだけ待つ
      await new Promise((resolve) => setTimeout(resolve, 800))
      return {
        candidates: candidates(input),
        usage: { inputTokens: 0, outputTokens: 0, webSearchCount: 0, costUsdMicros: 0 },
      }
    },
    async fetchSource(url) {
      const parsed = new URL(url)
      const from = parsed.searchParams.get('from') ?? ''
      if (`${parsed.origin}${parsed.pathname}` === SOURCE_URL && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return new Response(sourcePage(from), { headers: HTML })
      }
      if (url === MOCK_WRONG_URL) return new Response('<html><body>関係のないページ</body></html>', { headers: HTML })
      return new Response('not found', { status: 404 })
    },
  }
}

const HTML = { 'content-type': 'text/html; charset=utf-8' }
