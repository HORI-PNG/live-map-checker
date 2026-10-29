import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { type ThemePreference, useThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/account')({
  head: () => ({ meta: [{ title: 'アカウントと設定 | Live Map Checker' }] }),
  component: Account,
})

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'システム' },
  { id: 'light', label: 'ライト' },
  { id: 'dark', label: 'ダーク' },
]

// ゲスト表示・通知・規約などのリンクは feat/account-pages で実装する
function Account() {
  const [theme, setTheme] = useThemePreference()
  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-[880px]">
      <PageHeader />
      <div className="flex flex-col gap-3 px-4 pt-[22px] pb-4 lg:px-0 lg:pt-2">
        <section className="flex flex-col gap-1.5 px-2 pb-1">
          <span className="kicker">06 — アカウント</span>
          <h1 className="m-0 text-center text-[28px] leading-snug font-extrabold lg:text-left">アカウントと設定</h1>
        </section>
        <h2 className="mx-2 mt-1.5 mb-0 text-[15px] font-bold">表示</h2>
        <fieldset className="glass m-0 flex min-w-0 flex-col gap-2.5 rounded-card p-4">
          <legend className="float-left mb-2.5 p-0 text-sm font-bold">テーマ</legend>
          <div className="clear-both flex gap-1 rounded-segment border border-[var(--segment-border)] bg-[var(--segment-bg)] p-1">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={theme === option.id}
                onClick={() => setTheme(option.id)}
                className={cn(
                  'h-10 flex-1 cursor-pointer rounded-md border font-rounded text-[13px] font-bold transition-colors',
                  theme === option.id
                    ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft)] text-foreground'
                    : 'border-transparent bg-transparent text-fg-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="text-xs leading-relaxed text-fg-muted">
            初期設定はダークです。「システム」を選ぶと、端末の設定に合わせて切り替わります。
          </span>
        </fieldset>
      </div>
    </div>
  )
}
