// 角丸タイルを並べた地図。情報がある地方・県だけ色付きのリンクにし、ほかは「準備中」のガラス風タイル
import { Link } from '@tanstack/react-router'
import { type TileLayout, toneColor } from '@/lib/map-layout'
import { cn } from '@/lib/utils'

export type TileItem = { label: string; venueCount: number; to: string; params: Record<string, string> }

type Props = {
  layout: TileLayout
  items: Record<string, TileItem>
  label: string
  /** PC で選択中の地方（白い輪で示す） */
  selected?: string
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`

export function TileMap({ layout, items, label, selected }: Props) {
  let activeIndex = 0
  return (
    <nav
      aria-label={label}
      className="relative mx-auto w-full max-w-[330px] lg:max-w-[462px]"
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {layout.tiles.map((tile) => {
        const item = items[tile.slug]
        const position = {
          left: pct(tile.x, layout.width),
          top: pct(tile.y, layout.height),
          width: pct(tile.w, layout.width),
          height: pct(tile.h, layout.height),
        }
        const radius = tile.small ? 'rounded-md lg:rounded-button' : 'rounded-button lg:rounded-segment'
        if (!item || item.venueCount === 0) {
          return (
            <div
              key={tile.slug}
              aria-disabled="true"
              className={cn(
                'absolute box-border flex items-center justify-center border border-[var(--glass-border)] bg-[var(--glass-soft)] text-[13px] font-medium text-fg-subtle lg:text-[15px]',
                radius,
              )}
              style={position}
            >
              {item?.label ?? tile.slug}
              <span className="sr-only">（準備中）</span>
            </div>
          )
        }
        const color = toneColor(tile.tone ?? 0, tile.tone === undefined ? activeIndex : 0)
        activeIndex++
        const isSelected = selected === tile.slug
        return (
          <Link
            key={tile.slug}
            to={item.to}
            params={item.params}
            className={cn(
              'absolute flex flex-col items-center justify-center gap-0.5 text-[var(--tile-on)] no-underline transition-shadow hover:text-[var(--tile-on)]',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]',
              radius,
            )}
            style={{
              ...position,
              background: color,
              boxShadow: isSelected
                ? `0 0 0 3px var(--bg), 0 0 0 5px var(--fg), 0 0 26px color-mix(in srgb, ${color} 55%, transparent)`
                : `0 0 22px color-mix(in srgb, ${color} 45%, transparent)`,
            }}
          >
            <span className="font-rounded text-[15px] font-extrabold lg:text-[17px]">{item.label}</span>
            <span className="text-[11px] font-bold lg:text-xs">
              <span className="sr-only">、</span>
              {item.venueCount}会場
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

export function MapLegend({ activeLabel }: { activeLabel: string }) {
  return (
    <div className="flex items-center gap-4 px-1.5 text-xs text-fg-muted lg:gap-5 lg:text-[13px]">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-[4px] bg-brand-accent" />
        {activeLabel}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="box-border size-3 rounded-[4px] border border-[var(--glass-border)] bg-[var(--glass-soft)]" />
        準備中
      </span>
    </div>
  )
}
