// DB スキーマ（docs/plan.md 2章）。変更したら `pnpm db:generate` でマイグレーションを作る。
// 公演日は JST の 'YYYY-MM-DD'、時刻は 'HH:MM'、記録用の日時は UTC の ISO 文字列で持つ。
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

export const FETCH_MODES = ['scrape', 'ai_only', 'disabled'] as const
export const VENUE_KINDS = ['music_hall', 'arena', 'dome', 'multi_purpose'] as const
export const ROBOTS_RESULTS = ['allowed', 'disallowed', 'not_found', 'unreachable'] as const
export const TERMS_VERDICTS = ['ok', 'prohibited', 'unclear'] as const
export const SOURCE_KINDS = ['scrape', 'ai'] as const
export const EVENT_CATEGORIES = ['live', 'non_live', 'unknown'] as const
export const CLASSIFIED_BY = ['venue_label', 'rule', 'ai', 'manual'] as const
export const AI_SEARCH_STATUSES = ['running', 'succeeded', 'failed', 'budget_exceeded'] as const
export const FETCH_RUN_STATUSES = ['success', 'failed', 'skipped'] as const
export const FETCH_ERROR_KINDS = ['network', 'http', 'robots', 'parse', 'empty', 'drop'] as const
export const FETCH_TRIGGERS = ['cron', 'manual'] as const
export const VERIFICATION_VERDICTS = ['verified', 'rejected', 'error'] as const

