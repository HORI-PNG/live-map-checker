// 月ごとに見出しを付けた公演一覧。スマホは1列、PC は複数列のカード
import type { VenueEvent } from '@/server/repo/geo'
import { monthLabel } from '@/shared/dates'
import { EventCard } from './EventCard'

export function EventList({ events }: { events: VenueEvent[] }) {
  const months = new Map<string, VenueEvent[]>()
  for (const event of events) {
    const key = event.date.slice(0, 7)
    const list = months.get(key)
    if (list) list.push(event)
    else months.set(key, [event])
  }
  return (
    <div className="flex flex-col gap-2.5 lg:gap-3.5">
      {[...months.entries()].map(([key, list]) => (
        <section key={key} aria-labelledby={`month-${key}`} className="flex flex-col gap-2.5 lg:gap-3">
          <h2 id={`month-${key}`} className="mx-2 mt-1.5 mb-0 text-[15px] font-bold lg:mx-1 lg:text-[17px]">
            {monthLabel(list[0].date)}
          </h2>
          <div className="grid gap-2.5 lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-3">
            {list.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
