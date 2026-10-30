// AI が挙げた出典ページに、アーティスト名と公演日が本当に書かれているかを確かめる（docs/plan.md 4.3）。
// ページの文章は AI に渡さず、ここでの文字列照合だけに使う（ページに書かれた指示で AI の動きが変わらないように）
import { decodeEntities } from '../scraping/types'

const MAX_REDIRECTS = 3
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 8_000
const USER_AGENT = 'LiveMapChecker/1.0 (+https://live-map-checker.horinouchi-yuki189.workers.dev/about/data)'

export type SourceItem = { artist: string; date: string }
export type SourceCheck = {
  url: string
  httpStatus: number | null
  error: string | null
  results: { artistFound: boolean; dateFound: boolean }[]
}
export type SourceFetcher = (url: string, init?: RequestInit) => Promise<Response>

/** 社内向け・ローカルのホスト名（IP アドレスの直指定は別に拒否する） */
const PRIVATE_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/i

/**
 * 取得してよい URL か（SSRF 対策）。http/https、既定のポート、ドットを含むホスト名だけ。
 * IP アドレスの直指定・localhost・社内向けの名前・ユーザー名付きの URL は拒否する
 */
export function safeSourceUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && url.port !== '80' && url.port !== '443') return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || PRIVATE_HOST.test(host)) return null
  // IPv6（[...]）と、数字だけでできた IPv4（10 進以外の書き方も含めて URL が正規化したもの）
  if (host.startsWith('[') || /^[\d.]+$/.test(host) || /^0x/i.test(host)) return null
  return url
}

/** 本文を最大 MAX_BYTES まで読み、文字コードを判定して文字列にする */
async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => {})
  const bytes = new Uint8Array(Math.min(size, MAX_BYTES))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset)
    bytes.set(part, offset)
    offset += part.byteLength
    if (offset >= bytes.length) break
  }
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 2048))
  const charset =
    /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** リダイレクトは自分でたどり、行き先も毎回確かめる */
async function fetchPage(rawUrl: string, fetcher: SourceFetcher): Promise<{ status: number; text: string }> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = safeSourceUrl(current)
    if (!url) throw new Error(`取得できない URL: ${current.slice(0, 200)}`)
    const res = await fetcher(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain' },
    })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      current = new URL(location, url).toString()
      continue
    }
    if (res.status !== 200) {
      await res.body?.cancel()
      return { status: res.status, text: '' }
    }
    const type = res.headers.get('content-type') ?? ''
    if (type && !/text\/(html|plain)|application\/xhtml/i.test(type)) {
      await res.body?.cancel()
      throw new Error(`HTML ではありません: ${type.slice(0, 100)}`)
    }
    return { status: 200, text: await readText(res) }
  }
  throw new Error('リダイレクトが多すぎます')
}

/**
 * HTML から本文の文字だけを取り出す（script・style・コメントを除いてタグを外す）。
 * HTMLRewriter で要素ごとに処理すると大きなページで CPU 時間がかかるため、正規表現で済ませる
 */
export function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
}

/** 公演日の書き方（2026年11月7日、2026/11/07、2026.11.7、2026-11-07、11月7日、11/7(土) など） */
export function findsDate(text: string, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const M = `0?${m}`
  const D = `0?${d}`
  const withYear = new RegExp(
    `${y}\\s*年\\s*${M}\\s*月\\s*${D}\\s*日|(?<!\\d)${y}\\s*[/.\\-]\\s*${M}\\s*[/.\\-]\\s*${D}(?!\\d)`,
  )
  if (withYear.test(text)) return true
  // 年の無い書き方は、ページのどこかにその年が書かれているときだけ認める
  if (!text.includes(String(y))) return false
  const noYear = new RegExp(`(?<![\\d/.])${M}\\s*月\\s*${D}\\s*日|(?<![\\d/.])${M}\\s*[/.]\\s*${D}(?![\\d/.])`)
  return noYear.test(text)
}

/**
 * 照合用に文字をそろえる（軽い版）: 小文字にして、英数字・かな・漢字・長音以外を取り除く。
 * normalizeText（ひらがな → カタカナなど）をページ全体にかけると 300KB で約 8ms かかるため、
 * ページ側はこれだけにして、かなの違いはアーティスト名の側で両方の書き方を作って吸収する。入力は NFKC 済み
 */
export function looseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[〜~―—－]/g, 'ー')
    .replace(/[^0-9a-z\u3041-\u3096\u30a1-\u30fa\u30fc\u3400-\u9fff\uf900-\ufaff]/g, '')
}

const toKatakana = (s: string) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
const toHiragana = (s: string) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/** アーティスト名（そろえて2文字以上）がページの文字（looseText 済み）に含まれるか */
export function findsArtist(loosePage: string, artist: string): boolean {
  const name = looseText(artist.normalize('NFKC'))
  if (name.length < 2) return false
  return [name, toKatakana(name), toHiragana(name)].some((form) => loosePage.includes(form))
}

/**
 * ページの中で公演ごとにアーティスト名と日付を探す。CPU 時間を抑えるため2段階にする:
 * 1. script・style を除いただけの HTML から、そのままの表記で探す（正しい出典ならたいていここで見つかる）
 * 2. 見つからなかった公演だけ、タグを外して表記ゆれをそろえた文字で探し直す
 */
export function checkItems(html: string, items: SourceItem[]): SourceCheck['results'] {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .normalize('NFKC')
  const lower = body.toLowerCase()
  const results = items.map((item) => {
    const name = item.artist.normalize('NFKC').toLowerCase().trim()
    return {
      artistFound: name.length >= 2 && [name, toKatakana(name), toHiragana(name)].some((f) => lower.includes(f)),
      dateFound: findsDate(body, item.date),
    }
  })
  if (results.every((r) => r.artistFound && r.dateFound)) return results
  const text = pageText(body)
  const loose = looseText(text)
  return results.map((r, i) => ({
    artistFound: r.artistFound || findsArtist(loose, items[i].artist),
    dateFound: r.dateFound || findsDate(text, items[i].date),
  }))
}

/** 1つの出典 URL を取得して、そこに書かれているはずの公演をまとめて確かめる。失敗しても例外にしない */
export async function verifySource(url: string, items: SourceItem[], fetcher: SourceFetcher): Promise<SourceCheck> {
  const none = items.map(() => ({ artistFound: false, dateFound: false }))
  try {
    const page = await fetchPage(url, fetcher)
    if (page.status !== 200) return { url, httpStatus: page.status, error: null, results: none }
    return { url, httpStatus: 200, error: null, results: checkItems(page.text, items) }
  } catch (error) {
    return { url, httpStatus: null, error: String(error).slice(0, 300), results: none }
  }
}
