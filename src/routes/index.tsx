import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

// PR 1 の仮のトップ。地図は feat/map-navigation で実装する
function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[880px] flex-col gap-6 px-4 py-4">
      <header className="glass-raised flex h-14 items-center gap-2 rounded-[18px] px-[18px]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--brand-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="font-rounded text-base font-extrabold">Live Map Checker</span>
      </header>
      <section className="flex flex-col gap-2 px-2 pt-3">
        <span className="kicker">01 — 場所から探す</span>
        <h1 className="m-0 text-center text-3xl leading-snug font-extrabold">
          行ける場所から、
          <br />
          ライブを探そう。
        </h1>
        <p className="m-0 text-sm leading-relaxed text-fg-muted">準備中です。まもなく公開します。</p>
      </section>
    </main>
  )
}
