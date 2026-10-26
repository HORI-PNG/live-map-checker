import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'

export const Route = createFileRoute('/')({ component: Home })

// 地図は feat/map-navigation で実装する
function Home() {
  return (
    <>
      <PageHeader />
      <section className="flex flex-col gap-2 px-6 pt-7 pb-5 lg:px-2 lg:pt-2">
        <span className="kicker lg:text-[13px]">01 — 場所から探す</span>
        <h1 className="m-0 text-center text-[30px] leading-snug font-extrabold lg:text-left lg:text-[40px] lg:leading-tight">
          行ける場所から、
          <br className="lg:hidden" />
          ライブを探そう。
        </h1>
        <p className="m-0 text-sm leading-relaxed text-fg-muted lg:text-[15px]">
          地方を選んで、近くの会場に来るアーティストをチェック。
        </p>
      </section>
    </>
  )
}
