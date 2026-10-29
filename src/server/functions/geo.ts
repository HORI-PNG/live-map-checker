// 地図・地方・県・会場の画面から呼ぶサーバー関数（ルートの loader で使う）
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '../db/client'
import { getRegionDetail, getVenueDetail, listRegionSummaries } from '../repo/geo'

// URL から来る値。形が違うもの（大文字・記号など）はエラーではなく「見つからない」として扱う
const slugInput = z.object({ slug: z.string().max(100) })
const SLUG = /^[a-z0-9-]{1,64}$/

function requireSlug(slug: string): string {
  if (!SLUG.test(slug)) throw notFound()
  return slug
}

/** 日本地図のタイル（全画面共通。ルートの loader で読み、しばらく使い回す） */
export const fetchJapanMap = createServerFn().handler(async () => {
  return { regions: await listRegionSummaries(getDb()) }
})

/** 地方: その地方の県と会場 */
export const fetchRegion = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const detail = await getRegionDetail(getDb(), { regionSlug: requireSlug(data.slug) })
    if (!detail) throw notFound()
    return detail
  })

/** 県: その県が属する地方の県と会場（スマホは県の会場一覧、PC は地方全体を表示） */
export const fetchPrefecture = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const slug = requireSlug(data.slug)
    const detail = await getRegionDetail(getDb(), { prefectureSlug: slug })
    const prefecture = detail?.prefectures.find((p) => p.slug === slug)
    if (!detail || !prefecture) throw notFound()
    return { ...detail, prefecture }
  })

/** 会場: 会場の情報（ライブ一覧は feat/venue-page で追加する） */
export const fetchVenue = createServerFn()
  .validator(slugInput)
  .handler(async ({ data }) => {
    const venue = await getVenueDetail(getDb(), requireSlug(data.slug))
    if (!venue) throw notFound()
    return venue
  })
