// Zepp（Fukuoka / Osaka Bayside / Namba）のスケジュール。1か月分が1ページ（?_y=YYYY&_m=M）
// 確認記録: src/server/db/seed/data.ts の VENUE_POLICIES（robots.txt は /wp-admin/ だけ禁止、規約に禁止条項なし）
import { addMonths, decodeEntities, type PageSpec, type ScraperAdapter, toTime, validateEvents } from '../types'

const MONTHS_AHEAD = 6

type Row = {
  url: string
  year: string
  monthDay: string
  performer: string
  title: string
  open: string
  start: string
}

const FIELDS = {
  '.sch-content-date__year': 'year',
  '.sch-content-date__month': 'monthDay',
  '.sch-content-text__performer': 'performer',
  '.sch-content-text__ttl': 'title',
  '.sch-content-text-date__open': 'open',
  '.sch-content-text-date__start': 'start',
} as const satisfies Record<string, keyof Row>

export const zeppAdapter: ScraperAdapter = {
  key: 'zepp',
  version: 1,

  pages(config, today) {
    const hall = typeof config?.hall === 'string' ? config.hall : null
    if (!hall || !/^[a-z]+$/.test(hall)) throw new Error('zepp: scraper_config.hall がありません')
    const pages: PageSpec[] = []
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const key = addMonths(today.slice(0, 7), i)
      const [y, m] = key.split('-').map(Number)
      pages.push({ key, url: `https://www.zepp.co.jp/hall/${hall}/schedule/?_y=${y}&_m=${m}` })
    }
    return pages
  },

  async parse(fullHtml, { pageUrl }) {
    // ページ全体（約370KB）ではなく、公演一覧の部分だけを解析して CPU 時間を節約する
    const start = fullHtml.indexOf('sch-contentWrap')
    const html = start >= 0 ? fullHtml.slice(fullHtml.lastIndexOf('<', start)) : fullHtml
    const rows: Row[] = []
    let current: Row | null = null
    let rewriter = new HTMLRewriter().on('a.sch-content', {
      element(el) {
        current = {
          // 属性の値も文字参照（&amp; など）のままなので戻す
          url: decodeEntities(el.getAttribute('href') ?? ''),
          year: '',
          monthDay: '',
          performer: '',
          title: '',
          open: '',
          start: '',
        }
        rows.push(current)
        // 公演のリンクの外にある同じ名前の要素（おすすめ欄など）を、最後の公演に混ぜない
        el.onEndTag(() => {
          current = null
        })
      },
    })
    for (const [selector, key] of Object.entries(FIELDS)) {
      rewriter = rewriter.on(selector, {
        text(chunk) {
          if (current) current[key] += chunk.text
        },
      })
    }
    await rewriter.transform(new Response(html)).arrayBuffer()

    return validateEvents(
      rows.map((r) => {
        const [month, day] = r.monthDay.trim().split('.').map(Number)
        const performer = decodeEntities(r.performer).trim() || null
        const title = decodeEntities(r.title).trim() || performer || ''
        return {
          title,
          artistName: performer,
          tourName: performer && title !== performer ? title : null,
          date: `${r.year.trim()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          openTime: toTime(r.open),
          startTime: toTime(r.start),
          detailUrl: r.url ? new URL(r.url, pageUrl).toString() : null,
          venueCategory: null,
        }
      }),
    )
  },
}
