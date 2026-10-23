// PR 1 の CPU 時間の実測用（docs/plan.md 10章）。計測が終わったら bench ごと削除する。
import zeppHtml from '../../../tests/fixtures/zepp/fukuoka-2026-11.html?raw'

type ZeppEvent = {
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
} as const satisfies Record<string, keyof ZeppEvent>

/** 取得ルールの代表: Zepp の1か月分の HTML から公演を抜き出す */
export async function parseZeppFixture(): Promise<ZeppEvent[]> {
  const events: ZeppEvent[] = []
  let current: ZeppEvent | null = null
  let rewriter = new HTMLRewriter().on('a.sch-content', {
    element(el) {
      current = {
        url: el.getAttribute('href') ?? '',
        year: '',
        monthDay: '',
        performer: '',
        title: '',
        open: '',
        start: '',
      }
      events.push(current)
    },
  })
  for (const [selector, key] of Object.entries(FIELDS)) {
    rewriter = rewriter.on(selector, {
      text(chunk) {
        if (current) current[key] += chunk.text
      },
    })
  }
  await rewriter.transform(new Response(zeppHtml)).arrayBuffer()
  return events.map((e) => ({
    ...e,
    performer: e.performer.trim(),
    title: e.title.trim(),
    monthDay: e.monthDay.trim(),
  }))
}

/** 出典検証の代表: ページ本文を取り出して正規化し、アーティスト名と日付を探す */
export async function verifyFixture(artist: string, isoDate: string): Promise<{ artist: boolean; date: boolean }> {
  const parts: string[] = []
  let skip = 0
  await new HTMLRewriter()
    .on('script, style, noscript', {
      element(el) {
        skip++
        el.onEndTag(() => {
          skip--
        })
      },
    })
    .on('body *', {
      text(chunk) {
        if (skip === 0) parts.push(chunk.text)
      },
    })
    .transform(new Response(zeppHtml))
    .arrayBuffer()
  const text = normalize(parts.join(' '))
  const [y, m, d] = isoDate.split('-').map(Number)
  const dateForms = [`${y}年${m}月${d}日`, `${y}/${m}/${d}`, `${y}.${m}.${d}`, `${m}.${d}`, `${m}月${d}日`].map(
    normalize,
  )
  return { artist: text.includes(normalize(artist)), date: dateForms.some((f) => text.includes(f)) }
}

function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･!?'"&\-_/×]/g, '')
}
