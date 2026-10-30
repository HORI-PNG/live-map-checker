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

type Row = { date: string; caption: string; title: string; subTitle: string; info: string; url: string }

/** 公演名の改行（<br>。</br> と書かれていることもある）を、解析の前にこの文字に置き換える */
const LINE_BREAK = '\uE000'
/** 公演名に付いた【】の印 */
const MARK = /【[^】]*】/g
/**
 * 「【公演延期】」「【中止】」などが付いた公演は、その日に行われないので載せない。
 * 「【延期公演】」「【延期振替公演】」は新しい日程で行う公演なので載せる
 */
const CALLED_OFF = /中止|延期(?!公演|振替)/
/**
 * 1行目がアーティスト名ではないもの: 公演名そのもの（年・LIVE・ツアーなど）、催しの冠（令和○年・復興・記念など）、
 * 次の行に続く書き方（「兵動大樹の」「佐野元春 &」）
 */
const NOT_ARTIST =
  /\d{4}|(?<![a-z])(?:live|tour)(?![a-z])|ライブ|ツアー|公演|コンサート|令和|平成|復興|支援|記念|周年|^[～〜~「『]|[&＆×・の～〜]$/i

/** ソースの改行・字下げを空白1つにする */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

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
    let inCaption = false
    await new HTMLRewriter()
      .on('#event_list .list > .item', {
        element(el) {
          current = { date: '', caption: '', title: '', subTitle: '', info: '', url: '' }
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
        text(chunk) {
          if (current && !inCaption) current.title += chunk.text
        },
      })
      // display:block の span は、<br> が無くても別の行。公演名より前にあるものは小さな冠
      // （「令和８年熊本地震復興支援」「人を笑顔にするトランペッター」）、後ろにあるものは出演者などの続き
      .on('#event_list .list > .item h4.ttl > span[style*="block"]', {
        element(el) {
          if (!current) return
          const row = current
          if (row.title.trim()) {
            row.title += LINE_BREAK
            el.onEndTag(() => {
              row.title += LINE_BREAK
            })
            return
          }
          inCaption = true
          el.onEndTag(() => {
            inCaption = false
          })
        },
        text(chunk) {
          if (current && inCaption) current.caption += chunk.text
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
      .transform(new Response(html.replace(/<\/?br\s*\/?>/gi, LINE_BREAK)))
      .arrayBuffer()

    const parsed: unknown[] = []
    for (const r of rows) {
      const title = decodeEntities(r.title)
      const caption = clean(decodeEntities(r.caption).replace(MARK, '').replaceAll(LINE_BREAK, ' '))
      if (`${r.caption}${title}`.match(MARK)?.some((mark) => CALLED_OFF.test(mark))) continue
      // 印は公演名から外す
      const nameLines = title.replace(MARK, '').split(LINE_BREAK).map(clean).filter(Boolean)
      const subTitle = clean(decodeEntities(r.subTitle).replaceAll(LINE_BREAK, ' '))
      if (subTitle) nameLines.push(subTitle)
      const artist = nameLines.length >= 2 && !NOT_ARTIST.test(nameLines[0]) ? nameLines[0] : null
      const date = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(r.date.normalize('NFKC'))
      const info = decodeEntities(r.info).normalize('NFKC')
      parsed.push({
        title: [caption, ...nameLines].filter(Boolean).join(' '),
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
