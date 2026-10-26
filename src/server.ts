import handler from '@tanstack/react-start/server-entry'

// HTTP は TanStack Start に任せ、Cron（scheduled）だけを自前で処理する
export default {
  fetch(request) {
    return handler.fetch(request)
  },

  async scheduled(controller, _env, _ctx) {
    // 会場サイトの自動取得は feat/scraper-zepp で実装する
    console.log(JSON.stringify({ event: 'cron', cron: controller.cron, scheduledTime: controller.scheduledTime }))
  },
} satisfies ExportedHandler<Env>
