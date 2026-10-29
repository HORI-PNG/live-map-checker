import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DesktopExplorer } from '@/components/map/DesktopExplorer'
import { MapCard, MobileIntro } from '@/components/map/MobileIntro'
import { PrefectureSections } from '@/components/map/PrefectureSections'
import { MapLegend, TileMap } from '@/components/map/TileMap'
import { prefectureTileItems } from '@/components/map/tile-items'
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
  const { region, prefectures } = Route.useLoaderData()
  const layout = REGION_LAYOUTS[region.slug]
  // 地図のタイルに無い県（配置をまだ作っていない地方を含む）の会場は、地図の下に一覧で出す
  const unmapped = prefectures.filter((p) => p.venues.length > 0 && !layout?.tiles.some((t) => t.slug === p.slug))
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
        {layout && (
          <MapCard>
            <TileMap
              layout={layout}
              items={prefectureTileItems(prefectures)}
              label={`${region.displayName}の地図（県を選ぶ）`}
            />
            <MapLegend activeLabel="会場あり（タップで選択）" />
          </MapCard>
        )}
        {unmapped.length > 0 && <PrefectureSections prefectures={unmapped} />}
      </div>
      <DesktopExplorer selected={{ region, prefectures }} />
    </>
  )
}
