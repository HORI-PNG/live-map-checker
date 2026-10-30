import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('会場: これからのライブを月ごと・日付順に表示し、学会や終わった公演は出さない', async ({ page }) => {
  await open(page, '/venues/marine-messe-fukuoka')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('マリンメッセ福岡')
  const list = page.getByRole('region', { name: 'ライブ一覧' })
  const titles = list.getByRole('heading', { level: 3 })
  await expect(titles).toHaveText([
    'アーティスト A',
    'アーティスト B',
    'アーティスト C',
    'アーティスト D',
    'アーティスト E',
  ])
  const cards = list.getByRole('article')
  await expect(cards.filter({ hasText: '学会' })).toHaveCount(0)
  await expect(cards.filter({ hasText: '終わった公演' })).toHaveCount(0)
  await expect(list.getByRole('heading', { level: 2 }).first()).toHaveText(/^\d{4}年\d{1,2}月$/)
})

test('会場: AI で取得した公演だけに「AIによる検索」と出典リンクが付く', async ({ page }) => {
  await open(page, '/venues/marine-messe-fukuoka')
  const cards = page.getByRole('article')
  const aiCard = cards.filter({ hasText: 'アーティスト C' })
  await expect(aiCard.getByText('AIによる検索')).toBeVisible()
  await expect(aiCard.getByRole('link', { name: /出典：example\.com/ })).toHaveAttribute('href', /example\.com/)
  await expect(cards.filter({ hasText: 'アーティスト A' }).getByText('AIによる検索')).toHaveCount(0)
  await expect(cards.first().getByRole('link', { name: /詳細/ })).toHaveAttribute('target', '_blank')
})

test('会場: 表示の切り替えは URL に残り、再読み込みしても保たれる', async ({ page }) => {
  await open(page, '/venues/marine-messe-fukuoka')
  await page.getByRole('button', { name: 'お気に入りが来るか' }).click()
  await expect(page).toHaveURL(/mode=fav/)
  await expect(page.getByRole('button', { name: 'お気に入りが来るか' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('link', { name: 'お気に入りを登録する' })).toBeVisible()
  await page.getByRole('button', { name: 'すべてのライブ' }).click()
  await expect(page).not.toHaveURL(/mode=/)
})

test('会場: 公演が無い会場は案内を出す', async ({ page }) => {
  await open(page, '/venues/kumamoto-jo-hall')
  await expect(page.getByText('これから半年のライブは、まだ見つかっていません。')).toBeVisible()
})

test.describe('PC: 会場', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'PC 幅だけ')

  test('左に同じ県のほかの会場があり、移動できる', async ({ page }) => {
    await open(page, '/venues/marine-messe-fukuoka')
    const others = page.getByRole('navigation', { name: '福岡県のほかの会場' })
    await expect(others.getByRole('link')).toHaveCount(4)
    await others.getByRole('link', { name: 'Zepp Fukuoka' }).click()
    await expect(page).toHaveURL('/venues/zepp-fukuoka')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zepp Fukuoka')
  })
})
