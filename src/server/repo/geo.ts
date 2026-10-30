// 地方・県・会場の読み出し（地図と会場一覧の画面で使う）
// 1画面の読み出しは db.batch で1往復にまとめる（D1 へのクエリ回数を抑える）
import { and, asc, eq, gte, lte, or, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Db } from '../db/client'
import { events, prefectures, regions, venues } from '../db/schema'

const activeVenueCount = sql<number>`count(${venues.id})`.mapWith(Number)

export type RegionSummary = { slug: string; name: string; displayName: string; venueCount: number }
export type VenueListItem = { slug: string; name: string; area: string }
export type PrefectureWithVenues = {
  slug: string
  name: string
  shortName: string
  venues: VenueListItem[]
}

const venueListColumns = {
  prefectureId: venues.prefectureId,
  slug: venues.slug,
  name: venues.name,
  area: venues.area,
}

// D1 の batch は行を「列名 → 値」で返すため、結合した表に同じ列名（name, slug など）があると上書きされる。
// 結合する読み出しでは、SQL の側でも重ならない別名（AS）を付けて選ぶ。
function as<T>(column: AnySQLiteColumn<{ data: T }>, alias: string) {
  return sql<T>`${column}`.mapWith(column).as(alias)
}

const regionColumns = {
  regionSlug: as(regions.slug, 'region_slug'),
  regionName: as(regions.name, 'region_name'),
  regionDisplayName: as(regions.displayName, 'region_display_name'),
}
const prefectureColumns = {
  prefectureSlug: as(prefectures.slug, 'prefecture_slug'),
  prefectureName: as(prefectures.name, 'prefecture_name'),
  prefectureShortName: as(prefectures.shortName, 'prefecture_short_name'),
}

function pickRegion(row: { regionSlug: string; regionName: string; regionDisplayName: string }) {
  return { slug: row.regionSlug, name: row.regionName, displayName: row.regionDisplayName }
}

function groupByPrefecture(rows: { prefectureId: number; slug: string; name: string; area: string }[]) {
  const map = new Map<number, VenueListItem[]>()
  for (const { prefectureId, ...venue } of rows) {
    const list = map.get(prefectureId)
    if (list) list.push(venue)
    else map.set(prefectureId, [venue])
  }
  return map
}

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

export type RegionDetail = { region: RegionSummary; prefectures: PrefectureWithVenues[] }

/**
 * 地方・県の画面用: その地方のすべての県（会場が無い県も「準備中」として含む）と会場一覧。
 * 県の画面からは県の slug で、その県が属する地方をまとめて読む（D1 へは1往復）
 */
export async function getRegionDetail(
  db: Db,
  by: { regionSlug: string } | { prefectureSlug: string },
): Promise<RegionDetail | null> {
  const regionMatch =
    'regionSlug' in by
      ? eq(regions.slug, by.regionSlug)
      : eq(
          regions.id,
          sql`(${db.select({ id: prefectures.regionId }).from(prefectures).where(eq(prefectures.slug, by.prefectureSlug))})`,
        )
  const [regionRows, prefRows, venueRows] = await db.batch([
    db.select().from(regions).where(regionMatch),
    db
      .select({ id: prefectures.id, slug: prefectures.slug, name: prefectures.name, shortName: prefectures.shortName })
      .from(prefectures)
      .innerJoin(regions, eq(regions.id, prefectures.regionId))
      .where(regionMatch)
      .orderBy(asc(prefectures.sortOrder)),
    db
      .select(venueListColumns)
      .from(venues)
      .innerJoin(prefectures, eq(prefectures.id, venues.prefectureId))
      .innerJoin(regions, eq(regions.id, prefectures.regionId))
      .where(and(regionMatch, eq(venues.isActive, true)))
      .orderBy(asc(venues.sortOrder)),
  ])
  const region = regionRows[0]
  if (!region) return null
  const venueMap = groupByPrefecture(venueRows)
  const items = prefRows.map(({ id, ...p }) => ({ ...p, venues: venueMap.get(id) ?? [] }))
  return {
    region: {
      slug: region.slug,
      name: region.name,
      displayName: region.displayName,
      venueCount: venueRows.length,
    },
    prefectures: items,
  }
}

export type VenueEvent = {
  id: number
  sourceKind: 'scrape' | 'ai'
  artistName: string | null
  artistNorm: string | null
  title: string
  tourName: string | null
  date: string
  openTime: string | null
  startTime: string | null
  detailUrl: string | null
  sourceUrl: string | null
  sourceLabel: string | null
}

/** 何日先までの公演を表示するか */
export const EVENT_WINDOW_DAYS = 180

/**
 * 会場の画面用: 会場、パンくず・「同じ県のほかの会場」に使う情報、これからの公演（日付順）。
 * 表示する公演: ライブと判定したもの。判定待ち（unknown）はライブハウス型の会場だけ表示する（docs/plan.md 5章）
 */
export async function getVenueDetail(db: Db, venueSlug: string, range: { from: string; to: string }) {
  const siblingPrefecture = db.select({ id: venues.prefectureId }).from(venues).where(eq(venues.slug, venueSlug))
  const [rows, siblingRows, eventRows] = await db.batch([
    db
      .select({
        ...regionColumns,
        ...prefectureColumns,
        venueSlug: as(venues.slug, 'venue_slug'),
        venueName: as(venues.name, 'venue_name'),
        venueArea: as(venues.area, 'venue_area'),
        officialUrl: as(venues.officialUrl, 'venue_official_url'),
        fetchMode: as(venues.fetchMode, 'venue_fetch_mode'),
      })
      .from(venues)
      .innerJoin(prefectures, eq(prefectures.id, venues.prefectureId))
      .innerJoin(regions, eq(regions.id, prefectures.regionId))
      .where(and(eq(venues.slug, venueSlug), eq(venues.isActive, true))),
    db
      .select(venueListColumns)
      .from(venues)
      .where(and(eq(venues.prefectureId, sql`(${siblingPrefecture})`), eq(venues.isActive, true)))
      .orderBy(asc(venues.sortOrder)),
    db
      .select({
        id: events.id,
        sourceKind: events.sourceKind,
        artistName: events.artistName,
        artistNorm: events.artistNorm,
        title: events.title,
        tourName: events.tourName,
        date: events.date,
        openTime: events.openTime,
        startTime: events.startTime,
        detailUrl: events.detailUrl,
        sourceUrl: events.sourceUrl,
        sourceLabel: events.sourceLabel,
      })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(venues.slug, venueSlug),
          eq(events.isActive, true),
          gte(events.date, range.from),
          lte(events.date, range.to),
          or(eq(events.category, 'live'), and(eq(events.category, 'unknown'), eq(venues.venueKind, 'music_hall'))),
        ),
      )
      .orderBy(asc(events.date), asc(events.startTime), asc(events.id)),
  ])
  const row = rows[0]
  if (!row) return null
  return {
    region: pickRegion(row),
    prefecture: { slug: row.prefectureSlug, name: row.prefectureName },
    venue: {
      slug: row.venueSlug,
      name: row.venueName,
      area: row.venueArea,
      officialUrl: row.officialUrl,
      fetchMode: row.fetchMode,
    },
    otherVenues: siblingRows.filter((v) => v.slug !== venueSlug).map(({ prefectureId: _, ...v }) => v),
    events: eventRows satisfies VenueEvent[],
  }
}
