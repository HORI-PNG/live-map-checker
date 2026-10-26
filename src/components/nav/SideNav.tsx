// PC 用の左ナビ（docs/mockup/SideNav.dc.html）。ホバー／キーボードのフォーカスでインジケーターが移動する
import { Link, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PinIcon, TAB_ICONS } from './icons'
import { activeTabIndex, TABS } from './nav-items'

// 上の余白 12px + ロゴ 56px + 余白 8px、各タブは高さ 72px + 間隔 6px
const FIRST_TOP = 12 + 56 + 8
const STRIDE = 72 + 6

export function SideNav() {
  const { pathname } = useLocation()
  const current = activeTabIndex(pathname)
  const [hover, setHover] = useState<number | null>(null)
  const position = hover ?? current

  return (
    <nav
      aria-label="メインメニュー"
      onMouseLeave={() => setHover(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHover(null)
      }}
      className="glass relative flex w-[88px] flex-col gap-1.5 rounded-[22px] px-2 py-3 [box-shadow:var(--nav-shadow)]"
    >
      <Link to="/" aria-label="Live Map Checker トップへ" className="mb-2 flex h-14 items-center justify-center">
        <PinIcon size={30} />
      </Link>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-2 h-[72px] w-[70px] rounded-[14px] border border-[var(--nav-indicator-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
          'transition-[top,background-color] duration-[400ms] ease-[cubic-bezier(0.2,0.9,0.3,1.2)] motion-reduce:ease-out',
          position === current ? 'bg-[var(--nav-indicator)]' : 'bg-[var(--nav-indicator-hover)]',
        )}
        style={{ top: FIRST_TOP + position * STRIDE }}
      />
      {TABS.map((tab, i) => {
        const Icon = TAB_ICONS[tab.id]
        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={i === current ? 'page' : undefined}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            className={cn(
              'relative z-10 flex h-[72px] flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-bold no-underline transition-colors',
              i === position
                ? 'text-[var(--nav-on)] hover:text-[var(--nav-on)]'
                : 'text-[var(--nav-off)] hover:text-[var(--nav-off)]',
            )}
          >
            <Icon size={24} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
