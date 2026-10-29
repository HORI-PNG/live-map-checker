import { describe, expect, it } from 'vitest'
import { JAPAN_LAYOUT, REGION_LAYOUTS, type TileLayout, toneOf } from '@/lib/map-layout'
import { PREFECTURES, REGIONS } from '@/server/db/seed/data.ts'

const layouts: [string, TileLayout][] = [['japan', JAPAN_LAYOUT], ...Object.entries(REGION_LAYOUTS)]

describe.each(layouts)('タイル配置 %s', (_, layout) => {
  it('すべてのタイルが枠の内側にある', () => {
    for (const t of layout.tiles) {
      expect(t.x + t.w, t.slug).toBeLessThanOrEqual(layout.width)
      expect(t.y + t.h, t.slug).toBeLessThanOrEqual(layout.height)
    }
  })

  it('タイル同士が重ならない', () => {
    for (const [i, a] of layout.tiles.entries()) {
      for (const b of layout.tiles.slice(i + 1)) {
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `${a.slug} と ${b.slug}`).toBe(false)
      }
    }
  })
})

it('色はモックアップどおり（九州・福岡はミント、関西・大阪・熊本はティール）', () => {
  expect([toneOf('kyushu'), toneOf('fukuoka'), toneOf('kansai'), toneOf('osaka'), toneOf('kumamoto')]).toEqual([
    0, 0, 1, 1, 1,
  ])
})

describe('配置とシードデータの対応', () => {
  it('日本地図のタイルは、シードの8地方とちょうど一致する', () => {
    expect(JAPAN_LAYOUT.tiles.map((t) => t.slug).sort()).toEqual(REGIONS.map((r) => r.slug).sort())
  })

  it.each(Object.entries(REGION_LAYOUTS))('%s のタイルは、その地方の県とちょうど一致する', (region, layout) => {
    const expected = PREFECTURES.filter((p) => p.region === region).map((p) => p.slug)
    expect(layout.tiles.map((t) => t.slug).sort()).toEqual(expected.sort())
  })
})
