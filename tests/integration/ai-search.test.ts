import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockProvider } from '@/server/ai/mock'
import { runVenueAiSearch, type SearchDeps } from '@/server/ai/search'
import { AiError, type AiProvider } from '@/server/ai/types'
import { verifySource } from '@/server/ai/verify'
import { createDb } from '@/server/db/client'

const db = createDb(env.DB)
// 2026-11-10 12:00 JST
const NOW = new Date('2026-11-10T03:00:00Z')
const VENUE = 'mizuho-paypay-dome-fukuoka'
const later = (hours: number) => new Date(NOW.getTime() + hours * 3600_000)

async function query<T>(sql: string): Promise<T[]> {
  return (await env.DB.prepare(sql).all<T>()).results
}

/** mock の AI と出典ページ。検索の回数を数える */
function deps(overrides: Partial<SearchDeps> & { provider?: () => AiProvider } = {}) {
  const calls = { search: 0 }
  const mock = createMockProvider()
  const provider: AiProvider = {
    ...mock,
    async searchVenueEvents(input) {
      calls.search++
      return mock.searchVenueEvents(input)
    },
  }
  const fetchSource = mock.fetchSource ?? (() => Promise.reject(new Error('no fetchSource')))
  return {
    calls,
    deps: {
      provider: () => provider,
      verify: (url: string, items: { artist: string; date: string }[]) => verifySource(url, items, fetchSource),
      budgetMicros: 1_000_000,
      now: NOW,
      ...overrides,
    } satisfies SearchDeps,
  }
}

const aiEvents = (venue = VENUE) =>
  query<{ title: string; date: string; is_active: number; category: string; source_label: string }>(
    `SELECT e.title, e.date, e.is_active, e.category, e.source_label FROM events e JOIN venues v ON v.id = e.venue_id
     WHERE v.slug = '${venue}' AND e.source_kind = 'ai' AND e.fingerprint NOT LIKE 'sample:%' ORDER BY e.date`,
  )

