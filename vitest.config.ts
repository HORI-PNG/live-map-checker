import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        // 単体テスト: Node 上で動く純粋な関数
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        // 結合テスト: Workers の実行環境（workerd）とローカルの D1。マイグレーションとシードを入れてから動かす
        extends: true,
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              compatibilityDate: '2026-10-19',
              compatibilityFlags: ['nodejs_compat'],
              d1Databases: ['DB'],
              bindings: { TEST_MIGRATIONS: await readD1Migrations('drizzle/migrations') },
            },
          })),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
        },
      },
    ],
  },
})
