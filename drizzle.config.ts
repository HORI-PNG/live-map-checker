import { defineConfig } from 'drizzle-kit'

// マイグレーションの SQL を生成するだけ（適用は wrangler d1 migrations apply）。DB への接続情報は不要
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle/migrations',
})
