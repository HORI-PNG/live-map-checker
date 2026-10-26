import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { buildSeedSql } from '@/server/db/seed/sql.ts'

// 未適用のマイグレーションだけ適用し、シードを入れる（どちらも何度実行しても同じ結果）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
const statements = buildSeedSql().trim().split('\n')
await env.DB.batch(statements.map((s) => env.DB.prepare(s)))
