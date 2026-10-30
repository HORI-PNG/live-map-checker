import { describe, expect, it } from 'vitest'
import { normalizeText } from '@/shared/normalize'

describe('normalizeText', () => {
  it.each([
    ['ＡＢＣ　ＬＩＶＥ', 'abclive'],
    ['ｱｰﾃｨｽﾄ', 'アーティスト'],
    ['あーてぃすと', 'アーティスト'],
    ['Mrs. GREEN APPLE', 'mrsgreenapple'],
    ['アーティスト・A ～TOUR 2026～', 'アーティストaーtour2026ー'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected)
  })
})
