// PC のトップ・地方・県（DeskMain.dc.html）: 左に大きな日本地図、右に選んだ地方の県と会場の一覧
import { useEffect } from 'react'
import { JAPAN_LAYOUT, toneColor, toneOf } from '@/lib/map-layout'
import type { PrefectureWithVenues, RegionSummary } from '@/server/repo/geo'
import { MapLegend, TileMap } from './TileMap'
import { regionTileItems } from './tile-items'
import { VenueRows } from './VenueLinks'

type Props = {
  regions: RegionSummary[]
  selected?: { region: RegionSummary; prefectures: PrefectureWithVenues[] }
  /** 県の URL で開いたとき、その県の見出しまでスクロールして強調する */
  highlightPrefecture?: string
}

export function DesktopExplorer({ regions, selected, highlightPrefecture }: Props) {
  useEffect(() => {
    if (!highlightPrefecture) return
    document.getElementById(`pref-${highlightPrefecture}`)?.scrollIntoView({ block: 'nearest' })
  }, [highlightPrefecture])

  return (
    <div className="hidden flex-col gap-5 lg:flex">
      <section className="flex flex-col gap-2 px-2 pt-2">
        <span className="kicker text-[13px]">01 — 場所から探す</span>
        <h1 className="m-0 text-[40px] leading-tight font-extrabold">行ける場所から、ライブを探そう。</h1>
        <p className="m-0 text-[15px] leading-relaxed text-fg-muted">
          地図で地方を選ぶと、右側に登録済みの県と会場が表示されます。
        </p>
      </section>
      <div className="flex flex-wrap items-stretch gap-5">
        <section
          aria-label="日本地図"
          className="glass flex min-w-0 flex-[3_1_520px] flex-col items-center gap-4 rounded-panel p-6"
        >
          <TileMap
            layout={JAPAN_LAYOUT}
            items={regionTileItems(regions)}
            label="日本地図（地方を選ぶ）"
            selected={selected?.region.slug}
          />
          <MapLegend activeLabel="情報あり（クリックで選択）" />
        </section>
        <aside aria-label="会場一覧" className="glass flex min-w-0 flex-[2_1_360px] flex-col gap-3.5 rounded-panel p-5">
          {selected ? (
            <RegionPanel {...selected} highlightPrefecture={highlightPrefecture} />
          ) : (
            <p className="m-auto max-w-[260px] text-center text-sm leading-relaxed text-fg-muted">
              地図で色の付いた地方を選ぶと、ここに県と会場の一覧が表示されます。
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function RegionPanel({
  region,
  prefectures,
  highlightPrefecture,
}: {
  region: RegionSummary
  prefectures: PrefectureWithVenues[]
  highlightPrefecture?: string
}) {
  const withVenues = prefectures.filter((p) => p.venues.length > 0)
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="m-0 text-2xl font-extrabold">{region.displayName}</h2>
        <span className="text-[13px] text-fg-muted">
          {prefectureCountLabel(withVenues)} · {region.venueCount}会場
        </span>
      </div>
      {withVenues.map((pref, i) => {
        const tone = toneOf(pref.slug, (i % 2) as 0 | 1)
        return (
          <section key={pref.slug} aria-labelledby={`pref-${pref.slug}`} className="flex flex-col gap-1.5">
            <h3
              id={`pref-${pref.slug}`}
              className={
                highlightPrefecture === pref.slug
                  ? 'm-0 mt-1 flex scroll-mt-6 items-center gap-2 rounded-md px-1 text-sm font-bold text-brand-accent'
                  : 'm-0 mt-1 flex scroll-mt-6 items-center gap-2 px-1 text-sm font-bold'
              }
            >
              <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: toneColor(tone, 0) }} />
              {pref.name}
              <span className="font-medium text-fg-muted">{pref.venues.length}会場</span>
            </h3>
            <VenueRows venues={pref.venues} tone={tone} />
          </section>
        )
      })}
    </>
  )
}

/** 「2県」「1府」のような表記。すべて同じ末尾（都・道・府・県）ならそれを使う */
export function prefectureCountLabel(prefectures: { name: string }[]): string {
  const units = new Set(prefectures.map((p) => p.name.slice(-1)))
  const unit = units.size === 1 ? [...units][0] : '都道府県'
  return `${prefectures.length}${unit}`
}
