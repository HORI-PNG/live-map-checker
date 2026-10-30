import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyPending, runVenueClassification } from '@/server/ai/classify'
import { createMockProvider } from '@/server/ai/mock'
import { runVenueAiSearch } from '@/server/ai/search'
import { AiError, type AiProvider } from '@/server/ai/types'
import { verifySource } from '@/server/ai/verify'
import { titleHashOf } from '@/server/classify/rules'
import { createDb } from '@/server/db/client'

const db = createDb(env.DB)
// 2026-11-10 12:00 JST
const NOW = new Date('2026-11-10T03:00:00Z')
// サンプル公演の無い会場（熊本城ホールには判定待ちのサンプルがある）
const VENUE = 'zepp-osaka-bayside'

async function query<T>(sql: string): Promise<T[]> {
  return (await env.DB.prepare(sql).all<T>()).results
}

function counted(base: AiProvider = createMockProvider()) {
  const calls: string[][] = []
  const provider: AiProvider = {
    ...base,
    async classifyTitles(venueName, titles) {
      calls.push(titles)
      return base.classifyTitles(venueName, titles)
    },
  }
  return { calls, provider }
}

const categories = () =>
  query<{ title: string; category: string; classified_by: string | null }>(
    "SELECT title, category, classified_by FROM events WHERE fingerprint LIKE 'test:%' ORDER BY title",
  )

