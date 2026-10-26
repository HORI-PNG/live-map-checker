// 会場へのリンクの一覧（スマホの県画面・PC の右パネル）。番号の色はミントとティールを交互に使う
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from '@/components/nav/icons'
import { toneColor } from '@/lib/map-layout'
import { cn } from '@/lib/utils'
import type { VenueListItem } from '@/server/repo/geo'

const number = (i: number) => String(i + 1).padStart(2, '0')

/** スマホの県画面（Prefecture.dc.html）: 大きめのガラス風カード */
export function VenueCards({ venues, tone = 0 }: { venues: VenueListItem[]; tone?: 0 | 1 }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {venues.map((venue, i) => (
        <li key={venue.slug}>
          <Link
            to="/venues/$venue"
            params={{ venue: venue.slug }}
            className="glass flex min-h-[76px] items-center gap-3.5 rounded-card px-4 py-3.5 text-foreground no-underline hover:text-foreground"
          >
            <NumberBadge index={i} tone={tone} className="size-12 text-[15px]" />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-rounded text-base font-bold">{venue.name}</span>
              <span className="text-xs text-fg-muted">{venue.area}</span>
            </span>
            <ChevronRightIcon size={18} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** PC の右パネル（DeskMain.dc.html）: 小さめの行 */
export function VenueRows({ venues, tone = 0 }: { venues: VenueListItem[]; tone?: 0 | 1 }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {venues.map((venue, i) => (
        <li key={venue.slug}>
          <Link
            to="/venues/$venue"
            params={{ venue: venue.slug }}
            className="flex min-h-14 items-center gap-3 rounded-button border border-[var(--glass-border)] bg-[var(--glass-soft)] px-3 py-2 text-foreground no-underline transition-colors hover:bg-[var(--glass-strong)] hover:text-foreground"
          >
            <NumberBadge index={i} tone={tone} className="size-9 text-[13px]" />
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">{venue.name}</span>
              <span className="text-xs text-fg-muted">{venue.area}</span>
            </span>
            <ChevronRightIcon />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function NumberBadge({ index, tone, className }: { index: number; tone: 0 | 1; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-rounded font-extrabold text-[var(--tile-on)]',
        className,
      )}
      style={{ background: toneColor(tone, index) }}
    >
      {number(index)}
    </span>
  )
}
