import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export type Db = ReturnType<typeof createDb>

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

/** リクエスト・Cron の中で使う DB（Worker の env.DB） */
export function getDb(): Db {
  return createDb(env.DB)
}