describe('AI 検索（会場を開いたとき）', () => {
  afterEach(async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE events SET ai_search_id = NULL WHERE fingerprint LIKE 'sample:%'"),
      env.DB.prepare("DELETE FROM events WHERE source_kind = 'ai' AND fingerprint NOT LIKE 'sample:%'"),
      env.DB.prepare("DELETE FROM events WHERE fingerprint LIKE 'test:%'"),
      env.DB.prepare('DELETE FROM ai_verifications'),
      env.DB.prepare("DELETE FROM ai_searches WHERE provider <> 'sample'"),
    ])
  })

  it('検索して、出典にアーティスト名と日付が書かれていた公演だけを保存する', async () => {
    const { deps: d } = deps()
    const outcome = await runVenueAiSearch(db, env.DB, VENUE, d)
    expect(outcome).toEqual({ status: 'searched', candidates: 3, verified: 2 })
    expect(await aiEvents()).toEqual([
      {
        title: 'モック・アーティスト LIVE TOUR 2026',
        date: '2026-11-20',
        is_active: 1,
        category: 'live',
        source_label: 'mock.example',
      },
      {
        title: 'MOCK BAND ONE-MAN SHOW',
        date: '2026-12-20',
        is_active: 1,
        category: 'live',
        source_label: 'mock.example',
      },
    ])
    const searches = await query<{ status: string; expires_at: string; candidates: number; verified: number }>(
      "SELECT status, expires_at, candidates, verified FROM ai_searches WHERE provider = 'mock'",
    )
    expect(searches).toHaveLength(1)
    expect(searches[0]).toMatchObject({ status: 'succeeded', candidates: 3, verified: 2 })
    // 24時間キャッシュ
    expect(Date.parse(searches[0].expires_at) - NOW.getTime()).toBeGreaterThanOrEqual(24 * 3600_000)
    const verdicts = await query<{ verdict: string; n: number }>(
      'SELECT verdict, count(*) AS n FROM ai_verifications GROUP BY verdict ORDER BY verdict',
    )
    expect(verdicts).toEqual([
      { verdict: 'rejected', n: 1 },
      { verdict: 'verified', n: 2 },
    ])
  })

  it('24時間以内の結果があれば検索しない。検索中の人がいれば待つ', async () => {
    const first = deps()
    await runVenueAiSearch(db, env.DB, VENUE, first.deps)
    const second = deps({ now: later(1) })
    expect(await runVenueAiSearch(db, env.DB, VENUE, second.deps)).toEqual({ status: 'fresh' })
    expect(second.calls.search).toBe(0)

    // 別の会場で、1分前に始まった検索がある
    await env.DB.prepare(
      `INSERT INTO ai_searches (venue_id, status, provider, model, started_at)
       VALUES ((SELECT id FROM venues WHERE slug = 'kitakyushu-media-dome'), 'running', 'mock', 'mock', ?1)`,
    )
      .bind(new Date(NOW.getTime() - 60_000).toISOString())
      .run()
    const third = deps()
    expect(await runVenueAiSearch(db, env.DB, 'kitakyushu-media-dome', third.deps)).toEqual({ status: 'running' })
    expect(third.calls.search).toBe(0)
  })

  it('予算を超えるなら AI を呼ばずに記録し、しばらくは検索し直さない', async () => {
    // 今日すでに $0.95 使っている。1回の見積もり $0.10 を足すと上限 $1.00 を超える
    await env.DB.prepare(
      `INSERT INTO ai_searches (venue_id, status, provider, model, started_at, finished_at, cost_usd_micros)
       VALUES ((SELECT id FROM venues WHERE slug = 'kyocera-dome-osaka'), 'succeeded', 'test', 'test', ?1, ?1, 950000)`,
    )
      .bind(new Date(NOW.getTime() - 3600_000).toISOString())
      .run()
    const { deps: base, calls } = deps()
    const expensive = { ...base.provider(), estimateCostMicros: () => 100_000 }
    const d = { ...base, provider: () => expensive }
    expect(await runVenueAiSearch(db, env.DB, VENUE, d)).toEqual({ status: 'unavailable', reason: 'budget' })
    expect(calls.search).toBe(0)
    // 30分以内は、予算の確認も検索もせずに「利用できません」
    expect(await runVenueAiSearch(db, env.DB, VENUE, { ...d, now: later(0.25) })).toEqual({
      status: 'unavailable',
      reason: 'budget',
    })
    const rows = await query<{ status: string }>(
      `SELECT status FROM ai_searches WHERE venue_id = (SELECT id FROM venues WHERE slug = '${VENUE}')`,
    )
    expect(rows).toEqual([{ status: 'budget_exceeded' }])
  })

  it('AI が失敗したら、かかった費用と原因を記録する。キーが無いときも失敗として記録する', async () => {
    const { deps: base } = deps()
    const failing: AiProvider = {
      ...base.provider(),
      searchVenueEvents: () =>
        Promise.reject(
          new AiError('invalid_response', 'report_events が呼ばれませんでした', {
            inputTokens: 100,
            outputTokens: 10,
            webSearchCount: 2,
            costUsdMicros: 20_500,
          }),
        ),
    }
    expect(await runVenueAiSearch(db, env.DB, VENUE, { ...base, provider: () => failing })).toEqual({
      status: 'unavailable',
      reason: 'error',
    })
    const noKey = () => {
      throw new AiError('unavailable', 'ANTHROPIC_API_KEY が設定されていません')
    }
    expect(await runVenueAiSearch(db, env.DB, 'kitakyushu-media-dome', { ...base, provider: noKey })).toEqual({
      status: 'unavailable',
      reason: 'error',
    })
    const rows = await query<{ status: string; cost_usd_micros: number; web_search_count: number; error: string }>(
      "SELECT status, cost_usd_micros, web_search_count, error FROM ai_searches WHERE provider <> 'sample' ORDER BY id",
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ status: 'failed', cost_usd_micros: 20_500, web_search_count: 2 })
    expect(rows[0].error).toContain('invalid_response')
    expect(rows[1].error).toContain('ANTHROPIC_API_KEY')
  })

  it('検索し直したとき、前回の AI の公演のうち今回出てこなかったものは無効にする', async () => {
    await runVenueAiSearch(db, env.DB, VENUE, deps().deps)
    // 25時間後。今回は「MOCK BAND」だけが見つかる
    const { deps: base } = deps({ now: later(25) })
    const mock = base.provider()
    const fewer: AiProvider = {
      ...mock,
      async searchVenueEvents(input) {
        const result = await mock.searchVenueEvents({ ...input, from: '2026-11-10' })
        return { ...result, candidates: result.candidates.filter((c) => JSON.stringify(c).includes('MOCK BAND')) }
      },
    }
    await env.DB.prepare("UPDATE ai_searches SET expires_at = '2026-11-10T00:00:00Z' WHERE provider = 'mock'").run()
    expect(await runVenueAiSearch(db, env.DB, VENUE, { ...base, provider: () => fewer })).toMatchObject({
      status: 'searched',
      verified: 1,
    })
    expect((await aiEvents()).map((e) => [e.title, e.is_active])).toEqual([
      ['モック・アーティスト LIVE TOUR 2026', 0],
      ['MOCK BAND ONE-MAN SHOW', 1],
    ])
  })

  it('取得済みの公演と同じ日・同じアーティストの候補は保存しない。期間外の候補も捨てる', async () => {
    await env.DB.prepare(
      `INSERT INTO events (venue_id, source_kind, title, artist_name, artist_norm, date, category, fingerprint)
       VALUES ((SELECT id FROM venues WHERE slug = '${VENUE}'), 'scrape', 'モック・アーティスト 福岡公演', 'モック・アーティスト',
       'モックアーティスト', '2026-11-20', 'live', 'test:dup')`,
    ).run()
    const { deps: base } = deps()
    const mock = base.provider()
    const withPast: AiProvider = {
      ...mock,
      async searchVenueEvents(input) {
        const result = await mock.searchVenueEvents(input)
        const past = { ...(result.candidates[1] as object), date: '2026-11-01' }
        return { ...result, candidates: [...result.candidates, past] }
      },
    }
    expect(await runVenueAiSearch(db, env.DB, VENUE, { ...base, provider: () => withPast })).toEqual({
      status: 'searched',
      candidates: 4,
      verified: 1,
    })
    expect((await aiEvents()).map((e) => e.title)).toEqual(['MOCK BAND ONE-MAN SHOW'])
  })

  it('自動取得が成功している会場では検索しない', async () => {
    await env.DB.prepare(
      `UPDATE venue_fetch_state SET last_success_at = ?1, consecutive_failures = 0
       WHERE venue_id = (SELECT id FROM venues WHERE slug = 'zepp-fukuoka')`,
    )
      .bind(NOW.toISOString())
      .run()
    const { deps: d, calls } = deps()
    expect(await runVenueAiSearch(db, env.DB, 'zepp-fukuoka', d)).toEqual({ status: 'not_needed' })
    expect(calls.search).toBe(0)
  })
})
