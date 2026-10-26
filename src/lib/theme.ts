import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'lmc:theme'
export const DEFAULT_THEME: ThemePreference = 'dark'

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
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(p!=='system'&&p!=='light'&&p!=='dark')p='${DEFAULT_THEME}';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

function subscribeHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** いま画面に適用されているテーマ（<html class="dark"> の有無）。サーバー描画時は初期値のダーク */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribeHtmlClass,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'dark',
  )
}
