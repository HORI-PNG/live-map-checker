import { defineConfig, devices } from '@playwright/test'

const PORT = 3000

export default defineConfig({
  testDir: 'tests/e2e',
  // サンプル公演の日付は「流した日」からの相対なので、毎回流し直して今日基準にそろえる
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    // スマホ幅 390px（モックアップと同じ）とPC幅 1440px
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // AI は mock にする（wrangler.jsonc の本番用の値を上書きする。.dev.vars があるとそちらが優先されるので注意）
    env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', AI_PROVIDER: 'mock', AI_MODEL: 'mock', AI_DAILY_BUDGET_USD: '1' },
  },
})
