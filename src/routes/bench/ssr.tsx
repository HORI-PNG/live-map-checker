import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { benchEnabled } from '@/server/bench/guard'

// 会場画面（モックアップ 04）相当: 公演30件のカードをサーバーで描画する
const getEvents = createServerFn().handler(async () => {
  if (!benchEnabled()) throw notFound()
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    day: (i % 28) + 1,
    week: '日月火水木金土'[i % 7],
    artist: `アーティスト ${String.fromCharCode(65 + (i % 26))}`,
    tour: `[ツアー名] 2026 第${i + 1}公演`,
    time: '開場 17:00 / 開演 18:00',
    ai: i % 5 === 0,
  }))
})

export const Route = createFileRoute('/bench/ssr')({
  loader: () => getEvents(),
  component: BenchSsr,
})

function BenchSsr() {
  const events = Route.useLoaderData()
  return (
    <main className="mx-auto flex max-w-[880px] flex-col gap-2.5 p-4">
      <h1 className="text-2xl font-extrabold">マリンメッセ福岡</h1>
      {events.map((e) => (
        <article key={e.id} className="glass flex flex-col gap-2.5 rounded-card p-3.5">
          <div className="flex gap-3.5">
            <div className="flex h-[68px] w-14 shrink-0 flex-col items-center justify-center rounded-[10px] bg-white/10">
              <span className="text-[11px] text-fg-muted">11月</span>
              <span className="font-rounded text-[22px] leading-tight font-extrabold">{e.day}</span>
              <span className="text-[11px] text-fg-muted">{e.week}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-rounded text-[17px] font-extrabold">{e.artist}</span>
              <span className="text-[13px] text-fg-muted">{e.tour}</span>
              <span className="text-xs text-fg-muted">{e.time}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {e.ai && <span className="rounded-badge px-2.5 text-xs font-bold">AIによる検索</span>}
            <a href="#top" className="ml-auto text-xs font-bold">
              詳細 ↗
            </a>
          </div>
        </article>
      ))}
    </main>
  )
}
