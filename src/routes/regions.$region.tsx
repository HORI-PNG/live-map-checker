import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DesktopExplorer } from '@/components/map/DesktopExplorer'
import { MapCard, MobileIntro } from '@/components/map/MobileIntro'
import { MapLegend, TileMap } from '@/components/map/TileMap'
import { prefectureTileItems } from '@/components/map/tile-items'
import { VenueCards } from '@/components/map/VenueLinks'
import { REGION_LAYOUTS } from '@/lib/map-layout'
import { fetchRegion } from '@/server/functions/geo'

export const Route = createFileRoute('/regions/$region')({
  loader: ({ params }) => fetchRegion({ data: { slug: params.region } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.region.displayName}の会場 | Live Map Checker` : 'Live Map Checker' }],
  }),
  component: RegionPage,
})

function RegionPage() {
  const { regions, region, prefectures } = Route.useLoaderData()
  const layout = REGION_LAYOUTS[region.slug]
  return (
    <>
      <div className="lg:hidden">
        <PageHeader
          back={{ to: '/', label: '日本地図に戻る' }}
          crumbs={[{ label: '日本地図', to: '/' }, { label: region.name }]}
        />
        <MobileIntro kicker="02 — 県を選ぶ" title={region.displayName}>
          {region.venueCount > 0 ? '色が付いている県に、登録済みの会場があります。' : 'この地方の会場は準備中です。'}
        </MobileIntro>
        {layout ? (
          <MapCard>
            <TileMap
              layout={layout}
              items={prefectureTileItems(prefectures)}
              label={`${region.displayName}の地図（県を選ぶ）`}
            />
            <MapLegend activeLabel="会場あり（タップで選択）" />
          </MapCard>
        ) : (
          // 県のタイル配置をまだ作っていない地方は、会場の一覧だけ出す
          <div className="mx-4 flex flex-col gap-2.5">
            {prefectures
              .filter((p) => p.venues.length > 0)
              .map((p) => (
                <VenueCards key={p.slug} venues={p.venues} />
              ))}
          </div>
        )}
      </div>
      <DesktopExplorer regions={regions} selected={{ region, prefectures }} />
    </>
  )
}
