import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { titleHashOf } from '@/server/classify/rules'
import { createDb } from '@/server/db/client'
import { kumamotoJoHallAdapter } from '@/server/scraping/adapters/kumamoto-jo-hall'
import { zeppAdapter } from '@/server/scraping/adapters/zepp'
import { type Fetcher, runScrapeTick } from '@/server/scraping/runner'
import kumamotoHtml from '../fixtures/kumamoto/2026-11.html?raw'
import zeppHtml from '../fixtures/zepp/fukuoka-2026-11.html?raw'

const db = createDb(env.DB)
// 2026-11-10 12:00 JST
const NOW = new Date('2026-11-10T03:00:00Z')

describe('熊本城ホールの取得ルール', () => {
  it('今月から6か月分のページ', () => {
    const pages = kumamotoJoHallAdapter.pages(null, '2026-11-10')
    expect(pages.map((p) => p.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])
    expect(pages[0].url).toBe('https://www.kumamoto-jo-hall.jp/event/202611.html')
  })

  it('1か月分の HTML から公演を抜き出す。延期・中止の公演は載せない', async () => {
    const { events, invalid } = await kumamotoJoHallAdapter.parse(kumamotoHtml, {
      pageUrl: 'https://www.kumamoto-jo-hall.jp/event/202611.html',
      pageKey: '2026-11',
    })
    expect(invalid).toBe(0)
    expect(events.map((e) => e.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-15', '2026-11-20', '2026-11-22'])
    // </br> で区切られた公演名。1行目がアーティスト名、残りがツアー名
    expect(events[0]).toEqual({
      title: 'アーティスト A LIVE 2026 "Celebration" TOUR',
      artistName: 'アーティスト A',
      tourName: 'LIVE 2026 "Celebration" TOUR',
      date: '2026-11-03',
      openTime: '16:00',
      startTime: '17:00',
      // 主催者のサイト（別のホスト）へのリンクも残す。文字参照は戻す
      detailUrl: 'https://promoter-a.example/ticket?id=1&p=2',
      venueCategory: null,
    })
    // <br> と改行・字下げで区切られた公演名、「終了」の時刻は使わない
    expect(events[2]).toMatchObject({
      title: '令和８年度 ダミー市民 健康フェスティバル',
      openTime: '09:30',
      startTime: '10:00',
    })
    // http/https 以外のリンクは捨てる（公演は残す）
    expect(events[4]).toMatchObject({ artistName: 'アーティスト C', detailUrl: null })
  })
})

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
    expect(events[0].detailUrl).toBe('https://www.zepp.co.jp/hall/fukuoka/schedule/single/?rid=0')
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

    // 4会場（Zepp 3会場・熊本城ホール）×6か月が順番待ちに入る
    expect(await query('SELECT * FROM fetch_pages')).toHaveLength(24)
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
    for (let i = 0; i < 24; i++) {
      const r = await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + i * 600_000) })
      if (r.status !== 'idle') keys.add(`${r.venue}:${r.pageKey}`)
    }
    expect(keys.size).toBe(24)
    expect(await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 24 * 600_000) })).toEqual({
      status: 'idle',
    })
  })

  it('取り直すと、掲載が無くなった公演は無効になり、同じ公演は重複しない', async () => {
    const first = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    await runScrapeTick(db, env.DB, first, { now: NOW })
    // これからの公演（11/29）を消したページ
    const fewer = zeppHtml.replace(/<a class="sch-content [^"]*"(?:(?!<\/a>)[\s\S])*?__month">11\.29<[\s\S]*?<\/a>/, '')
    expect(fewer).not.toBe(zeppHtml)
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

  it('月ごとのページが1つ成功しても、失敗中のページが残っていれば会場は回復扱いにしない', async () => {
    // 11月のページだけ毎回 503、ほかの月は成功
    const fetcher = fakeFetch({
      '/robots.txt': () => new Response(ROBOTS_OK),
      '_m=11': () => new Response('', { status: 503 }),
      schedule: () => new Response('<html><body><div class="sch-contentWrap"></div></body></html>'),
    })
    for (let i = 0; i < 6; i++) {
      await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + i * 600_000) })
    }
    const state = await query<{
      consecutive_failures: number
      last_success_at: string | null
      last_error_kind: string
    }>(
      "SELECT s.consecutive_failures, s.last_success_at, s.last_error_kind FROM venue_fetch_state s JOIN venues v ON v.id = s.venue_id WHERE v.slug = 'zepp-fukuoka'",
    )
    expect(state[0].consecutive_failures).toBeGreaterThanOrEqual(1)
    expect(state[0].last_success_at).toBeNull()
    expect(state[0].last_error_kind).toBe('http')
  })

  it('別の月のページが返ってきたら、解析エラーとして記録し、その月の公演を消さない', async () => {
    const fetcher = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    await runScrapeTick(db, env.DB, fetcher, { now: NOW }) // 2026-11 は成功
    // 2026-12 のページに 11 月の内容が返ってくる
    const result = await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 600_000) })
    expect(result).toMatchObject({ status: 'failed', pageKey: '2026-12', errorKind: 'parse' })
  })

  it('今日より前の公演は、ページから消えても無効にしない', async () => {
    const fetcher = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    await runScrapeTick(db, env.DB, fetcher, { now: NOW })
    // 11/20 に取り直すと、11/1〜11/19 の公演がページから消えている
    const later = zeppHtml.replace(/<a class="sch-content [^"]*"[\s\S]*?<\/a>/g, (block) =>
      /__month">11\.(\d+)</.exec(block) && Number(/__month">11\.(\d+)</.exec(block)?.[1]) < 20 ? '' : block,
    )
    await env.DB.prepare("UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z'").run()
    await runScrapeTick(
      db,
      env.DB,
      fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(later) }),
      {
        now: new Date('2026-11-20T03:00:00Z'),
      },
    )
    const past = await query<{ n: number }>(
      "SELECT count(*) AS n FROM events WHERE source_kind = 'scrape' AND is_active = 1 AND date < '2026-11-20' AND fingerprint NOT LIKE 'sample:%'",
    )
    expect(past[0].n).toBeGreaterThan(0)
  })

  it('1会場の設定ミスがあっても、ほかの会場は取得し、設定エラーを記録する', async () => {
    await env.DB.prepare("UPDATE venues SET scraper_config = NULL WHERE slug = 'zepp-fukuoka'").run()
    try {
      const fetcher = fakeFetch({
        '/robots.txt': () => new Response(ROBOTS_OK),
        schedule: () => new Response(zeppHtml),
      })
      const result = await runScrapeTick(db, env.DB, fetcher, { now: NOW, syncPages: true })
      expect(result.status).not.toBe('idle')
      expect(result).not.toMatchObject({ venue: 'zepp-fukuoka' })
      const runs = await query<{ slug: string }>(
        "SELECT v.slug FROM fetch_runs r JOIN venues v ON v.id = r.venue_id WHERE r.message LIKE '設定エラー%'",
      )
      expect(runs.map((r) => r.slug)).toContain('zepp-fukuoka')
    } finally {
      await env.DB.prepare(`UPDATE venues SET scraper_config = '{"hall":"fukuoka"}' WHERE slug = 'zepp-fukuoka'`).run()
    }
  })

  /** 熊本城ホールのページだけが取得の対象になるように、ほかの会場のページは取得済みにする */
  async function onlyKumamoto() {
    await syncAndHold()
    await env.DB.prepare(
      "UPDATE fetch_pages SET last_fetched_at = ?1 WHERE venue_id <> (SELECT id FROM venues WHERE slug = 'kumamoto-jo-hall')",
    )
      .bind(NOW.toISOString())
      .run()
  }

  async function syncAndHold() {
    // 順番待ちを作るためだけに1回動かす（取得するページは idle になるまで捨てる）
    await runScrapeTick(db, env.DB, fakeFetch({}), { now: new Date(NOW.getTime() - 86_400_000), syncPages: true })
    await env.DB.batch([
      env.DB.prepare('DELETE FROM fetch_runs'),
      env.DB.prepare('UPDATE fetch_pages SET last_fetched_at = NULL, last_status = NULL'),
      env.DB.prepare('DELETE FROM venue_fetch_state'),
    ])
  }

  it('熊本城ホール: 来月以降のページが無い（404）のは「公演なし」、今月のページが無いのは失敗', async () => {
    await onlyKumamoto()
    const fetcher = fakeFetch({ '/robots.txt': () => new Response('', { status: 404 }) })
    const results = []
    for (let i = 0; i < 6; i++) {
      results.push(await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + i * 600_000) }))
    }
    const byKey = Object.fromEntries(results.map((r) => [r.status === 'idle' ? 'idle' : r.pageKey, r]))
    expect(byKey['2026-11']).toMatchObject({ status: 'failed', errorKind: 'http' })
    for (const key of ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04']) {
      expect(byKey[key]).toMatchObject({ status: 'success', eventsFound: 0 })
    }
  })

  it('熊本城ホール: 取得した公演をライブ判定して保存する（漫才・健康フェスティバルは表示しない）', async () => {
    await onlyKumamoto()
    const fetcher = fakeFetch({
      '/robots.txt': () => new Response('', { status: 404 }),
      '/event/202611.html': () => new Response(kumamotoHtml),
    })
    expect(await runScrapeTick(db, env.DB, fetcher, { now: NOW })).toMatchObject({
      status: 'success',
      venue: 'kumamoto-jo-hall',
      eventsFound: 5,
    })
    const rows = await query<{ date: string; category: string; classified_by: string | null }>(
      "SELECT date, category, classified_by FROM events WHERE source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' ORDER BY date",
    )
    expect(rows).toEqual([
      { date: '2026-11-03', category: 'live', classified_by: 'rule' },
      { date: '2026-11-04', category: 'live', classified_by: 'rule' },
      { date: '2026-11-15', category: 'non_live', classified_by: 'rule' },
      { date: '2026-11-20', category: 'non_live', classified_by: 'rule' },
      { date: '2026-11-22', category: 'live', classified_by: 'rule' },
    ])
    const live = await query<{ n: number }>("SELECT events_live AS n FROM fetch_runs WHERE message = '2026-11'")
    // ルールで「ライブではない」と決まった2件を除く
    expect(live[0].n).toBe(3)
  })

  it('ライブ判定: 手動の上書きが最優先。取り直しても AI・手動の判定は消えない', async () => {
    const fetcher = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(zeppHtml) })
    const titleOf = async (date: string) =>
      (
        await query<{ title: string }>(
          `SELECT title FROM events WHERE date = '${date}' AND source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' ORDER BY id LIMIT 1`,
        )
      )[0].title
    await runScrapeTick(db, env.DB, fetcher, { now: NOW })
    const categories = await query<{ category: string; n: number }>(
      "SELECT category, count(*) AS n FROM events WHERE source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' GROUP BY category",
    )
    // fixture は「[ツアー名] 2026 公演N」なので、すべてルールでライブ
    expect(categories).toEqual([{ category: 'live', n: 21 }])

    const manualTitle = await titleOf('2026-11-01')
    try {
      // 1件を手動で「ライブではない」に。別の1件はルールで決まらなかったことにして AI の判定を入れておく
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO classification_cache (title_hash, title, category, method) VALUES (?1, ?2, 'non_live', 'manual')",
        ).bind(titleHashOf(manualTitle), manualTitle),
        env.DB.prepare(
          "UPDATE events SET category = 'non_live', classified_by = 'ai' WHERE id = (SELECT id FROM events WHERE date = '2026-11-02' AND source_kind = 'scrape' ORDER BY id LIMIT 1)",
        ),
        env.DB.prepare("UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z'"),
      ])
      await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 21 * 3600_000) })
      const after = await query<{ date: string; category: string; classified_by: string }>(
        "SELECT date, category, classified_by FROM events WHERE date IN ('2026-11-01', '2026-11-02') AND source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' ORDER BY date, id",
      )
      expect(after[0]).toEqual({ date: '2026-11-01', category: 'non_live', classified_by: 'manual' })
      // ルールでライブと決まるタイトルは、ルールの判定に戻る（AI の判定は、ルールで決まらないものにだけ使う）
      expect(after.find((r) => r.date === '2026-11-02')).toMatchObject({ category: 'live', classified_by: 'rule' })

      // 手動の行は、ルールで判定し直しても上書きしない（キャッシュから手動の行を消しても残る）
      await env.DB.batch([
        env.DB.prepare('DELETE FROM classification_cache'),
        env.DB.prepare("UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z'"),
      ])
      await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 42 * 3600_000) })
      const kept = await query<{ category: string; classified_by: string }>(
        "SELECT category, classified_by FROM events WHERE date = '2026-11-01' AND source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' ORDER BY id LIMIT 1",
      )
      expect(kept[0]).toEqual({ category: 'non_live', classified_by: 'manual' })
    } finally {
      await env.DB.prepare('DELETE FROM classification_cache').run()
    }
  })

  it('ライブ判定: ルールで決まらないタイトルは AI の判定結果（キャッシュ）を使い、取り直しても消さない', async () => {
    // アーティスト名だけのタイトル（ルールで決まらない）にしたページ
    const plain = zeppHtml
      .replace(/(sch-content-text__ttl">)[^<]*/g, '$1')
      .replace(/アーティスト (\d+)/g, 'ダミー名 $1')
    const fetcher = fakeFetch({ '/robots.txt': () => new Response(ROBOTS_OK), schedule: () => new Response(plain) })
    await runScrapeTick(db, env.DB, fetcher, { now: NOW })
    const unknown = await query<{ title: string }>(
      "SELECT title FROM events WHERE source_kind = 'scrape' AND fingerprint NOT LIKE 'sample:%' AND category = 'unknown' ORDER BY date LIMIT 2",
    )
    expect(unknown).toHaveLength(2)
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO classification_cache (title_hash, title, category, method) VALUES (?1, ?2, 'live', 'ai')",
        ).bind(titleHashOf(unknown[0].title), unknown[0].title),
        env.DB.prepare("UPDATE fetch_pages SET last_fetched_at = '2026-11-01T00:00:00Z'"),
      ])
      await runScrapeTick(db, env.DB, fetcher, { now: new Date(NOW.getTime() + 21 * 3600_000) })
      const rows = await query<{ title: string; category: string; classified_by: string | null }>(
        `SELECT title, category, classified_by FROM events WHERE title IN ('${unknown[0].title}', '${unknown[1].title}') AND source_kind = 'scrape' ORDER BY date`,
      )
      expect(rows).toEqual([
        { title: unknown[0].title, category: 'live', classified_by: 'ai' },
        { title: unknown[1].title, category: 'unknown', classified_by: null },
      ])
    } finally {
      await env.DB.prepare('DELETE FROM classification_cache').run()
    }
  })
})
