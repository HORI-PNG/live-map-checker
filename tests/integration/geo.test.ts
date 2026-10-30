import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createDb } from '@/server/db/client'
import { buildSeedStatements } from '@/server/db/seed/sql.ts'
import { getRegionDetail, getVenueDetail, listRegionSummaries } from '@/server/repo/geo'

const db = createDb(env.DB)
const RANGE = { from: '2026-11-01', to: '2027-04-30' }

describe('listRegionSummaries', () => {
  it('8地方を並び順どおりに返し、九州6会場・関西4会場、ほかは0（準備中）', async () => {
    const regions = await listRegionSummaries(db)
    expect(regions.map((r) => r.slug)).toEqual([
      'hokkaido',
      'tohoku',
      'kanto',
      'chubu',
      'kansai',
      'chugoku',
      'shikoku',
      'kyushu',
    ])
    const count = Object.fromEntries(regions.map((r) => [r.slug, r.venueCount]))
    expect(count).toMatchObject({ kyushu: 6, kansai: 4, kanto: 0, hokkaido: 0 })
    expect(regions.find((r) => r.slug === 'kyushu')?.displayName).toBe('九州・沖縄')
  })
})

describe('getRegionDetail', () => {
  it('九州: 8県すべてを返し、福岡5会場（モックアップの順）と熊本1会場', async () => {
    const detail = await getRegionDetail(db, { regionSlug: 'kyushu' })
    expect(detail?.prefectures).toHaveLength(8)
    const fukuoka = detail?.prefectures.find((p) => p.slug === 'fukuoka')
    expect(fukuoka?.venues.map((v) => v.name)).toEqual([
      'マリンメッセ福岡',
      'みずほPayPayドーム福岡',
      'Zepp Fukuoka',
      '福岡国際センター',
      '北九州メディアドーム',
    ])
    expect(detail?.prefectures.find((p) => p.slug === 'kumamoto')?.venues).toHaveLength(1)
    expect(detail?.prefectures.find((p) => p.slug === 'saga')?.venues).toEqual([])
  })

  it('存在しない地方は null', async () => {
    expect(await getRegionDetail(db, { regionSlug: 'atlantis' })).toBeNull()
    expect(await getRegionDetail(db, { prefectureSlug: 'atlantis' })).toBeNull()
  })
})

describe('getRegionDetail（県の slug から）', () => {
  it('大阪府から関西全体を読み、大阪府の4会場を含む', async () => {
    const detail = await getRegionDetail(db, { prefectureSlug: 'osaka' })
    expect(detail?.region.slug).toBe('kansai')
    expect(detail?.prefectures.find((p) => p.slug === 'osaka')?.venues.map((v) => v.slug)).toEqual([
      'osaka-jo-hall',
      'kyocera-dome-osaka',
      'zepp-osaka-bayside',
      'zepp-namba',
    ])
  })
})

describe('getVenueDetail', () => {
  it('会場・県・地方と、同じ県のほかの会場（自分を除く）', async () => {
    const detail = await getVenueDetail(db, 'marine-messe-fukuoka', RANGE)
    expect(detail?.venue).toMatchObject({ name: 'マリンメッセ福岡', area: '福岡市博多区', fetchMode: 'ai_only' })
    expect(detail?.prefecture.name).toBe('福岡県')
    expect(detail?.region.displayName).toBe('九州・沖縄')
    expect(detail?.otherVenues.map((v) => v.slug)).not.toContain('marine-messe-fukuoka')
    expect(detail?.otherVenues).toHaveLength(4)
  })

  it('無効にした会場は返さない', async () => {
    await env.DB.prepare("UPDATE venues SET is_active = 0 WHERE slug = 'zepp-namba'").run()
    try {
      expect(await getVenueDetail(db, 'zepp-namba', RANGE)).toBeNull()
      expect((await listRegionSummaries(db)).find((r) => r.slug === 'kansai')?.venueCount).toBe(3)
    } finally {
      await env.DB.prepare("UPDATE venues SET is_active = 1 WHERE slug = 'zepp-namba'").run()
    }
  })
})

describe('getVenueDetail の公演', () => {
  it('これからのライブだけを日付順に返す（学会と終わった公演は出さない）', async () => {
    const detail = await getVenueDetail(db, 'marine-messe-fukuoka', RANGE)
    expect(detail?.events.map((e) => e.artistName)).toEqual([
      'アーティスト A',
      'アーティスト B',
      'アーティスト C',
      'アーティスト D',
      'アーティスト E',
    ])
    expect(detail?.events.map((e) => e.date)).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-24',
      '2026-11-30',
      '2026-12-11',
    ])
    expect(detail?.events.find((e) => e.artistName === 'アーティスト C')).toMatchObject({
      sourceKind: 'ai',
      sourceLabel: 'example.com',
    })
  })

  it('判定待ち（unknown）はライブハウス型の会場（Zepp）では表示する', async () => {
    const detail = await getVenueDetail(db, 'zepp-fukuoka', RANGE)
    expect(detail?.events.map((e) => e.artistName)).toEqual(['アーティスト F', 'アーティスト G'])
  })

  it('期間の外は出さない', async () => {
    const detail = await getVenueDetail(db, 'marine-messe-fukuoka', { from: '2026-11-01', to: '2026-11-20' })
    expect(detail?.events).toHaveLength(2)
  })
})

describe('シード', () => {
  it('2回流しても行が増えない（冪等）', async () => {
    await env.DB.batch(buildSeedStatements().map((s) => env.DB.prepare(s)))
    const row = await env.DB.prepare(
      'SELECT (SELECT count(*) FROM venues) AS v, (SELECT count(*) FROM venue_policies) AS p',
    ).first<{ v: number; p: number }>()
    expect(row).toEqual({ v: 10, p: 10 })
  })
})
