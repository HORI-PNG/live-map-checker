export type TabId = 'map' | 'fav' | 'account'

export const TABS = [
  { id: 'map', label: 'マップ', to: '/' },
  { id: 'fav', label: 'お気に入り', to: '/favorites' },
  { id: 'account', label: 'アカウント', to: '/account' },
] as const satisfies readonly { id: TabId; label: string; to: string }[]

/** URL から、いま選ばれているタブを決める（地図・地方・県・会場はすべて「マップ」） */
export function activeTabIndex(pathname: string): number {
  const index = TABS.findIndex((tab) => tab.to !== '/' && (pathname === tab.to || pathname.startsWith(`${tab.to}/`)))
  return index === -1 ? 0 : index
}

/**
 * 下部ナビのスライド: 指の位置（最初のタブの左端からの px）を、インジケーターの位置に変換する。
 * 指がインジケーターの中央に来るようにし、両端のタブで止める
 */
export function dragOffset(pointerX: number, tabWidth: number, stride: number, count: number): number {
  return Math.max(0, Math.min(stride * (count - 1), pointerX - tabWidth / 2))
}

/** インジケーターの位置から、一番近いタブの番号 */
export function nearestTab(offset: number, stride: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(offset / stride)))
}
