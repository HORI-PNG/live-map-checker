import type { Page } from '@playwright/test'

/** ページを開き、React のハイドレーションが終わる（クリックなどに反応できる）まで待つ */
export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
}
