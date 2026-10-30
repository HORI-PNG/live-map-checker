// 熊本城ホールのイベントカレンダー。1か月分が1ページ（/event/YYYYMM.html）。予定の無い月はページが無い（404）
// 確認記録: src/server/db/seed/data.ts の VENUE_POLICIES（robots.txt なし、利用規約のページなし）
import {
  addMonths,
  decodeEntities,
  type PageSpec,
  type ScraperAdapter,
  toDetailUrl,
  toTime,
  validateEvents,
} from '../types'

const MONTHS_AHEAD = 6
const BASE_URL = 'https://www.kumamoto-jo-hall.jp/event/'

type Row = { date: string; title: string; subTitle: string; info: string; url: string }

/** 「【公演延期】」「【中止】」などが付いた公演は、その日に行われないので載せない */
const CALLED_OFF = /中止|延期/
/**
 * 1行目がアーティスト名ではないもの: 公演名そのもの（年・LIVE・ツアーなど）、催しの冠（令和○年・復興・記念など）、
 * 次の行に続く書き方（「兵動大樹の」「佐野元春 &」）
 */
const NOT_ARTIST =
  /\d{4}|live|tour|ライブ|ツアー|公演|コンサート|令和|平成|復興|支援|記念|周年|^[～〜~「『【]|[&＆×・の～〜]$/i

export const kumamotoJoHallAdapter: ScraperAdapter = {
  key: 'kumamoto-jo-hall',
  version: 1,
  futureNotFoundIsEmpty: true,

  pages(_config, today) {
    const pages: PageSpec[] = []
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const key = addMonths(today.slice(0, 7), i)
      pages.push({ key, url: `${BASE_URL}${key.replace('-', '')}.html` })
    }
    return pages
  },

  async parse(html, { pageUrl }) {
    const rows: Row[] = []
    let current: Row | null = null
    await new HTMLRewriter()
      .on('#event_list .list > .item', {
        element(el) {
          current = { date: '', title: '', subTitle: '', info: '', url: '' }
          rows.push(current)
          el.onEndTag(() => {
            current = null
          })
        },
      })
      .on('#event_list .list > .item time.date', {
        text(chunk) {
          if (current) current.date += chunk.text
        },
      })
      .on('#event_list .list > .item h4.ttl', {
        // 公演名は <br> で改行されている（</br> と書かれていることもある）。文字のかたまりの終わりを改行とみなす
        text(chunk) {
          if (!current) return
          current.title += chunk.text
          if (chunk.lastInTextNode) current.title += '\n'
        },
      })
      .on('#event_list .list > .item .sub-ttl', {
        text(chunk) {
          if (current) current.subTitle += chunk.text
        },
      })
      .on('#event_list .list > .item .bottom dl', {
        text(chunk) {
          if (current) current.info += chunk.text
        },
      })
      .on('#event_list .list > .item .bottom .btn a', {
        element(el) {
          if (current && !current.url) current.url = decodeEntities(el.getAttribute('href') ?? '')
        },
      })
      .transform(new Response(html))
      .arrayBuffer()

    const parsed: unknown[] = []
    for (const r of rows) {
      const lines = decodeEntities(r.title)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (lines.some((line) => /^【.*】$/.test(line) && CALLED_OFF.test(line))) continue
      const nameLines = lines.filter((line) => !/^【.*】$/.test(line))
      const subTitle = decodeEntities(r.subTitle).trim()
      if (subTitle) nameLines.push(subTitle)
      const artist = nameLines.length >= 2 && !NOT_ARTIST.test(nameLines[0]) ? nameLines[0] : null
      const date = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(r.date.normalize('NFKC'))
      const info = decodeEntities(r.info).normalize('NFKC')
      parsed.push({
        title: nameLines.join(' '),
        artistName: artist,
        tourName: artist ? nameLines.slice(1).join(' ') : null,
        // 複数日の催しは初日だけ（会場のページでも公演ごとに分けて載っていることが多い）
        date: date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : '',
        openTime: toTime(/開場\s*(\d{1,2}:\d{2})/.exec(info)?.[1]),
        startTime: toTime(/開演\s*(\d{1,2}:\d{2})/.exec(info)?.[1]),
        // 「イベントサイト」は主催者のサイトへのリンク
        detailUrl: toDetailUrl(r.url, pageUrl, { otherHosts: true }),
        venueCategory: null,
      })
    }
    return validateEvents(parsed)
  },
}
