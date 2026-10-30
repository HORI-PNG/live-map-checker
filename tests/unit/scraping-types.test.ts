import { describe, expect, it } from 'vitest'
import { addMonths, decodeEntities, toDetailUrl, toTime, validateEvents } from '@/server/scraping/types'

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
    const result = validateEvents([
      ok,
      { ...ok, date: '2026-11-1' },
      { ...ok, title: ' ' },
      { ...ok, detailUrl: 'javascript:alert(1)' },
    ])
    expect(result.events).toHaveLength(1)
    expect(result.invalid).toBe(3)
  })

  it('toDetailUrl: 取得元と同じホストの http/https だけ残す', () => {
    const page = 'https://www.zepp.co.jp/hall/fukuoka/schedule/?_y=2026&_m=11'
    expect(toDetailUrl('/hall/fukuoka/schedule/single/?rid=1', page)).toBe(
      'https://www.zepp.co.jp/hall/fukuoka/schedule/single/?rid=1',
    )
    expect(toDetailUrl('https://www.zepp.co.jp/x', page)).toBe('https://www.zepp.co.jp/x')
    expect(toDetailUrl('javascript:alert(1)', page)).toBeNull()
    expect(toDetailUrl('data:text/html,x', page)).toBeNull()
    expect(toDetailUrl('https://evil.example/x', page)).toBeNull()
    expect(toDetailUrl('http://[', page)).toBeNull()
    expect(toDetailUrl('', page)).toBeNull()
    expect(toDetailUrl(null, page)).toBeNull()
  })
})
