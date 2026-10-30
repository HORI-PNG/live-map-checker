// 公演カードのリンク部分。v2 でチケット販売サイト（アフィリエイト）のリンクをここに差し込む
import type { VenueEvent } from '@/server/repo/geo'

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function EventLinks({ event }: { event: VenueEvent }) {
  return (
    <>
      {event.sourceKind === 'ai' && event.sourceUrl && (
        <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
          出典：{event.sourceLabel ?? hostnameOf(event.sourceUrl) ?? '情報元'} ↗
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
