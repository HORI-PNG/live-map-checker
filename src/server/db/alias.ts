import { sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * D1 の batch は行を「列名 → 値」で返すため、結合した表に同じ列名（id, name, slug など）があると上書きされる。
 * 結合する読み出しを batch に入れるときは、SQL の側でも重ならない別名（AS）を付けて選ぶ
 */
export function aliased<T>(column: AnySQLiteColumn<{ data: T }>, alias: string) {
  return sql<T>`${column}`.mapWith(column).as(alias)
}
