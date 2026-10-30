import { describe, expect, it } from 'vitest'
import { costMicros, estimateSearchMicros, WEB_SEARCH_MICROS } from '@/server/ai/pricing'
import { type AiSearchRow, aiView, needsAi } from '@/server/ai/state'
import { checkItems, findsDate, pageText, safeSourceUrl } from '@/server/ai/verify'

describe('出典 URL の安全確認（SSRF 対策）', () => {
  it('http/https の普通のサイトは通す', () => {
    expect(safeSourceUrl('https://www.example.com/live?id=1')?.hostname).toBe('www.example.com')
    expect(safeSourceUrl('http://example.co.jp:80/a')).not.toBeNull()
  })

  it('IP アドレス直指定・localhost・社内向けの名前・別のポート・ほかのスキームは拒否する', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://[::1]/',
      'http://localhost/',
      'http://api.localhost/',
      'http://printer.local/',
      'http://wiki.corp/',
      'http://intranet/',
      'https://example.com:8443/',
      'https://user:pass@example.com/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ftp://example.com/',
      'not a url',
    ]) {
      expect(safeSourceUrl(url), url).toBeNull()
    }
  })
})

describe('出典ページの照合', () => {
  it('pageText は script・style・コメントを除き、文字参照を戻して NFKC にする', () => {
    const text = pageText(
      '<html><script>var x="ARTIST 2026年11月7日"</script><style>.a{}</style><!-- 2026/11/07 --><p>ＡＢＣ &amp; <b>DEF</b></p></html>',
    )
    expect(text).not.toContain('ARTIST')
    expect(text).not.toContain('2026/11/07')
    expect(text.trim()).toBe('ABC & DEF')
  })

  it('日付は年付きのさまざまな書き方を認める', () => {
    for (const text of ['2026年11月7日(土)', '2026年 11月 07日', '2026/11/07', '2026.11.7', '2026-11-07 OPEN']) {
      expect(findsDate(text, '2026-11-07'), text).toBe(true)
    }
    expect(findsDate('2026/11/17', '2026-11-07')).toBe(false)
    expect(findsDate('2026/1/17', '2026-11-07')).toBe(false)
    expect(findsDate('12026/11/07', '2026-11-07')).toBe(false)
  })

  it('年の無い書き方は、ページにその年が書かれているときだけ認める', () => {
    expect(findsDate('2026年のツアー 11月7日(土) 福岡', '2026-11-07')).toBe(true)
    expect(findsDate('2026 TOUR 11/7(土)', '2026-11-07')).toBe(true)
    expect(findsDate('ツアー 11月7日(土)', '2026-11-07')).toBe(false)
    // 別の日付の一部（11/17、11/7/2025 など）には一致しない
    expect(findsDate('2026 TOUR 11/17', '2026-11-07')).toBe(false)
  })

  it('タグの属性・URL の中の日付や名前には一致させない。英字の短い名前は単語として一致したときだけ', () => {
    const html =
      '<a class="mail-link ai" href="/event?date=2026-12-05">お問い合わせ（mail）</a><p>2026年12月5日 ほかの公演</p>'
    expect(checkItems(html, [{ artist: 'Ai', date: '2026-12-05' }])).toEqual([{ artistFound: false, dateFound: true }])
    expect(checkItems('<p>2026/12/06 AI LIVE</p>', [{ artist: 'Ai', date: '2026-12-05' }])).toEqual([
      { artistFound: true, dateFound: false },
    ])
  })

  it('アーティスト名は正規化して照合し、公演ごとに結果を返す', () => {
    const html = '<p>2026年11月7日 Mrs. GREEN APPLE ARENA TOUR</p><p>12月1日 ほかのアーティスト</p>'
    expect(
      checkItems(html, [
        { artist: 'Mrs.GREEN APPLE', date: '2026-11-07' },
        { artist: 'いない人', date: '2026-11-07' },
        { artist: 'ほかのアーティスト', date: '2026-12-02' },
      ]),
    ).toEqual([
      { artistFound: true, dateFound: true },
      { artistFound: false, dateFound: true },
      { artistFound: true, dateFound: false },
    ])
  })
})

