import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { DesktopExplorer } from '@/components/map/DesktopExplorer'
import { MapCard, MobileIntro } from '@/components/map/MobileIntro'
import { MapLegend, TileMap } from '@/components/map/TileMap'
import { regionTileItems } from '@/components/map/tile-items'
import { useRegionSummaries } from '@/components/map/use-regions'
import { JAPAN_LAYOUT } from '@/lib/map-layout'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const regions = useRegionSummaries()
  return (
    <>
      <div className="lg:hidden">
        <PageHeader />
        <MobileIntro
          kicker="01 — 場所から探す"
          title={
            <>
              行ける場所から、
              <br />
              ライブを探そう。
            </>
          }
        >
          地方を選んで、近くの会場に来るアーティストをチェック。
        </MobileIntro>
        <MapCard>
          <TileMap layout={JAPAN_LAYOUT} items={regionTileItems(regions)} label="日本地図（地方を選ぶ）" />
          <MapLegend activeLabel="情報あり（タップで選択）" />
        </MapCard>
      </div>
      <DesktopExplorer />
    </>
  )
}
