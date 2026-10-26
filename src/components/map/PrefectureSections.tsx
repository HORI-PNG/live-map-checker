// 県ごとの会場一覧（見出し付き）。地図のタイルに無い県の会場も、ここからたどれるようにする
import { toneOf } from '@/lib/map-layout'
import type { PrefectureWithVenues } from '@/server/repo/geo'
import { VenueCards } from './VenueLinks'

export function PrefectureSections({ prefectures }: { prefectures: PrefectureWithVenues[] }) {
  return (
    <div className="mx-4 mt-4 flex flex-col gap-4">
      {prefectures.map((p) => (
        <section key={p.slug} aria-labelledby={`venues-${p.slug}`} className="flex flex-col gap-2.5">
          <h2 id={`venues-${p.slug}`} className="mx-2 my-0 text-[15px] font-bold">
            {p.name}
          </h2>
          <VenueCards venues={p.venues} tone={toneOf(p.slug)} />
        </section>
      ))}
    </div>
  )
}
