import { describe, expect, it } from 'vitest'
import { activeTabIndex, dragOffset, nearestTab } from '@/components/nav/nav-items'

describe('activeTabIndex', () => {
  it.each([
    ['/', 0],
    ['/regions/kyushu', 0],
    ['/venues/zepp-fukuoka', 0],
    ['/favorites', 1],
    ['/account', 2],
    ['/accounting', 0],
  ])('%s → %i', (path, index) => {
    expect(activeTabIndex(path)).toBe(index)
  })
})

describe('下部ナビのスライド（モックアップの幅 358px: タブ幅 112px、間隔 116px）', () => {
  it('指の位置をインジケーターの位置に変換し、両端で止める', () => {
    expect(dragOffset(63, 112, 116, 3)).toBe(0) // 1つ目のタブの中央
    expect(dragOffset(179, 112, 116, 3)).toBe(116) // 2つ目のタブの中央
    expect(dragOffset(-50, 112, 116, 3)).toBe(0)
    expect(dragOffset(999, 112, 116, 3)).toBe(232)
  })

  it('離した位置から一番近いタブを選ぶ', () => {
    expect(nearestTab(57, 116, 3)).toBe(0)
    expect(nearestTab(59, 116, 3)).toBe(1)
    expect(nearestTab(232, 116, 3)).toBe(2)
  })
})
