import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('スマホ: 下部ナビ', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'スマホ幅だけ')

  test('タップでタブを移動し、現在のタブが分かる', async ({ page }) => {
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'メインメニュー' })
    await expect(nav.getByRole('link', { name: 'マップ' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'お気に入り' }).click()
    await expect(page).toHaveURL('/favorites')
    await expect(nav.getByRole('link', { name: 'お気に入り' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'アカウント' }).click()
    await expect(page).toHaveURL('/account')
  })

  test('長押しでインジケーターを持ち上げ、スライドして離したタブへ移動する', async ({ page }) => {
    await open(page, '/')
    const nav = page.getByRole('navigation', { name: 'メインメニュー' })
    const box = await nav.boundingBox()
    if (!box) throw new Error('ナビが見つからない')
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 6, y)
    await page.mouse.down()
    await page.waitForTimeout(400) // 長押し（0.25秒）
    await expect(nav.locator('[data-dragging]')).toHaveCount(1)
    await page.mouse.move(box.x + (box.width * 5) / 6, y, { steps: 8 })
    await page.mouse.up()
    await expect(page).toHaveURL('/account')
    await expect(nav.locator('[data-dragging]')).toHaveCount(0)
  })

  test('長押しして元の位置で離したら移動しない', async ({ page }) => {
    await open(page, '/favorites')
    const nav = page.getByRole('navigation', { name: 'メインメニュー' })
    const box = await nav.boundingBox()
    if (!box) throw new Error('ナビが見つからない')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(400)
    await page.mouse.up()
    await expect(page).toHaveURL('/favorites')
  })
})

test.describe('PC: 左ナビ', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'PC 幅だけ')

  test('左ナビで移動でき、下部ナビは表示されない', async ({ page }) => {
    await open(page, '/')
    const navs = page.getByRole('navigation', { name: 'メインメニュー' })
    await expect(navs).toHaveCount(1)
    await navs.getByRole('link', { name: 'アカウント' }).click()
    await expect(page).toHaveURL('/account')
    await expect(navs.getByRole('link', { name: 'アカウント' })).toHaveAttribute('aria-current', 'page')
  })
})

test('アカウント画面でテーマを切り替えると、再読み込み後も保たれる', async ({ page }) => {
  await open(page, '/account')
  const html = page.locator('html')
  await expect(html).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'ダーク' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'ライト' }).click()
  await expect(html).not.toHaveClass(/dark/)
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await expect(html).not.toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'ライト' })).toHaveAttribute('aria-pressed', 'true')
})

test('存在しないページは 404 の案内とパンくずを出し、戻るボタンで地図へ', async ({ page }) => {
  await open(page, '/no-such-page')
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '現在地' })).toContainText('日本地図')
  await page.getByRole('link', { name: '日本地図に戻る' }).click()
  await expect(page).toHaveURL('/')
})
