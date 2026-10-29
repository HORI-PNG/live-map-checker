import { useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'lmc:theme'
export const DEFAULT_THEME: ThemePreference = 'dark'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * <head> で描画前に実行し、保存済みのテーマを <html> に反映する（白い画面のちらつき防止）。
 * localStorage が使えない環境では初期値（ダーク）のまま。
 * 上の関数と同じ判定を文字列で持つため、tests/unit/theme.test.ts で実際に実行して一致を確かめている。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(p!=='system'&&p!=='light'&&p!=='dark')p='${DEFAULT_THEME}';var d=p==='dark'||(p==='system'&&matchMedia('${SYSTEM_DARK_QUERY}').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

// --- 選んだテーマ（system / light / dark）の保存と反映 ---

const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(preference: ThemePreference) {
  const dark = resolveTheme(preference, matchMedia(SYSTEM_DARK_QUERY).matches) === 'dark'
  document.documentElement.classList.toggle('dark', dark)
}

function subscribePreference(onChange: () => void) {
  listeners.add(onChange)
  // ほかのタブで変更されたときも追従する
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return
    applyTheme(readPreference())
    onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // 保存できなくても、このページの表示だけは切り替える
  }
  applyTheme(preference)
  for (const listener of listeners) listener()
}

/** 選んだテーマと、変更する関数。サーバー描画時は初期値（ダーク） */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => DEFAULT_THEME)
  return [preference, setThemePreference]
}

/** 「システム」を選んでいる間、端末のダーク／ライトの切り替えに追従する。AppShell で1回だけ使う */
export function useFollowSystemTheme() {
  const [preference] = useThemePreference()
  useEffect(() => {
    if (preference !== 'system') return
    const query = matchMedia(SYSTEM_DARK_QUERY)
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])
}

// --- いま画面に適用されているテーマ（<html class="dark"> の有無） ---

function subscribeHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** サーバー描画時は初期値のダーク */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribeHtmlClass,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'dark',
  )
}
