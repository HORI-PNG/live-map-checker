// 地図・地方・県・会場の画面から呼ぶサーバー関数（ルートの loader で使う）
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '../db/client'
import { getPrefectureDetail, getRegionDetail, getVenueDetail, listRegionSummaries } from '../repo/geo'

const slugInput = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,64}$/) })

/** トップ: 日本地図のタイル */
export const fetchJapanMap = createServerFn().handler(async () => {
  return { regions: await listRegionSummaries(getDb()) }
})

/** 地方: 日本地図（PC 用）と、その地方の県・会場 */
export const fetchRegion = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const [regions, detail] = await Promise.all([listRegionSummaries(db), getRegionDetail(db, data.slug)])
    if (!detail) throw notFound()
    return { regions, ...detail }
  })

/** 県: 県の会場一覧（スマホ）と、PC で表示する地方全体 */
export const fetchPrefecture = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const prefecture = await getPrefectureDetail(db, data.slug)
    if (!prefecture) throw notFound()
    const [regions, region] = await Promise.all([listRegionSummaries(db), getRegionDetail(db, prefecture.region.slug)])
    if (!region) throw notFound()
    return { regions, prefecture, regionDetail: region }
  })

/** 会場: 会場の情報（ライブ一覧は feat/venue-page で追加する） */
export const fetchVenue = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const venue = await getVenueDetail(getDb(), data.slug)
    if (!venue) throw notFound()
    return venue
  })
