// 公演カード（Venue.dc.html / DeskVenue.dc.html）
// 自動取得の公演はラベルなし。AI で取得した公演は紫の枠と「AIによる検索」、出典リンクを付ける
import { HeartIcon } from '@/components/nav/icons'
import { cn } from '@/lib/utils'
import type { VenueEvent } from '@/server/repo/geo'
import { dateParts } from '@/shared/dates'
import { EventLinks } from './EventLinks'

type Props = { event: VenueEvent; favorite?: boolean; highlightDate?: boolean }

export function EventCard({ event, favorite = false, highlightDate = false }: Props) {
  const { month, day, weekday } = dateParts(event.date)
  const ai = event.sourceKind === 'ai'
  const headline = event.artistName || event.title
  const subline = event.tourName ?? (event.artistName ? event.title : null)
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-card p-3.5 lg:gap-3 lg:p-4',
        // glass は枠と背景も決めるので、AI のカードでは使わず紫の枠と背景を直接指定する
        ai
          ? 'border border-[var(--ai-border)] bg-[var(--ai-bg)] shadow-[var(--glass-inset)] backdrop-blur-[18px] backdrop-saturate-[140%]'
          : 'glass',
      )}
    >
      <div className="flex gap-3.5">
        <div
          className={cn(
            'flex h-[68px] w-14 shrink-0 flex-col items-center justify-center rounded-md',
            highlightDate ? 'bg-brand-accent text-[var(--tile-on)]' : 'bg-[var(--date-box)]',
          )}
        >
          <span className={cn('text-[11px]', !highlightDate && 'text-fg-muted')}>{month}月</span>
          <span className="font-rounded text-[22px] leading-tight font-extrabold">{day}</span>
          <span className={cn('text-[11px]', !highlightDate && 'text-fg-muted')}>{weekday}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h3 className="m-0 font-rounded text-[17px] leading-snug font-extrabold [overflow-wrap:anywhere] lg:text-lg">
            {headline}
          </h3>
          {subline && <span className="text-[13px] text-fg-muted [overflow-wrap:anywhere]">{subline}</span>}
          <span className="text-xs text-fg-muted">{timeLabel(event.openTime, event.startTime)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {favorite && (
          <span className="inline-flex h-[26px] items-center gap-1 rounded-badge border border-[var(--fav-badge-border)] bg-[var(--fav-badge-bg)] px-2.5 text-xs font-bold text-[var(--fav-badge-fg)]">
            <HeartIcon size={12} className="fill-current" />
            お気に入り
          </span>
        )}
        {ai && <AiBadge />}
        <EventLinks event={event} />
      </div>
    </article>
  )
}

export function AiBadge() {
  return (
    <span className="inline-flex h-[26px] items-center gap-[5px] rounded-badge border border-[var(--ai-border)] bg-[var(--ai-badge-bg)] px-2.5 text-xs font-bold text-[var(--ai-badge-fg)]">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      AIによる検索
    </span>
  )
}

function timeLabel(open: string | null, start: string | null): string {
  if (open && start) return `開場 ${open} / 開演 ${start}`
  if (start) return `開演 ${start}`
  if (open) return `開場 ${open}`
  return '時間は詳細ページで確認してください'
}
