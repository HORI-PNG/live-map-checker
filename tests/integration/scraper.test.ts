import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '@/server/db/client'
import { zeppAdapter } from '@/server/scraping/adapters/zepp'
import { type Fetcher, runScrapeTick } from '@/server/scraping/runner'
import zeppHtml from '../fixtures/zepp/fukuoka-2026-11.html?raw'

const db = createDb(env.DB)
// 2026-11-10 12:00 JST
const NOW = new Date('2026-11-10T03:00:00Z')

describe('Zepp の取得ルール', () => {
  it('今月から6か月分のページ', () => {
    const pages = zeppAdapter.pages({ hall: 'fukuoka' }, '2026-11-10')
    expect(pages.map((p) => p.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])
    expect(pages[0].url).toBe('https://www.zepp.co.jp/hall/fukuoka/schedule/?_y=2026&_m=11')
  })

  it('1か月分の HTML から公演を抜き出す', async () => {
    const { events, invalid } = await zeppAdapter.parse(zeppHtml, {
      pageUrl: 'https://www.zepp.co.jp/hall/fukuoka/schedule/?_y=2026&_m=11',
      pageKey: '2026-11',
    })
    expect(invalid).toBe(0)
    expect(events).toHaveLength(21)
    expect(events[0]).toMatchObject({
      date: '2026-11-01',
      artistName: 'アーティスト 1',
      tourName: '[ツアー名] 2026 公演1',
      openTime: '15:30',
      startTime: '16:00',
    })
    expect(events.every((e) => e.date.startsWith('2026-11'))).toBe(true)
  })

  it('設定にホール名が無ければエラー', () => {
    expect(() => zeppAdapter.pages(null, '2026-11-10')).toThrow()
  })
})

/** テスト用の偽の fetch。URL ごとに返す内容を決め、呼ばれた URL を記録する */
function fakeFetch(routes: Record<string, () => Response>): Fetcher & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (url: string) => {
    calls.push(url)
    const route = Object.entries(routes).find(([pattern]) => url.includes(pattern))
    return route ? route[1]() : new Response('not found', { status: 404 })
  }) as Fetcher & { calls: string[] }
  fn.calls = calls
  return fn
}

const ROBOTS_OK = 'User-agent: *\nDisallow: /wp-admin/\n'

async function query<T>(sql: string): Promise<T[]> {
  return (await env.DB.prepare(sql).all<T>()).results
}

