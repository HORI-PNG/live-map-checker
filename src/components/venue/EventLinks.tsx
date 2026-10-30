// 公演カードのリンク部分。v2 でチケット販売サイト（アフィリエイト）のリンクをここに差し込む
import type { VenueEvent } from '@/server/repo/geo'

export function EventLinks({ event }: { event: VenueEvent }) {
  return (
    <>
      {event.sourceKind === 'ai' && event.sourceUrl && (
        <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
          出典：{event.sourceLabel ?? new URL(event.sourceUrl).hostname} ↗
        </a>
      )}
      {event.detailUrl && (
        <a
          href={event.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs font-bold lg:text-[13px]"
        >
          詳細<span className="sr-only">：{event.artistName || event.title}（外部サイト）</span> ↗
        </a>
      )}
    </>
  )
}
