// 会場サイトの自動取得だけを行う Worker の入口（画面は持たない）。
// Cloudflare 上では動かさず、GitHub Actions の中の wrangler dev（ローカルの workerd）で動かし、
// 本番の D1 にだけリモートでつなぐ。無料プランの CPU 10ms の制限を受けないため（docs/plan.md 3.2・10.5）
import { createDb } from './server/db/client'
import { runScrapeTick } from './server/scraping/runner'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // scripts/scrape.mjs が、起動したのが自分のサーバーで、意図した D1 につながっているかを確かめる
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ target: (env as Env & { SCRAPER_TARGET?: string }).SCRAPER_TARGET ?? null })
    }
    if (request.method !== 'POST' || url.pathname !== '/tick') return new Response('Not Found', { status: 404 })
    const result = await runScrapeTick(createDb(env.DB), env.DB, fetch, {
      syncPages: url.searchParams.get('sync') === '1',
    })
    return Response.json(result)
  },
} satisfies ExportedHandler<Env>
