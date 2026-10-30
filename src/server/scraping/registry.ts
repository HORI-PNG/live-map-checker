// 取得ルールの一覧。ここに登録した会場（venues.scraper_key）だけを自動取得する（CLAUDE.md）
import { zeppAdapter } from './adapters/zepp'
import type { ScraperAdapter } from './types'

const ADAPTERS: ScraperAdapter[] = [zeppAdapter]

export const SCRAPERS: ReadonlyMap<string, ScraperAdapter> = new Map(ADAPTERS.map((a) => [a.key, a]))
