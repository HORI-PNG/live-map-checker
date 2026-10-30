import { describe, expect, it } from 'vitest'
import { isAllowedByRobots } from '@/server/scraping/robots'

describe('isAllowedByRobots', () => {
  it('robots.txt が無い・空なら許可', () => {
    expect(isAllowedByRobots(null, '/schedule/')).toBe(true)
    expect(isAllowedByRobots('', '/schedule/')).toBe(true)
  })

  it('Zepp: /wp-admin/ だけ禁止', () => {
    const body = 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n'
    expect(isAllowedByRobots(body, '/hall/fukuoka/schedule/?_y=2026&_m=11')).toBe(true)
    expect(isAllowedByRobots(body, '/wp-admin/options.php')).toBe(false)
    expect(isAllowedByRobots(body, '/wp-admin/admin-ajax.php')).toBe(true)
  })

  it('自分向けのグループがあれば * より優先する', () => {
    const body = 'User-agent: *\nDisallow: /\n\nUser-agent: LiveMapChecker\nAllow: /schedule/\nDisallow: /\n'
    expect(isAllowedByRobots(body, '/schedule/2026')).toBe(true)
    expect(isAllowedByRobots(body, '/other')).toBe(false)
  })

  it('名前の一部が一致するだけのグループは自分向けにしない', () => {
    const body = 'User-agent: *\nDisallow: /hall/\n\nUser-agent: map\nAllow: /\n\nUser-agent:\nAllow: /\n'
    expect(isAllowedByRobots(body, '/hall/fukuoka/schedule/')).toBe(false)
  })

  it('全体禁止・ワイルドカード・行末', () => {
    expect(isAllowedByRobots('User-agent: *\nDisallow: /', '/anything')).toBe(false)
    expect(isAllowedByRobots('User-agent: *\nDisallow: /*.pdf$', '/event/2611.pdf')).toBe(false)
    expect(isAllowedByRobots('User-agent: *\nDisallow: /*.pdf$', '/event/2611.pdf?x')).toBe(true)
  })

  it('空の Disallow は制限なし。コメントは無視', () => {
    expect(isAllowedByRobots('User-agent: * # all\nDisallow:\n', '/x')).toBe(true)
  })
})
