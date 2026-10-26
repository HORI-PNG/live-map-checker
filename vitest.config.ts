import { defineConfig } from 'vitest/config'

// 単体テスト（Node 上で動く純粋な関数）。D1 を使う結合テストは feat/db-schema-seed で追加する
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
