// スマホ用の下部ナビ（docs/mockup/TabBar.dc.html の動きを移植）
// - タップ: 通常のリンクとして移動
// - 長押し（0.25秒）: インジケーターが浮き上がり、指に合わせて左右にスライド。離すと一番近いタブへ吸い付いて移動
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { TAB_ICONS } from './icons'
import { activeTabIndex, dragOffset, nearestTab, TABS } from './nav-items'

const LONG_PRESS_MS = 250
/** ナビの内側の余白（p-1.5）とタブの間隔（gap-1）。インジケーターの初期位置の計算にも使う */
const PADDING = 6
const GAP = 4

type Geometry = { firstLeft: number; tabWidth: number; stride: number }

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = activeTabIndex(pathname)

  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometry = useRef<Geometry>({ firstLeft: 0, tabWidth: 0, stride: 0 })
  const lastX = useRef(0)
  // 最新の値をイベントの中から読むため、描画用の state とは別に ref でも持つ
  const draggingRef = useRef(false)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)
  // null のときは URL（現在のタブ）の位置。数値のときは指に合わせた位置（px）
  const [offset, setOffset] = useState<number | null>(null)

  // 画面を離れるときに、長押しの待ち時間を止める
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // 別のタブへ移動したら、インジケーターの位置を URL に任せる
  // biome-ignore lint/correctness/useExhaustiveDependencies: タブが変わったときだけ戻す
  useEffect(() => {
    if (!draggingRef.current) setOffset(null)
  }, [current])

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  /** 実際のタブの位置から、幅と間隔を測る（余白や枠線の数値をここで持たない） */
  function measure() {
    const first = tabRefs.current[0]?.getBoundingClientRect()
    const second = tabRefs.current[1]?.getBoundingClientRect()
    if (!first || !second) return
    geometry.current = { firstLeft: first.left, tabWidth: first.width, stride: second.left - first.left }
  }

  function offsetAt(clientX: number) {
    const { firstLeft, tabWidth, stride } = geometry.current
    return dragOffset(clientX - firstLeft, tabWidth, stride, TABS.length)
  }

  function startDrag(target: HTMLElement, pointerId: number) {
    target.setPointerCapture?.(pointerId)
    draggingRef.current = true
    setDragging(true)
    setOffset(offsetAt(lastX.current))
  }

  function finishDrag(commit: boolean) {
    clearTimer()
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    // 指を離したときに続けて起きる click で、指の下のタブへ飛ばないようにする。
    // タッチでは click が起きないこともあるので、少し待って必ず解除する
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 400)
    const index = commit ? nearestTab(offsetAt(lastX.current), geometry.current.stride, TABS.length) : current
    if (index === current) {
      setOffset(null)
    } else {
      setOffset(index * geometry.current.stride)
      navigate({ to: TABS[index].to })
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressClick.current = false
    measure()
    lastX.current = e.clientX
    const target = e.currentTarget
    const pointerId = e.pointerId
    clearTimer()
    timer.current = setTimeout(() => startDrag(target, pointerId), LONG_PRESS_MS)
    // 長押しが始まる前にナビの外で指を離しても、待ち時間を止める
    const cancelPending = () => {
      if (!draggingRef.current) clearTimer()
    }
    window.addEventListener('pointerup', cancelPending, { once: true })
    window.addEventListener('pointercancel', cancelPending, { once: true })
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    lastX.current = e.clientX
    if (draggingRef.current) setOffset(offsetAt(e.clientX))
  }

  const stride = geometry.current.stride
  const nearIndex = offset !== null && stride > 0 ? nearestTab(offset, stride, TABS.length) : current
  const transform =
    offset !== null
      ? `translateX(${offset}px) scale(${dragging ? 1.1 : 1})`
      : // 測る前（サーバー描画・初回表示）は、自分の幅＋間隔の倍数で位置を決める
        `translateX(calc(${current} * (100% + ${GAP}px)))`

  return (
    <nav
      aria-label="メインメニュー"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finishDrag(true)}
      onPointerCancel={() => finishDrag(false)}
      onLostPointerCapture={() => finishDrag(true)}
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
          'pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 rounded-button border',
          'border-[var(--nav-indicator-border)] bg-[var(--nav-indicator)] shadow-[var(--highlight-inset)] backdrop-blur-[10px]',
          'transition-[transform,box-shadow,background-color] duration-[450ms] ease-[cubic-bezier(0.2,0.9,0.3,1.2)] motion-reduce:ease-out',
          'data-dragging:border-[var(--nav-indicator-border-drag)] data-dragging:bg-[var(--nav-indicator-drag)] data-dragging:duration-[60ms] data-dragging:ease-linear',
          'data-dragging:shadow-[var(--nav-indicator-shadow-drag)]',
        )}
        style={{
          width: `calc((100% - ${PADDING * 2}px - ${GAP * (TABS.length - 1)}px) / ${TABS.length})`,
          transform,
        }}
      />
      {TABS.map((tab, i) => {
        const Icon = TAB_ICONS[tab.id]
        return (
          <Link
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            to={tab.to}
            draggable={false}
            aria-current={i === current ? 'page' : undefined}
            className={cn(
              'relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-button text-[11px] font-bold no-underline transition-colors',
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
