import { describe, expect, it } from 'vitest'
import { addMonths, decodeEntities, toTime, validateEvents } from '@/server/scraping/types'

describe('scraping の共通処理', () => {
  it('decodeEntities: 名前付き・数値の文字参照を戻す。知らないものはそのまま', () => {
    expect(decodeEntities('TOUR 2026 &quot;Another&quot; &amp; more &#39;x&#39; &#x2603;')).toBe(
      `TOUR 2026 "Another" & more 'x' ☃`,
    )
    expect(decodeEntities('&unknown; &#0;')).toBe('&unknown; &#0;')
  })

  it('addMonths は年をまたぐ', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-10', 5)).toBe('2027-03')
  })

  it('toTime', () => {
    expect(toTime('18:00〜')).toBe('18:00')
    expect(toTime('9:30')).toBe('09:30')
    expect(toTime('未定')).toBeNull()
  })

  it('validateEvents は不正な行を数えて捨てる', () => {
    const ok = {
      title: 'A',
      artistName: null,
      tourName: null,
      date: '2026-11-01',
      openTime: null,
      startTime: '18:00',
      detailUrl: null,
      venueCategory: null,
    }
    const result = validateEvents([ok, { ...ok, date: '2026-11-1' }, { ...ok, title: ' ' }])
    expect(result.events).toHaveLength(1)
    expect(result.invalid).toBe(2)
  })
})
