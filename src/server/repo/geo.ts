// 地方・県・会場の読み出し（地図と会場一覧の画面で使う）
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { prefectures, regions, venues } from '../db/schema'

const activeVenueCount = sql<number>`count(${venues.id})`.mapWith(Number)

export type RegionSummary = { slug: string; name: string; displayName: string; venueCount: number }

/** 地図のタイル用: すべての地方と、登録済み（有効）会場の数。0 の地方は「準備中」 */
export async function listRegionSummaries(db: Db): Promise<RegionSummary[]> {
  return db
    .select({
      slug: regions.slug,
      name: regions.name,
      displayName: regions.displayName,
      venueCount: activeVenueCount,
    })
    .from(regions)
    .leftJoin(prefectures, eq(prefectures.regionId, regions.id))
    .leftJoin(venues, and(eq(venues.prefectureId, prefectures.id), eq(venues.isActive, true)))
    .groupBy(regions.id)
    .orderBy(asc(regions.sortOrder))
}

export type VenueListItem = { slug: string; name: string; area: string; sortOrder: number }
export type PrefectureWithVenues = {
  slug: string
  name: string
  shortName: string
  venues: VenueListItem[]
}

async function venuesByPrefecture(db: Db, prefectureIds: number[]) {
  if (prefectureIds.length === 0) return new Map<number, VenueListItem[]>()
  const rows = await db
    .select({
      prefectureId: venues.prefectureId,
      slug: venues.slug,
      name: venues.name,
      area: venues.area,
      sortOrder: venues.sortOrder,
    })
    .from(venues)
    .where(and(eq(venues.isActive, true), sql`${venues.prefectureId} in ${prefectureIds}`))
    .orderBy(asc(venues.sortOrder))
  const map = new Map<number, VenueListItem[]>()
  for (const { prefectureId, ...venue } of rows) {
    map.set(prefectureId, [...(map.get(prefectureId) ?? []), venue])
  }
  return map
}

/** 地方の画面用: その地方のすべての県（会場が無い県も「準備中」として含む）と会場一覧 */
export async function getRegionDetail(
  db: Db,
  regionSlug: string,
): Promise<{ region: RegionSummary; prefectures: PrefectureWithVenues[] } | null> {
  const region = await db.query.regions.findFirst({ where: eq(regions.slug, regionSlug) })
  if (!region) return null
  const prefs = await db.query.prefectures.findMany({
    where: eq(prefectures.regionId, region.id),
    orderBy: asc(prefectures.sortOrder),
  })
  const venueMap = await venuesByPrefecture(
    db,
    prefs.map((p) => p.id),
  )
  const items = prefs.map((p) => ({
    slug: p.slug,
    name: p.name,
    shortName: p.shortName,
    venues: venueMap.get(p.id) ?? [],
  }))
  return {
    region: {
      slug: region.slug,
      name: region.name,
      displayName: region.displayName,
      venueCount: items.reduce((n, p) => n + p.venues.length, 0),
    },
    prefectures: items,
  }
}

/** 県の画面用: 県と、その県の会場一覧（パンくず用に地方も返す） */
export async function getPrefectureDetail(db: Db, prefectureSlug: string) {
  const row = await db
    .select({ prefecture: prefectures, region: regions })
    .from(prefectures)
    .innerJoin(regions, eq(regions.id, prefectures.regionId))
    .where(eq(prefectures.slug, prefectureSlug))
    .get()
  if (!row) return null
  const venueMap = await venuesByPrefecture(db, [row.prefecture.id])
  return {
    region: { slug: row.region.slug, name: row.region.name, displayName: row.region.displayName },
    prefecture: { slug: row.prefecture.slug, name: row.prefecture.name, shortName: row.prefecture.shortName },
    venues: venueMap.get(row.prefecture.id) ?? [],
  }
}

/** 会場の画面用: 会場と、パンくず・「同じ県のほかの会場」に使う情報 */
export async function getVenueDetail(db: Db, venueSlug: string) {
  const row = await db
    .select({ venue: venues, prefecture: prefectures, region: regions })
    .from(venues)
    .innerJoin(prefectures, eq(prefectures.id, venues.prefectureId))
    .innerJoin(regions, eq(regions.id, prefectures.regionId))
    .where(and(eq(venues.slug, venueSlug), eq(venues.isActive, true)))
    .get()
  if (!row) return null
  const siblings = (await venuesByPrefecture(db, [row.prefecture.id])).get(row.prefecture.id) ?? []
  return {
    region: { slug: row.region.slug, name: row.region.name, displayName: row.region.displayName },
    prefecture: { slug: row.prefecture.slug, name: row.prefecture.name },
    venue: {
      slug: row.venue.slug,
      name: row.venue.name,
      area: row.venue.area,
      officialUrl: row.venue.officialUrl,
      fetchMode: row.venue.fetchMode,
    },
    otherVenues: siblings.filter((v) => v.slug !== row.venue.slug),
  }
}
