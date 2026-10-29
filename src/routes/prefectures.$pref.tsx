import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DesktopExplorer } from '@/components/map/DesktopExplorer'
import { MobileIntro } from '@/components/map/MobileIntro'
import { VenueCards } from '@/components/map/VenueLinks'
import { toneOf } from '@/lib/map-layout'
import { fetchPrefecture } from '@/server/functions/geo'

export const Route = createFileRoute('/prefectures/$pref')({
  loader: ({ params }) => fetchPrefecture({ data: { slug: params.pref } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.prefecture.name}の会場 | Live Map Checker` : 'Live Map Checker' }],
  }),
  component: PrefecturePage,
})

function PrefecturePage() {
  const { region, prefectures, prefecture: pref } = Route.useLoaderData()
  const venues = pref.venues
  return (
    <>
      <div className="lg:hidden">
        <PageHeader
          back={{ to: `/regions/${region.slug}`, label: `${region.name}に戻る` }}
          crumbs={[
            { label: '日本地図', to: '/' },
            { label: region.name, to: `/regions/${region.slug}` },
            { label: pref.name },
          ]}
        />
        <MobileIntro kicker="03 — 会場を選ぶ" title={pref.name}>
          {venues.length > 0 ? (
            <>
              {venues.length}つの会場を登録しています。
              <br />
              （会場は随時追加をしていきます。）
            </>
          ) : (
            `この${pref.name.slice(-1)}の会場は準備中です。`
          )}
        </MobileIntro>
        <div className="mx-4">
          <VenueCards venues={venues} tone={toneOf(pref.slug)} />
        </div>
      </div>
      <DesktopExplorer selected={{ region, prefectures }} highlightPrefecture={pref.slug} />
    </>
  )
}
