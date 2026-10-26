export type TabId = 'map' | 'fav' | 'account'

export const TABS = [
  { id: 'map', label: 'マップ', to: '/' },
  { id: 'fav', label: 'お気に入り', to: '/favorites' },
  { id: 'account', label: 'アカウント', to: '/account' },
] as const satisfies readonly { id: TabId; label: string; to: string }[]

/** URL から、いま選ばれているタブを決める（地図・地方・県・会場はすべて「マップ」） */
export function activeTabIndex(pathname: string): number {
  if (pathname === '/favorites' || pathname.startsWith('/favorites/')) return 1
  if (pathname === '/account' || pathname.startsWith('/account/')) return 2
  return 0
}

/** 下部ナビのスライド: 指の位置（ナビ左端からの px）をインジケーターの位置に変換する */
export function dragOffset(pointerX: number, tabWidth: number, stride: number, count: number): number {
  const x = pointerX - 6 - 1 - tabWidth / 2 // ナビの padding 6px と枠線 1px、指はインジケーターの中央
  return Math.max(0, Math.min(stride * (count - 1), x))
}

/** インジケーターの位置から、一番近いタブの番号 */
export function nearestTab(offset: number, stride: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(offset / stride)))
}