describe('AI によるライブ判定（ルールで決まらなかったタイトル）', () => {
  beforeEach(async () => {
    const insert = (title: string, date: string, key: string) =>
      env.DB.prepare(
        `INSERT INTO events (venue_id, source_kind, title, date, category, fingerprint)
         VALUES ((SELECT id FROM venues WHERE slug = '${VENUE}'), 'scrape', ?1, ?2, 'unknown', ?3)`,
      ).bind(title, date, key)
    await env.DB.batch([
      insert('第7回むしゃんよかバンド決定戦', '2026-12-01', 'test:1'),
      insert('ダミー スペシャルナイト', '2026-12-02', 'test:2'),
      insert('ダミー 手動で決めたタイトル', '2026-12-03', 'test:3'),
      // 終わった公演は聞かない
      insert('ダミー 終わった催し', '2026-11-01', 'test:4'),
      env.DB.prepare(
        "INSERT INTO classification_cache (title_hash, title, category, method) VALUES (?1, 'ダミー 手動で決めたタイトル', 'non_live', 'manual')",
      ).bind(titleHashOf('ダミー 手動で決めたタイトル')),
    ])
  })

  afterEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM events WHERE fingerprint LIKE 'test:%'"),
      env.DB.prepare('DELETE FROM classification_cache'),
      env.DB.prepare("DELETE FROM ai_searches WHERE provider <> 'sample'"),
    ])
  })

  it('キャッシュ（手動を含む）にあるタイトルはそれを使い、残りだけ AI に聞いて保存する', async () => {
    const { calls, provider } = counted()
    const outcome = await runVenueClassification(db, env.DB, VENUE, {
      provider: () => provider,
      budgetMicros: 1_000_000,
      now: NOW,
    })
    expect(outcome).toEqual({ status: 'classified', changed: 3 })
    // 日付の近い順
    expect(calls).toEqual([['第7回むしゃんよかバンド決定戦', 'ダミー スペシャルナイト']])
    expect(await categories()).toEqual([
      { title: 'ダミー スペシャルナイト', category: 'live', classified_by: 'ai' },
      { title: 'ダミー 手動で決めたタイトル', category: 'non_live', classified_by: 'manual' },
      { title: 'ダミー 終わった催し', category: 'unknown', classified_by: null },
      { title: '第7回むしゃんよかバンド決定戦', category: 'non_live', classified_by: 'ai' },
    ])
    const cache = await query<{ title: string; method: string; model: string }>(
      "SELECT title, method, model FROM classification_cache WHERE method = 'ai' ORDER BY title",
    )
    expect(cache.map((c) => [c.title, c.model])).toEqual([
      ['ダミー スペシャルナイト', 'mock'],
      ['第7回むしゃんよかバンド決定戦', 'mock'],
    ])
    const tasks = await query<{ kind: string; status: string; candidates: number; verified: number }>(
      "SELECT kind, status, candidates, verified FROM ai_searches WHERE provider = 'mock'",
    )
    expect(tasks).toEqual([{ kind: 'classify', status: 'succeeded', candidates: 2, verified: 2 }])
    // 判定待ちが無くなったので、次は何もしない
    expect(
      await runVenueClassification(db, env.DB, VENUE, { provider: () => provider, budgetMicros: 1_000_000, now: NOW }),
    ).toEqual({
      status: 'nothing',
    })
  })

  it('予算を超えるなら AI に聞かない（キャッシュにあるものは反映する）', async () => {
    const { calls, provider } = counted({ ...createMockProvider(), estimateClassifyMicros: () => 10_000 })
    const outcome = await runVenueClassification(db, env.DB, VENUE, {
      provider: () => provider,
      budgetMicros: 5_000,
      now: NOW,
    })
    expect(outcome).toEqual({ status: 'unavailable', reason: 'budget' })
    expect(calls).toHaveLength(0)
    expect((await categories()).map((c) => c.category)).toEqual(['unknown', 'non_live', 'unknown', 'unknown'])
    const tasks = await query<{ kind: string; status: string }>(
      "SELECT kind, status FROM ai_searches WHERE provider = 'mock'",
    )
    expect(tasks).toEqual([{ kind: 'classify', status: 'budget_exceeded' }])
  })

  it('AI が失敗したら費用と原因を記録し、しばらくは聞き直さない', async () => {
    const failing: AiProvider = {
      ...createMockProvider(),
      classifyTitles: () =>
        Promise.reject(
          new AiError('api', 'HTTP 529', { inputTokens: 10, outputTokens: 0, webSearchCount: 0, costUsdMicros: 7 }),
        ),
    }
    const deps = { provider: () => failing, budgetMicros: 1_000_000, now: NOW }
    expect(await runVenueClassification(db, env.DB, VENUE, deps)).toEqual({ status: 'unavailable', reason: 'error' })
    const tasks = await query<{ status: string; cost_usd_micros: number; error: string }>(
      "SELECT status, cost_usd_micros, error FROM ai_searches WHERE provider = 'mock'",
    )
    expect(tasks[0]).toMatchObject({ status: 'failed', cost_usd_micros: 7 })
    expect(tasks[0].error).toContain('HTTP 529')
    expect(
      await runVenueClassification(db, env.DB, VENUE, { ...deps, now: new Date(NOW.getTime() + 10 * 60_000) }),
    ).toEqual({
      status: 'skipped',
    })
  })

  it('ほかの人が判定中なら running を返す（画面は終わるまで待つ）', async () => {
    await env.DB.prepare(
      `INSERT INTO ai_searches (venue_id, kind, status, provider, model, started_at)
       VALUES ((SELECT id FROM venues WHERE slug = '${VENUE}'), 'classify', 'running', 'mock', 'mock', ?1)`,
    )
      .bind(new Date(NOW.getTime() - 30_000).toISOString())
      .run()
    const { calls, provider } = counted()
    expect(
      await runVenueClassification(db, env.DB, VENUE, { provider: () => provider, budgetMicros: 1_000_000, now: NOW }),
    ).toEqual({ status: 'running' })
    expect(calls).toHaveLength(0)
  })

  it('手動で unknown のままにした公演は判定待ちに数えない', async () => {
    await env.DB.prepare(
      "UPDATE events SET classified_by = 'manual' WHERE fingerprint IN ('test:1', 'test:2', 'test:3')",
    ).run()
    const { calls, provider } = counted()
    expect(
      await runVenueClassification(db, env.DB, VENUE, { provider: () => provider, budgetMicros: 1_000_000, now: NOW }),
    ).toEqual({ status: 'nothing' })
    expect(calls).toHaveLength(0)
  })

  it('ライブ判定の記録は、AI 検索の24時間キャッシュや検索中の判定に影響しない', async () => {
    const venue = 'mizuho-paypay-dome-fukuoka'
    await env.DB.prepare(
      `INSERT INTO ai_searches (venue_id, kind, status, provider, model, started_at, finished_at)
       VALUES ((SELECT id FROM venues WHERE slug = '${venue}'), 'classify', 'running', 'mock', 'mock', ?1, NULL)`,
    )
      .bind(new Date(NOW.getTime() - 60_000).toISOString())
      .run()
    const mock = createMockProvider()
    const fetchSource = mock.fetchSource ?? (() => Promise.reject(new Error('no fetchSource')))
    const outcome = await runVenueAiSearch(db, env.DB, venue, {
      provider: () => mock,
      verify: (url, items) => verifySource(url, items, fetchSource),
      budgetMicros: 1_000_000,
      now: NOW,
    })
    expect(outcome).toMatchObject({ status: 'searched' })
    await env.DB.batch([
      env.DB.prepare("UPDATE events SET ai_search_id = NULL WHERE source_kind = 'ai'"),
      env.DB.prepare("DELETE FROM events WHERE source_kind = 'ai' AND fingerprint NOT LIKE 'sample:%'"),
      env.DB.prepare('DELETE FROM ai_verifications'),
    ])
  })
})

describe('classifyPending', () => {
  const now = new Date('2026-11-10T03:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it('判定待ちがあり、実行中・失敗や成功の直後（30分）でなければ聞いてよい', () => {
    expect(classifyPending(0, null, now)).toBe(false)
    expect(classifyPending(3, null, now)).toBe(true)
    expect(classifyPending(3, { status: 'running', startedAt: ago(60_000) }, now)).toBe(false)
    expect(classifyPending(3, { status: 'running', startedAt: ago(10 * 60_000) }, now)).toBe(true)
    expect(classifyPending(3, { status: 'failed', startedAt: ago(10 * 60_000) }, now)).toBe(false)
    expect(classifyPending(3, { status: 'budget_exceeded', startedAt: ago(31 * 60_000) }, now)).toBe(true)
    expect(classifyPending(3, { status: 'succeeded', startedAt: ago(10 * 60_000) }, now)).toBe(false)
    expect(classifyPending(3, { status: 'succeeded', startedAt: ago(31 * 60_000) }, now)).toBe(true)
  })
})