describe('runScrapeTick', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM fetch_runs'),
      env.DB.prepare('DELETE FROM fetch_pages'),
      env.DB.prepare('DELETE FROM robots_cache'),
      env.DB.prepare('DELETE FROM venue_fetch_state'),
      env.DB.prepare("DELETE FROM events WHERE fingerprint NOT LIKE 'sample:%'"),
    ])
  })

  it('1回の起動で1ページだけ取得し、公演と取得ログを保存する', async () => {
    const fetcher = fakeFetch({
      '/robots.txt': () => new Response(ROBOTS_OK),
      'schedule/?_y=2026&_m=11': () => new Response(zeppHtml),
    })
    const result = await runScrapeTick(db, env.DB, fetcher, { now: NOW })
    expect(result).toMatchObject({ status: 'success', pageKey: '2026-11', eventsFound: 21 })
    // robots.txt と1ページだけ
    expect(fetcher.calls.filter((u) => !u.endsWith('/robots.txt'))).toHaveLength(1)

    // 3会場×6か月が順番待ちに入る
    expect(await query('SELECT * FROM fetch_pages')).toHaveLength(18)
    const saved = await query<{ n: number }>(
      "SELECT count(*) AS n FROM events WHERE source_kind = 'scrape' AND is_active = 1 AND date LIKE '2026-11-%' AND fingerprint NOT LIKE 'sample:%'",
    )
    expect(saved[0].n).toBe(21)
    const runs = await query<{ status: string; events_found: number }>('SELECT status, events_found FROM fetch_runs')
    expect(runs).toEqual([{ status: 'success', events_found: 21 }])
    const state = await query<{ consecutive_failures: number; last_success_at: string | null }>(
      'SELECT consecutive_failures, last_success_at FROM venue_fetch_state',
    )
    expect(state[0]).toMatchObject({ consecutive_failures: 0, last_success_at: NOW.toISOString() })
  })

  it('次の起動では、まだ取っていない別のページを取る。同じページは20時間たつまで取らない', async () => {
    const fetcher = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    const keys = new Set<string>()
    for (let i = 0; i < 18; i++) {
      const r = await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + i * 600_000) })
      if (r.status !== 'idle') keys.add(`${r.venue}:${r.pageKey}`)
    }
    expect(keys.size).toBe(18)
    expect(await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 18 * 600_000) })).toEqual({
      status: 'idle',
    })
  })

  it('取り直すと、掲載が無くなった公演は無効になり、同じ公演は重複しない', async () => {
    const first = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    await runScrapeTick(db, env.DB, first, { now: NOW })
    // 1件目の公演を消したページ
    const fewer = zeppHtml.replace(/<a class="sch-content [^"]*"[\s\S]*?<\/a>/, '')
    const second = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(fewer) })
    await env.DB.prepare("UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z'").run()
    await runScrapeTick(db, env.DB, second, { now: new Date(NOW.getTime() + 21 * 3600_000) })
    const rows = await query<{ active: number; total: number }>(
      "SELECT sum(is_active) AS active, count(*) AS total FROM events WHERE source_kind = 'scrape' AND date LIKE '2026-11-%' AND fingerprint NOT LIKE 'sample:%'",
    )
    expect(rows[0]).toEqual({ active: 20, total: 21 })
  })

  it('robots.txt で禁止されていたら取得せず、skipped(robots) として記録する', async () => {
    const fetcher = fakeFetch({
      '/robots.txt': () => new Response('User-agent: *\nDisallow: /hall/\n'),
      schedule: () => new Response(zeppHtml),
    })
    const result = await runScrapeTick(db, env.DB, fetcher, { now: NOW })
    expect(result).toMatchObject({ status: 'skipped', errorKind: 'robots' })
    expect(fetcher.calls.some((u) => u.includes('schedule'))).toBe(false)
  })

  it('HTTP エラー・前回より急に減ったときは失敗として記録し、連続失敗回数を数える', async () => {
    const ok = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    await runScrapeTick(db, env.DB, ok, { now: NOW })
    await env.DB.prepare(
      "UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z' WHERE page_key = '2026-11'",
    ).run()
    await env.DB.prepare(
      "UPDATE fetch_pages SET last_fetched_at = '2026-11-09T00:00:00Z' WHERE page_key <> '2026-11'",
    ).run()

    const later = new Date(NOW.getTime() + 21 * 3600_000)
    const broken = fakeFetch({
      '/robots.txt': () => new Response(ROBOTS_OK),
      schedule: () => new Response('<html><body>メンテナンス中</body></html>'),
    })
    expect(await runScrapeTick(db, env.DB, broken, { now: later })).toMatchObject({
      status: 'failed',
      errorKind: 'empty',
    })

    await env.DB.prepare(
      "UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z' WHERE page_key = '2026-11'",
    ).run()
    const down = fakeFetch({
      '/robots.txt': () => new Response(ROBOTS_OK),
      schedule: () => new Response('', { status: 503 }),
    })
    expect(await runScrapeTick(db, env.DB, down, { now: new Date(later.getTime() + 600_000) })).toMatchObject({
      status: 'failed',
      errorKind: 'http',
    })
    const state = await query<{ consecutive_failures: number; last_error_kind: string }>(
      'SELECT consecutive_failures, last_error_kind FROM venue_fetch_state',
    )
    expect(state[0]).toEqual({ consecutive_failures: 2, last_error_kind: 'http' })
    // 失敗しても、前回取得した公演は消さない
    const active = await query<{ n: number }>(
      "SELECT count(*) AS n FROM events WHERE source_kind = 'scrape' AND is_active = 1 AND fingerprint NOT LIKE 'sample:%'",
    )
    expect(active[0].n).toBe(21)
  })
})
