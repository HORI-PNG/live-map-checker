// ライブ判定のルール（docs/plan.md 5章）。会場のラベル → 除外 → ライブ → 決まらなければ null（unknown）
import { fnv64 } from '@/shared/hash'
import { normalizeText } from '@/shared/normalize'

export type RuleResult = { category: 'live' | 'non_live'; method: 'venue_label' | 'rule' }

/** 会場サイトの種別（「コンサート」「スポーツ」など）。どちらにも当てはまらなければタイトルで判定する */
const LABEL_NON_LIVE = /スポーツ|展示|会議|学会|講演|式典|演劇|お笑い|sports?|exhibition|conference/
const LABEL_LIVE = /コンサート|ライブ|音楽|concert|live|music/

/**
 * 英単語。前後が英字でなければ一致（\b だと「TOUR2026」のように数字が続く書き方を見落とす。「Clive」には一致させない）
 */
function word(pattern: string): string {
  return `(?<![a-z])(?:${pattern})(?![a-z])`
}

/**
 * ライブではない催し。ライブの言葉より先に見る（「全国漫才ツアー」はツアーでもお笑い）。
 * 「フェアウェル」「博多」のように一部だけ一致する言葉は除く。
 * 「vs」「大会」は音楽でも使う（「A vs. B」の対バン、「バンド決定戦大会」）ので入れない（決まらなければ AI の分類へ）
 */
const NON_LIVE = new RegExp(
  [
    '学会',
    '総会',
    '展示会',
    '見本市',
    word('expo'),
    '博覧会',
    'フェア(?!ウェル|リー)',
    '説明会',
    '試験',
    '検定',
    'セミナー',
    '講演',
    '講座',
    '講習',
    '研修',
    'シンポジウム',
    'フォーラム',
    '就職',
    '野球',
    '試合',
    '格闘技',
    'ボクシング',
    'プロレス',
    '相撲',
    'マラソン',
    '販売会',
    '物産',
    '式典',
    '(?:卒業|入学|成人|表彰)式',
    '健康',
    '献血',
    '漫才',
    'お笑い',
    'コント(?!ラバス|ラスト|ロール|ラクト|ゥア)',
    '落語',
    '新喜劇',
    '寄席',
    '講談',
    'ミュージカル',
    '演劇',
    '劇団',
    '朗読',
    '舞台',
    'バレエ',
    '歌舞伎',
    '狂言',
    '能楽',
    'マジック',
    'イリュージョン',
    'サーカス',
    'トーク(?:ショー|イベント)',
    '上映会',
    '(?:握手|サイン|特典)会',
  ].join('|'),
)

/** 音楽のライブ。「フェスティバル」は健康・食などの催しにも使われるので「フェス」単独だけ */
const LIVE = new RegExp(
  [
    word('live'),
    'ライブ',
    word('tours?'),
    'ツアー',
    'コンサート',
    word('concerts?'),
    'ワンマン',
    word('one-?man'),
    '公演',
    'リサイタル',
    word('recitals?'),
    word('gigs?'),
    'フェス(?!ティバル)',
    word('fes'),
    '(?:rock|music|jazz) festival',
    '音楽祭',
    'ディナーショー',
    'オーケストラ',
    '交響楽',
    '演奏会',
    '弾き語り',
    'アコースティック',
    word('acoustic'),
    word('showcase'),
  ].join('|'),
)

/** 全角英数を半角に、英字を小文字に（空白は残す。英単語の区切りを見るため） */
function prepare(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

export function classifyByRules(title: string, venueCategory: string | null): RuleResult | null {
  if (venueCategory) {
    const label = prepare(venueCategory)
    if (LABEL_NON_LIVE.test(label)) return { category: 'non_live', method: 'venue_label' }
    if (LABEL_LIVE.test(label)) return { category: 'live', method: 'venue_label' }
  }
  const text = prepare(title)
  if (NON_LIVE.test(text)) return { category: 'non_live', method: 'rule' }
  if (LIVE.test(text)) return { category: 'live', method: 'rule' }
  return null
}

/** classification_cache の鍵。表記の揺れ（全角・空白・記号）を吸収するため正規化してからハッシュにする */
export function titleHashOf(title: string): string {
  return fnv64(normalizeText(title))
}
