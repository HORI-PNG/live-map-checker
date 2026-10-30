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
  await open(page, '/venues/zepp-osaka-bayside')
  await expect(page.getByText('これから半年のライブは、まだ見つかっていません。')).toBeVisible()
})

test('会場: ルールで決まらなかったタイトルは、開くと AI（mock）が判定し、ライブなら表示する', async ({ page }) => {
  // 熊本城ホール（多目的ホール）の「アーティスト J スペシャルナイト」は判定待ち（unknown）なので、最初は出ない
  await open(page, '/venues/kumamoto-jo-hall')
  const list = page.getByRole('region', { name: 'ライブ一覧' })
  await expect(list.getByRole('heading', { level: 3, name: 'アーティスト J' })).toBeVisible({ timeout: 20_000 })
  await page.reload()
  await expect(list.getByRole('heading', { level: 3, name: 'アーティスト J' })).toBeVisible()
})

test('会場: AI だけで探す会場は、開くと AI 検索（mock）が走り、出典を確かめた公演だけを出す', async ({ page }) => {
  // この会場にはサンプル公演も検索の記録も無い（global-setup で毎回消している）。並列の別のテストと
  // 同じ会場を使わないように、スマホ幅と PC 幅で別の会場にする
  const venue = (page.viewportSize()?.width ?? 0) >= 1024 ? 'kitakyushu-media-dome' : 'mizuho-paypay-dome-fukuoka'
  await open(page, `/venues/${venue}`)
  const list = page.getByRole('region', { name: 'ライブ一覧' })
  await expect(list.getByRole('heading', { level: 3 })).toHaveText(['モック・アーティスト', 'MOCK BAND'], {
    timeout: 20_000,
  })
  const card = list.getByRole('article').first()
  await expect(card.getByText('AIによる検索')).toBeVisible()
  await expect(card.getByRole('link', { name: /出典：mock\.example/ })).toHaveAttribute(
    'href',
    /^https:\/\/mock\.example\//,
  )
  await expect(list.getByText('架空の公演')).toHaveCount(0)
  await expect(list.getByText(/AI による検索の最終確認/)).toBeVisible()
  // 開き直すと、24時間以内の結果を使う（検索中の表示は出ない）
  await page.reload()
  await expect(list.getByRole('heading', { level: 3 })).toHaveCount(2)
  await expect(list.getByText('AI で公演を検索しています…')).toHaveCount(0)
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
