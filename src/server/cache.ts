// 表示用ページ（HTML）の応答を Cache API に短時間保存し、同じページの描画を省く（docs/plan.md 10.5）。
// 保存するのは「誰が見ても同じ内容」のページだけ。お気に入りやテーマはブラウザ側で処理するので含まれない。
// サーバー関数（/_serverFn/）は保存しない（今後、利用者ごとに違う結果を返す関数を足しても共有されないように）
export const PAGE_CACHE_SECONDS = 300
/** 計測（scripts/measure-cpu.mjs）用。staging でだけ受け付け、キャッシュを使わずに描画する */
export const CACHE_BYPASS_HEADER = 'x-lmc-cache-bypass'

/** キャッシュしてよいリクエストか */
export function isCacheable(request: Request): boolean {
  if (request.method !== 'GET') return false
  if (request.headers.has('authorization') || request.headers.has('cookie')) return false
  const { pathname } = new URL(request.url)
  return (
    pathname === '/' ||
    pathname.startsWith('/regions/') ||
    pathname.startsWith('/prefectures/') ||
    pathname.startsWith('/venues/')
  )
}

/**
 * キャッシュの鍵。表示が変わるのはパスと ?mode= だけなので、それ以外のクエリは無視する
 * （でたらめなクエリで毎回描画させられないように）。デプロイのバージョンも含め、新しいデプロイでは
 * 古い HTML（古い JS・CSS を指すもの）を返さない
 */
export function cacheKey(request: Request, version: string): string {
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') === 'fav' ? '?mode=fav' : ''
  return `https://page-cache.internal/${encodeURIComponent(version)}${url.pathname}${mode}`
}

type Options = { version: string; allowBypass: boolean }

export async function cachedFetch(
  request: Request,
  ctx: ExecutionContext,
  render: () => Response | Promise<Response>,
  { version, allowBypass }: Options,
): Promise<Response> {
  if (!isCacheable(request)) return render()
  if (allowBypass && request.headers.get(CACHE_BYPASS_HEADER) === '1') {
    const response = await render()
    const copy = new Response(response.body, response)
    copy.headers.set('x-lmc-cache', 'bypass')
    return copy
  }
  // tsconfig にブラウザ用の型（DOM）も入っているため、Workers の caches.default を明示して使う
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(cacheKey(request, version), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) {
    const response = new Response(hit.body, hit)
    response.headers.set('x-lmc-cache', 'hit')
    return response
  }
  const rendered = await render()
  if (rendered.status !== 200 || rendered.headers.has('set-cookie')) return rendered
  const response = new Response(rendered.body, rendered)
  // ブラウザには保存させず（max-age=0）、Cloudflare のキャッシュにだけ保存する（s-maxage）
  response.headers.set('cache-control', `public, max-age=0, s-maxage=${PAGE_CACHE_SECONDS}`)
  response.headers.set('x-lmc-cache', 'miss')
  ctx.waitUntil(cache.put(key, response.clone()))
  return response
}

/** 内容が変わったページ（AI 検索の結果が入った会場など）を、この拠点のキャッシュから消す */
export async function purgePages(pathname: string, version: string): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default
  const base = `https://page-cache.internal/${encodeURIComponent(version)}${pathname}`
  await Promise.all([cache.delete(base), cache.delete(`${base}?mode=fav`)])
}
