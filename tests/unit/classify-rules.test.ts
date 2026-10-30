import { describe, expect, it } from 'vitest'
import { classifyByRules, titleHashOf } from '@/server/classify/rules'

const category = (title: string, label: string | null = null) => classifyByRules(title, label)?.category ?? 'unknown'

describe('ライブ判定のルール', () => {
  it('ライブの言葉があればライブ', () => {
    for (const title of [
      'ASIAN KUNG-FU GENERATION Tour 2026 "Midage Fanclub"',
      'WATWING Zepp Live Tour 「love」',
      'ねぐせ。ワンマンツアー2026 「君を強く抱きしめたいんだ！」',
      'レキシ アコースティックツアー 2026',
      'jo0ji one-man tour 2026 「いかり」',
      'NAOTARO MORIYAMA Zepp TOURS 2026',
      '布袋寅泰 HOTEI the LIVE 2026 “45th Celebration GIGS”',
      '「From AG! with Love 〜ライブハウスより愛を込めて〜」',
      'ＬＩＶＥ ２０２６',
      'ダミー交響楽団 定期演奏会',
    ]) {
      expect(category(title), title).toBe('live')
    }
  })

  it('学会・展示会・スポーツ・お笑いなどは除外。ライブの言葉より除外を優先する', () => {
    for (const title of [
      '第50回 日本ダミー学会 総会',
      'ダミー EXPO 2026',
      'ダミーフェア 2026',
      '合同企業説明会',
      'ダミー全国漫才ツアー2026 「ニコイチ」in熊本',
      'ダミーお笑いライブ',
      'プロレス ダミー大会',
      'ホークス vs ダミーズ 公式試合',
      '令和８年度 熊本市民 健康フェスティバル',
      'ダミー ミュージカル ツアー公演',
      'ダミー 握手会',
    ]) {
      expect(category(title), title).toBe('non_live')
    }
  })

  it('一部だけ一致する言葉では決めない', () => {
    // 「フェアウェル」は「フェア」ではない、「フェスティバル」だけではライブと決めない、「博多」は「博」ではない
    expect(category('ダミー FAREWELL フェアウェル')).toBe('unknown')
    expect(category('ダミー フェスティバル in 博多')).toBe('unknown')
    expect(category('Delivery Night')).toBe('unknown')
    expect(category('versus')).toBe('unknown')
    // 「vs」は対バンにも使うので、それだけでは除外しない
    expect(category('アーティスト A スペシャル アーティスト B vs. アーティスト C')).toBe('unknown')
  })

  it('アーティスト名だけのタイトルは決まらない（unknown）', () => {
    expect(category('森山直太朗')).toBe('unknown')
    expect(classifyByRules('森山直太朗', null)).toBeNull()
  })

  it('会場のラベルがあればそれに従う', () => {
    expect(classifyByRules('ダミー 2026', 'コンサート')).toEqual({ category: 'live', method: 'venue_label' })
    expect(classifyByRules('ダミー LIVE 2026', 'スポーツ')).toEqual({ category: 'non_live', method: 'venue_label' })
    // ラベルが判定に使えないもの（部屋の名前など）はタイトルで決める
    expect(classifyByRules('ダミー LIVE 2026', 'メインホール')).toEqual({ category: 'live', method: 'rule' })
  })

  it('titleHashOf は表記の揺れ（全角・空白・記号）を吸収する', () => {
    expect(titleHashOf('ＬＩＶＥ　2026！')).toBe(titleHashOf('live 2026'))
    expect(titleHashOf('live 2026')).not.toBe(titleHashOf('live 2027'))
  })
})
