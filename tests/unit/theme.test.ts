import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isThemePreference, resolveTheme } from '@/lib/theme'

describe('theme', () => {
  it('初期値はダーク', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })

  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('%s（端末ダーク=%s）は %s になる', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected)
  })

  it('保存値の検査', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})
