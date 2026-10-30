import { describe, expect, it } from 'vitest'
import { cacheKey, isCacheable } from '@/server/cache'

const req = (path: string, init?: RequestInit) => new Request(`https://example.com${path}`, init)

describe('isCacheable', () => {
  it.each(['/', '/regions/kyushu', '/prefectures/fukuoka', '/venues/zepp-fukuoka?mode=fav'])(
    '表示用の GET はキャッシュする: %s',
    (path) => {
      expect(isCacheable(req(path))).toBe(true)
    },
  )

  it.each(['/favorites', '/account', '/admin', '/assets/app.css', '/_serverFn/abc'])('対象外: %s', (path) => {
    expect(isCacheable(req(path))).toBe(false)
  })

  it('GET 以外や、利用者ごとに違いうるリクエストはキャッシュしない', () => {
    expect(isCacheable(req('/venues/x', { method: 'POST' }))).toBe(false)
    expect(isCacheable(req('/', { headers: { cookie: 'a=b' } }))).toBe(false)
    expect(isCacheable(req('/', { headers: { authorization: 'Bearer x' } }))).toBe(false)
  })
})

describe('cacheKey', () => {
  it('パスと mode だけを鍵にし、ほかのクエリは無視する', () => {
    expect(cacheKey(req('/venues/a?x=1&utm=2'), 'v1')).toBe(cacheKey(req('/venues/a'), 'v1'))
    expect(cacheKey(req('/venues/a?mode=fav&x=1'), 'v1')).toBe('https://page-cache.internal/v1/venues/a?mode=fav')
    expect(cacheKey(req('/venues/a?mode=other'), 'v1')).toBe(cacheKey(req('/venues/a'), 'v1'))
  })

  it('デプロイのバージョンが違えば別の鍵', () => {
    expect(cacheKey(req('/'), 'v1')).not.toBe(cacheKey(req('/'), 'v2'))
  })
})
