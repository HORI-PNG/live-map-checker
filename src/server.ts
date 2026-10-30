import handler from '@tanstack/react-start/server-entry'
import { cachedFetch } from './server/cache'

// HTTP は TanStack Start に任せ、Cron（scheduled）だけを自前で処理する。
// 表示用の GET はキャッシュから返して、描画の CPU 時間を節約する（無料プランの 10ms に収めるため）
export default {
  fetch(request, env, ctx) {
    return cachedFetch(request, ctx, () => handler.fetch(request), {
      version: env.CF_VERSION_METADATA.id,
      allowBypass: env.APP_ENV === 'staging',
    })
  },

  async scheduled(controller, _env, _ctx) {
    // 会場サイトの自動取得は feat/scraper-zepp で実装する
    console.log(JSON.stringify({ event: 'cron', cron: controller.cron, scheduledTime: controller.scheduledTime }))
  },
} satisfies ExportedHandler<Env>
