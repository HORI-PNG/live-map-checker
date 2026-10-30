import handler from '@tanstack/react-start/server-entry'
import { cachedFetch } from './server/cache'

// 出典の検証用の入口（ctx.exports から呼ぶ。インターネットからは呼べない）
export { SourceVerifier } from './server/ai/verifier'

// HTTP は TanStack Start に任せる。会場サイトの自動取得は GitHub Actions で行う（src/scraper-entry.ts）。
// 表示用の GET はキャッシュから返して、描画の CPU 時間を節約する（無料プランの 10ms に収めるため）
export default {
  fetch(request, env, ctx) {
    return cachedFetch(request, ctx, () => handler.fetch(request), {
      version: env.CF_VERSION_METADATA.id,
      allowBypass: env.APP_ENV === 'staging',
    })
  },
} satisfies ExportedHandler<Env>
