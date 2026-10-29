import type { PrefectureWithVenues, RegionSummary } from '@/server/repo/geo'
import type { TileItem } from './TileMap'

export function regionTileItems(regions: RegionSummary[]): Record<string, TileItem> {
  return Object.fromEntries(
    regions.map((r) => [
      r.slug,
      { label: r.name, venueCount: r.venueCount, to: '/regions/$region', params: { region: r.slug } },
    ]),
  )
}

export function prefectureTileItems(prefectures: PrefectureWithVenues[]): Record<string, TileItem> {
  return Object.fromEntries(
    prefectures.map((p) => [
      p.slug,
      { label: p.shortName, venueCount: p.venues.length, to: '/prefectures/$pref', params: { pref: p.slug } },
    ]),
  )
}
