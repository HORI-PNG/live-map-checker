// スマホ用の下部ナビ（docs/mockup/TabBar.dc.html の動きを移植）
// - タップ: 通常のリンクとして移動
// - 長押し（0.25秒）: インジケーターが浮き上がり、指に合わせて左右にスライド。離すと一番近いタブへ吸い付いて移動
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { TAB_ICONS } from './icons'
import { activeTabIndex, dragOffset, nearestTab, TABS } from './nav-items'

const LONG_PRESS_MS = 250
const GAP = 4

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = activeTabIndex(pathname)

  const navRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometry = useRef({ left: 0, tabWidth: 0, stride: 0 })
  const lastX = useRef(0)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState<number | null>(null)

  // 画面を離れるときに、長押しの待ち時間を止める
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // 画面遷移が終わったら、インジケーターの位置を URL（現在のタブ）に任せる
  // biome-ignore lint/correctness/useExhaustiveDependencies: タブが変わったときだけリセットする
  useEffect(() => {
    if (!dragging) setOffset(null)
  }, [current])

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  function measure() {
    const rect = navRef.current?.getBoundingClientRect()
    if (!rect) return
    const tabWidth = (rect.width - 2 - 12 - GAP * (TABS.length - 1)) / TABS.length
    geometry.current = { left: rect.left, tabWidth, stride: tabWidth + GAP }
  }

  function offsetAt(clientX: number) {
    const { left, tabWidth, stride } = geometry.current
    return dragOffset(clientX - left, tabWidth, stride, TABS.length)
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    measure()
    lastX.current = e.clientX
    const pointerId = e.pointerId
    const target = e.currentTarget
    clearTimer()
    timer.current = setTimeout(() => {
      target.setPointerCapture?.(pointerId)
      setDragging(true)
      setOffset(offsetAt(lastX.current))
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    lastX.current = e.clientX
    if (dragging) setOffset(offsetAt(e.clientX))
  }

  function finishDrag(commit: boolean) {
    clearTimer()
    if (!dragging) return
    setDragging(false)
    suppressClick.current = true // 指を離したときに発生する click で、別のタブに飛ばないようにする
    const index = commit && offset !== null ? nearestTab(offset, geometry.current.stride, TABS.length) : current
    setOffset(index * geometry.current.stride)
    if (index !== current) navigate({ to: TABS[index].to })
  }

  const nearIndex = offset !== null ? nearestTab(offset, geometry.current.stride || 1, TABS.length) : current
  const transform =
    offset !== null
      ? `translateX(${offset}px) scale(${dragging ? 1.1 : 1})`
      : // 測る前（サーバー描画・初回表示）は、自分の幅＋すき間の倍数で位置を決める
        `translateX(calc(${current} * (100% + ${GAP}px)))`

  return (
    <nav
      ref={navRef}
      aria-label="メインメニュー"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finishDrag(true)}
      onPointerCancel={() => finishDrag(false)}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault()
          e.stopPropagation()
          suppressClick.current = false
        }
      }}
      className="glass relative flex h-16 touch-none gap-1 rounded-header p-1.5 select-none [box-shadow:var(--nav-shadow)] [-webkit-touch-callout:none]"
    >
      <div
        aria-hidden="true"
        data-dragging={dragging || undefined}
        className={cn(
          'pointer-events-none absolute top-1.5 left-1.5 h-[calc(100%-14px)] w-[calc((100%-22px)/3)] rounded-[12px] border',
          'border-[var(--nav-indicator-border)] bg-[var(--nav-indicator)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[10px]',
          'transition-[transform,box-shadow,background-color] duration-[450ms] ease-[cubic-bezier(0.2,0.9,0.3,1.2)] motion-reduce:ease-out',
          'data-dragging:border-[var(--nav-indicator-border-drag)] data-dragging:bg-[var(--nav-indicator-drag)] data-dragging:duration-[60ms] data-dragging:ease-linear',
          'data-dragging:shadow-[0_10px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.4)]',
        )}
        style={{ transform }}
      />
      {TABS.map((tab, i) => {
        const Icon = TAB_ICONS[tab.id]
        return (
          <Link
            key={tab.id}
            to={tab.to}
            draggable={false}
            aria-current={i === current ? 'page' : undefined}
            className={cn(
              'relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[12px] text-[11px] font-bold no-underline transition-colors',
              i === nearIndex
                ? 'text-[var(--nav-on)] hover:text-[var(--nav-on)]'
                : 'text-[var(--nav-off)] hover:text-[var(--nav-off)]',
            )}
          >
            <Icon />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