describe('AI 検索の状態', () => {
  const now = new Date('2026-11-10T03:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const row = (status: AiSearchRow['status'], startedMsAgo: number, expiresInMs?: number): AiSearchRow => ({
    id: 1,
    status,
    startedAt: ago(startedMsAgo),
    finishedAt: ago(startedMsAgo),
    expiresAt: expiresInMs === undefined ? null : new Date(now.getTime() + expiresInMs).toISOString(),
  })

  it('needsAi: AI だけの会場、取得が48時間成功していない・2回続けて失敗した会場', () => {
    expect(needsAi('ai_only', null, now)).toBe(true)
    expect(needsAi('disabled', null, now)).toBe(false)
    expect(needsAi('scrape', null, now)).toBe(true)
    expect(needsAi('scrape', { lastSuccessAt: ago(3600_000), consecutiveFailures: 0 }, now)).toBe(false)
    expect(needsAi('scrape', { lastSuccessAt: ago(49 * 3600_000), consecutiveFailures: 0 }, now)).toBe(true)
    expect(needsAi('scrape', { lastSuccessAt: ago(3600_000), consecutiveFailures: 2 }, now)).toBe(true)
  })

  it('aiView: 24時間以内の結果・検索中・失敗の直後・検索してよい', () => {
    expect(aiView(false, null, null, now)).toEqual({ needed: false })
    expect(aiView(true, null, null, now)).toMatchObject({ status: 'due', checkedAt: null })
    const ok = row('succeeded', 3600_000, 3600_000)
    expect(aiView(true, ok, ok, now)).toMatchObject({ status: 'fresh', checkedAt: ok.finishedAt })
    // 検索中（2分以内）。それより古い running は止まったものとみなす
    expect(aiView(true, row('running', 60_000), null, now)).toMatchObject({ status: 'running' })
    expect(aiView(true, row('running', 5 * 60_000), null, now)).toMatchObject({ status: 'due' })
    // 期限切れの結果があり、直後に失敗・予算超過 → 前回の結果の日時を添えて「利用できません」
    const old = row('succeeded', 30 * 3600_000, -6 * 3600_000)
    expect(aiView(true, row('budget_exceeded', 60_000), old, now)).toEqual({
      needed: true,
      status: 'unavailable',
      checkedAt: old.finishedAt,
      reason: 'budget',
    })
    expect(aiView(true, row('failed', 60_000), old, now)).toMatchObject({ status: 'unavailable', reason: 'error' })
    // 失敗から30分たてば検索し直してよい
    expect(aiView(true, row('failed', 31 * 60_000), old, now)).toMatchObject({ status: 'due' })
  })
})

describe('AI の費用', () => {
  it('トークン数 × 1M トークンあたりの料金 + Web 検索 $10/1,000回（マイクロドル）', () => {
    expect(costMicros('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 0, webSearchCount: 0 })).toBe(
      2_000_000,
    )
    expect(costMicros('claude-haiku-5-5', { inputTokens: 10_000, outputTokens: 2_000, webSearchCount: 3 })).toBe(
      1_000 + 1_000 + 3 * WEB_SEARCH_MICROS,
    )
    // キャッシュの書き込みは 1.25 倍、読み出しは 0.1 倍
    expect(
      costMicros('claude-opus-5-5', {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 1_000,
        cacheReadTokens: 10_000,
        webSearchCount: 0,
      }),
    ).toBe(5_000 + 4_000)
  })

  it('見積もり: Sonnet 5.5 は1回 約 $0.12（日次上限 $1.00 の範囲で毎日6会場を検索できる）', () => {
    const sonnet = estimateSearchMicros('claude-sonnet-5-5')
    expect(sonnet).toBe(25_000 * 2 + 4_000 * 10 + 3 * WEB_SEARCH_MICROS)
    expect(sonnet * 6).toBeLessThan(1_000_000)
    // 表に無いモデルは高めに見積もる
    expect(estimateSearchMicros('unknown-model')).toBeGreaterThan(estimateSearchMicros('claude-opus-5-5'))
  })
})
