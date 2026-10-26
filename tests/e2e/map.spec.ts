import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('スマホ: 地図 → 地方 → 県 → 会場', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'スマホ幅だけ')

  test('タイルをたどって会場まで進み、パンくずと戻るボタンが正しい', async ({ page }) => {
    await open(page, '/')
    const japan = page.getByRole('navigation', { name: '日本地図（地方を選ぶ）' })
    await expect(japan.getByRole('link')).toHaveCount(2) // 九州・関西だけ選べる
    await expect(japan.getByText('北海道（準備中）')).toBeVisible()

    await japan.getByRole('link', { name: /^九州\s*、\s*6会場$/ }).click()
    await expect(page).toHaveURL('/regions/kyushu')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('九州・沖縄')
    await expect(page.getByRole('navigation', { name: '現在地' })).toHaveText('日本地図/九州')

    await page.getByRole('link', { name: /^福岡\s*、\s*5会場$/ }).click()
    await expect(page).toHaveURL('/prefectures/fukuoka')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('福岡県')
    const venues = page.getByRole('main').getByRole('link', { name: /福岡市|北九州市/ })
    await expect(venues).toHaveCount(5)
    await expect(venues.first()).toContainText('マリンメッセ福岡')

    await page.getByRole('link', { name: /Zepp Fukuoka/ }).click()
    await expect(page).toHaveURL('/venues/zepp-fukuoka')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zepp Fukuoka')
    await expect(page.getByRole('navigation', { name: '現在地' })).toContainText('日本地図/九州/福岡県/Zepp Fukuoka')

    await page.getByRole('link', { name: '福岡県の会場一覧に戻る' }).click()
    await expect(page).toHaveURL('/prefectures/fukuoka')
    await page.getByRole('link', { name: '九州に戻る' }).click()
    await expect(page).toHaveURL('/regions/kyushu')
  })

  test('関西は大阪府だけ選べる', async ({ page }) => {
    await open(page, '/regions/kansai')
    const map = page.getByRole('navigation', { name: '関西の地図（県を選ぶ）' })
    await expect(map.getByRole('link')).toHaveCount(1)
    await expect(map.getByRole('link', { name: /^大阪\s*、\s*4会場$/ })).toBeVisible()
  })
})

test.describe('PC: 地図＋右パネル', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'PC 幅だけ')

  test('地方を選ぶと、同じ画面の右側に県と会場の一覧が出る', async ({ page }) => {
    await open(page, '/')
    const panel = page.getByRole('complementary', { name: '会場一覧' })
    await expect(panel).toContainText('地方を選ぶと')
    await page.getByRole('link', { name: /^関西\s*、\s*4会場$/ }).click()
    await expect(page).toHaveURL('/regions/kansai')
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('関西')
    await expect(panel).toContainText('1府 · 4会場')
    await expect(panel.getByRole('link')).toHaveCount(4)

    await page.getByRole('link', { name: /^九州\s*、\s*6会場$/ }).click()
    await expect(panel).toContainText('2県 · 6会場')
    await expect(page.getByRole('link', { name: /^九州\s*、\s*6会場$/ })).toHaveAttribute('aria-current', 'page')
  })

  test('県の URL で開くと、その地方のパネルを表示する', async ({ page }) => {
    await open(page, '/prefectures/kumamoto')
    const panel = page.getByRole('complementary', { name: '会場一覧' })
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('九州・沖縄')
    await expect(panel.getByRole('heading', { name: /熊本県/ })).toBeVisible()
  })
})

for (const path of ['/regions/atlantis', '/regions/Kyushu', '/prefectures/fukuoka%27', '/venues/no-such-venue']) {
  test(`存在しない・形の違う URL は 404: ${path}`, async ({ page }) => {
    await open(page, path)
    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()
  })
}
