import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('トップが日本語・ダークモードで表示される', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Live Map Checker')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('行ける場所から')
})

test('保存したライトモードが再読み込み後も保たれる', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('lmc:theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('アクセシビリティの重大な違反がない', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
})
