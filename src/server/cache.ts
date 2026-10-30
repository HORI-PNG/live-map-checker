// 表示用の GET の応答を Cache API に短時間保存し、同じページの描画を省く（docs/plan.md 10.5）。
// 保存するのは「誰が見ても同じ内容」のものだけ。お気に入りやテーマはブラウザ側で処理するので含まれない
export const PAGE_CACHE_SECONDS = 300

/** キャッシュしてよいリクエストか（ページと、データを読むサーバー関数の GET） */
export function isCacheable(request: Request): boolean {
  if (request.method !== 'GET') return false
  if (request.headers.has('authorization') || request.headers.has('cookie')) return false
  const { pathname } = new URL(request.url)
  return (
    pathname === '/' ||
    pathname.startsWith('/regions/') ||
    pathname.startsWith('/prefectures/') ||
    pathname.startsWith('/venues/') ||
    pathname.startsWith('/_serverFn/')
  )
}

export async function cachedFetch(
  request: Request,
  ctx: ExecutionContext,
  render: () => Response | Promise<Response>,
): Promise<Response> {
  if (!isCacheable(request)) return render()
  // tsconfig にブラウザ用の型（DOM）も入っているため、Workers の caches.default を明示して使う
  const cache = (caches as unknown as { default: Cache }).default
  // 鍵は URL だけ（ヘッダーの違いで別々に保存しない）
  const key = new Request(request.url, { method: 'GET' })
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
