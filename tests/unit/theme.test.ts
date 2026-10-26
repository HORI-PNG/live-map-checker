import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isThemePreference, resolveTheme, THEME_INIT_SCRIPT } from '@/lib/theme'

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

// <head> の文字列スクリプトが、TS の resolveTheme と同じ結果になることを実際に実行して確かめる
describe('THEME_INIT_SCRIPT', () => {
  function runScript(stored: string | null, systemDark: boolean, storageThrows = false): boolean {
    const classes = new Set<string>()
    const env = {
      localStorage: {
        getItem: () => {
          if (storageThrows) throw new Error('blocked')
          return stored
        },
      },
      matchMedia: () => ({ matches: systemDark }),
      document: {
        documentElement: {
          classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
        },
      },
    }
    new Function('localStorage', 'matchMedia', 'document', THEME_INIT_SCRIPT)(
      env.localStorage,
      env.matchMedia,
      env.document,
    )
    return classes.has('dark')
  }

  it.each([
    [null, false],
    [null, true],
    ['broken', false],
    ['dark', false],
    ['light', true],
    ['system', true],
    ['system', false],
  ] as const)('保存値 %s・端末ダーク=%s', (stored, systemDark) => {
    const preference = isThemePreference(stored) ? stored : DEFAULT_THEME
    expect(runScript(stored, systemDark)).toBe(resolveTheme(preference, systemDark) === 'dark')
  })

  it('localStorage が使えなくても例外を出さない（クラスは初期の dark のまま触らない）', () => {
    expect(() => runScript(null, false, true)).not.toThrow()
  })
})
