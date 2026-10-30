import { describe, expect, it } from 'vitest'
import { isCacheable } from '@/server/cache'

const req = (path: string, init?: RequestInit) => new Request(`https://example.com${path}`, init)

describe('isCacheable', () => {
  it.each(['/', '/regions/kyushu', '/prefectures/fukuoka', '/venues/zepp-fukuoka?mode=fav', '/_serverFn/abc'])(
    '表示用の GET はキャッシュする: %s',
    (path) => {
      expect(isCacheable(req(path))).toBe(true)
    },
  )

  it.each(['/favorites', '/account', '/admin', '/assets/app.css'])('対象外のページ: %s', (path) => {
    expect(isCacheable(req(path))).toBe(false)
  })

  it('GET 以外や、利用者ごとに違いうるリクエストはキャッシュしない', () => {
    expect(isCacheable(req('/_serverFn/abc', { method: 'POST' }))).toBe(false)
    expect(isCacheable(req('/', { headers: { cookie: 'a=b' } }))).toBe(false)
    expect(isCacheable(req('/', { headers: { authorization: 'Bearer x' } }))).toBe(false)
  })
})
