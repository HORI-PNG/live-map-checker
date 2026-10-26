import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { buildSeedStatements } from '@/server/db/seed/sql.ts'

// 未適用のマイグレーションだけ適用し、シードを入れる（どちらも何度実行しても同じ結果）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
await env.DB.batch(buildSeedStatements().map((s) => env.DB.prepare(s)))
