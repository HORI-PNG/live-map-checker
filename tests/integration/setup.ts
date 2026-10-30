import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { buildSampleEventStatements } from '@/server/db/seed/sample-events.ts'
import { buildSeedStatements } from '@/server/db/seed/sql.ts'

// 未適用のマイグレーションだけ適用し、シードを入れる（どちらも何度実行しても同じ結果）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
await env.DB.batch(buildSeedStatements().map((s) => env.DB.prepare(s)))
// サンプル公演は 2026-11-01 を「今日」として作る（テストの日付を固定するため）
await env.DB.batch(buildSampleEventStatements('2026-11-01').map((s) => env.DB.prepare(s)))