export const regions = sqliteTable('regions', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

export const prefectures = sqliteTable(
  'prefectures',
  {
    id: integer('id').primaryKey(),
    regionId: integer('region_id')
      .notNull()
      .references(() => regions.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('prefectures_region_idx').on(t.regionId)],
)

export const venues = sqliteTable(
  'venues',
  {
    id: integer('id').primaryKey(),
    prefectureId: integer('prefecture_id')
      .notNull()
      .references(() => prefectures.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    area: text('area').notNull(),
    officialUrl: text('official_url').notNull(),
    scheduleUrl: text('schedule_url'),
    fetchMode: text('fetch_mode', { enum: FETCH_MODES }).notNull(),
    scraperKey: text('scraper_key'),
    scraperConfig: text('scraper_config', { mode: 'json' }).$type<Record<string, unknown>>(),
    venueKind: text('venue_kind', { enum: VENUE_KINDS }).notNull(),
    sortOrder: integer('sort_order').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('venues_prefecture_idx').on(t.prefectureId)],
)

/** 情報源の規約・robots.txt の確認記録。確認するたびに行を追加する（履歴） */
export const venuePolicies = sqliteTable(
  'venue_policies',
  {
    id: integer('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id),
    robotsUrl: text('robots_url').notNull(),
    robotsResult: text('robots_result', { enum: ROBOTS_RESULTS }).notNull(),
    termsUrl: text('terms_url'),
    termsVerdict: text('terms_verdict', { enum: TERMS_VERDICTS }).notNull(),
    termsQuote: text('terms_quote'),
    /** 確認した日時（UTC の ISO 文字列）。同じ日に何度確認しても履歴が残る */
    checkedAt: text('checked_at').notNull(),
    checkedBy: text('checked_by').notNull(),
    note: text('note'),
  },
  (t) => [uniqueIndex('venue_policies_venue_checked_idx').on(t.venueId, t.checkedAt)],
)

export const aiSearches = sqliteTable(
  'ai_searches',
  {
    id: integer('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id),
    status: text('status', { enum: AI_SEARCH_STATUSES }).notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    startedAt: text('started_at').notNull().default(nowIso),
    finishedAt: text('finished_at'),
    expiresAt: text('expires_at'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    webSearchCount: integer('web_search_count').notNull().default(0),
    costUsdMicros: integer('cost_usd_micros').notNull().default(0),
    candidates: integer('candidates').notNull().default(0),
    verified: integer('verified').notNull().default(0),
    error: text('error'),
  },
  (t) => [
    index('ai_searches_venue_started_idx').on(t.venueId, t.startedAt),
    index('ai_searches_started_idx').on(t.startedAt),
  ],
)

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id),
    sourceKind: text('source_kind', { enum: SOURCE_KINDS }).notNull(),
    title: text('title').notNull(),
    artistName: text('artist_name'),
    artistNorm: text('artist_norm'),
    tourName: text('tour_name'),
    date: text('date').notNull(),
    openTime: text('open_time'),
    startTime: text('start_time'),
    detailUrl: text('detail_url'),
    sourceUrl: text('source_url'),
    sourceLabel: text('source_label'),
    category: text('category', { enum: EVENT_CATEGORIES }).notNull().default('unknown'),
    classifiedBy: text('classified_by', { enum: CLASSIFIED_BY }),
    /** hash(venue_id + date + 正規化タイトル)。取得のたびの重複を防ぐ */
    fingerprint: text('fingerprint').notNull().unique(),
    aiSearchId: integer('ai_search_id').references(() => aiSearches.id),
    firstSeenAt: text('first_seen_at').notNull().default(nowIso),
    lastSeenAt: text('last_seen_at').notNull().default(nowIso),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('events_venue_date_idx').on(t.venueId, t.date)],
)

/** ライブ判定の結果（同じタイトルを二度 AI に聞かない） */
export const classificationCache = sqliteTable('classification_cache', {
  titleHash: text('title_hash').primaryKey(),
  title: text('title').notNull(),
  category: text('category', { enum: EVENT_CATEGORIES }).notNull(),
  method: text('method', { enum: CLASSIFIED_BY }).notNull(),
  reason: text('reason'),
  model: text('model'),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** AI の出典 URL の検証結果（なぜ表示／非表示になったかを後で追える） */
export const aiVerifications = sqliteTable(
  'ai_verifications',
  {
    id: integer('id').primaryKey(),
    aiSearchId: integer('ai_search_id')
      .notNull()
      .references(() => aiSearches.id),
    url: text('url').notNull(),
    httpStatus: integer('http_status'),
    artistFound: integer('artist_found', { mode: 'boolean' }).notNull(),
    dateFound: integer('date_found', { mode: 'boolean' }).notNull(),
    verdict: text('verdict', { enum: VERIFICATION_VERDICTS }).notNull(),
    checkedAt: text('checked_at').notNull().default(nowIso),
  },
  (t) => [index('ai_verifications_search_idx').on(t.aiSearchId)],
)

/** 取得ログ（Cron・手動の1回ごと） */
export const fetchRuns = sqliteTable(
  'fetch_runs',
  {
    id: integer('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id),
    trigger: text('trigger', { enum: FETCH_TRIGGERS }).notNull(),
    startedAt: text('started_at').notNull().default(nowIso),
    finishedAt: text('finished_at'),
    status: text('status', { enum: FETCH_RUN_STATUSES }).notNull(),
    errorKind: text('error_kind', { enum: FETCH_ERROR_KINDS }),
    httpStatus: integer('http_status'),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    eventsFound: integer('events_found').notNull().default(0),
    eventsLive: integer('events_live').notNull().default(0),
    message: text('message'),
    scraperVersion: integer('scraper_version'),
  },
  (t) => [index('fetch_runs_venue_started_idx').on(t.venueId, t.startedAt)],
)

/** 会場ごとの取得の最新状態（AI 補完に切り替えるかの判定を速くする集計） */
export const venueFetchState = sqliteTable('venue_fetch_state', {
  venueId: integer('venue_id')
    .primaryKey()
    .references(() => venues.id),
  lastAttemptAt: text('last_attempt_at'),
  lastSuccessAt: text('last_success_at'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  lastErrorKind: text('last_error_kind', { enum: FETCH_ERROR_KINDS }),
  lastEventsFound: integer('last_events_found'),
})

/**
 * 取得するページの順番待ち（会場×月）。Cron は1回の起動で、最後に取ってから一番時間がたったページを
 * 1つだけ取得する（無料プランの CPU 10ms に収めるため。docs/plan.md 3.2）
 */
export const fetchPages = sqliteTable(
  'fetch_pages',
  {
    id: integer('id').primaryKey(),
    venueId: integer('venue_id')
      .notNull()
      .references(() => venues.id),
    /** 取得ルールが決める、ページを表す鍵（例: '2026-11'） */
    pageKey: text('page_key').notNull(),
    url: text('url').notNull(),
    lastFetchedAt: text('last_fetched_at'),
    lastStatus: text('last_status', { enum: FETCH_RUN_STATUSES }),
    lastEventsFound: integer('last_events_found'),
  },
  (t) => [uniqueIndex('fetch_pages_venue_page_idx').on(t.venueId, t.pageKey)],
)

/** robots.txt の保存（ホストごとに1日1回取り直す） */
export const robotsCache = sqliteTable('robots_cache', {
  host: text('host').primaryKey(),
  fetchedAt: text('fetched_at').notNull(),
  /** 取得できなかった（404 など）ときは null。null は「制限なし」として扱う */
  body: text('body'),
  httpStatus: integer('http_status'),
})

export type Region = typeof regions.$inferSelect
export type Prefecture = typeof prefectures.$inferSelect
export type Venue = typeof venues.$inferSelect
export type Event = typeof events.$inferSelect
