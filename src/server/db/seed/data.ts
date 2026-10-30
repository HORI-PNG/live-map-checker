// 初期データ（docs/plan.md 2章）。会場の追加・取得方法の変更はこのファイルの PR で行う。
// `pnpm db:seed:<local|staging|prod>` で冪等な SQL に変換して流し込む（何度実行しても同じ結果）。
// DB を直接書き換えても、次のデプロイでこのファイルの値に戻る。変更は必ずここで行う。
import type { FETCH_MODES, ROBOTS_RESULTS, TERMS_VERDICTS, VENUE_KINDS } from '../schema'

export type RegionSeed = { slug: string; name: string; displayName: string }
export type PrefectureSeed = { slug: string; region: string; name: string; shortName: string }
export type VenueSeed = {
  slug: string
  prefecture: string
  name: string
  area: string
  officialUrl: string
  scheduleUrl: string | null
  fetchMode: (typeof FETCH_MODES)[number]
  scraperKey: string | null
  scraperConfig: Record<string, unknown> | null
  venueKind: (typeof VENUE_KINDS)[number]
  /** 会場をやめるときは false にする（公演や確認記録が参照しているので行は消さない）。省略時は true */
  isActive?: boolean
}
export type VenuePolicySeed = {
  venue: string
  robotsUrl: string
  robotsResult: (typeof ROBOTS_RESULTS)[number]
  termsUrl: string | null
  termsVerdict: (typeof TERMS_VERDICTS)[number]
  termsQuote: string | null
  /** UTC の ISO 文字列（例: 2026-10-23T06:00:00Z） */
  checkedAt: string
  checkedBy: string
  note: string | null
}

/** 8地方区分。並び順は配列の順 */
export const REGIONS: RegionSeed[] = [
  { slug: 'hokkaido', name: '北海道', displayName: '北海道' },
  { slug: 'tohoku', name: '東北', displayName: '東北' },
  { slug: 'kanto', name: '関東', displayName: '関東' },
  { slug: 'chubu', name: '中部', displayName: '中部' },
  { slug: 'kansai', name: '関西', displayName: '関西' },
  { slug: 'chugoku', name: '中国', displayName: '中国' },
  { slug: 'shikoku', name: '四国', displayName: '四国' },
  { slug: 'kyushu', name: '九州', displayName: '九州・沖縄' },
]

const P = (slug: string, region: string, name: string, shortName: string): PrefectureSeed => ({
  slug,
  region,
  name,
  shortName,
})

/** 都道府県（JIS の順）。三重県は8地方区分に合わせて関西に入れる */
export const PREFECTURES: PrefectureSeed[] = [
  P('hokkaido', 'hokkaido', '北海道', '北海道'),
  P('aomori', 'tohoku', '青森県', '青森'),
  P('iwate', 'tohoku', '岩手県', '岩手'),
  P('miyagi', 'tohoku', '宮城県', '宮城'),
  P('akita', 'tohoku', '秋田県', '秋田'),
  P('yamagata', 'tohoku', '山形県', '山形'),
  P('fukushima', 'tohoku', '福島県', '福島'),
  P('ibaraki', 'kanto', '茨城県', '茨城'),
  P('tochigi', 'kanto', '栃木県', '栃木'),
  P('gunma', 'kanto', '群馬県', '群馬'),
  P('saitama', 'kanto', '埼玉県', '埼玉'),
  P('chiba', 'kanto', '千葉県', '千葉'),
  P('tokyo', 'kanto', '東京都', '東京'),
  P('kanagawa', 'kanto', '神奈川県', '神奈川'),
  P('niigata', 'chubu', '新潟県', '新潟'),
  P('toyama', 'chubu', '富山県', '富山'),
  P('ishikawa', 'chubu', '石川県', '石川'),
  P('fukui', 'chubu', '福井県', '福井'),
  P('yamanashi', 'chubu', '山梨県', '山梨'),
  P('nagano', 'chubu', '長野県', '長野'),
  P('gifu', 'chubu', '岐阜県', '岐阜'),
  P('shizuoka', 'chubu', '静岡県', '静岡'),
  P('aichi', 'chubu', '愛知県', '愛知'),
  P('mie', 'kansai', '三重県', '三重'),
  P('shiga', 'kansai', '滋賀県', '滋賀'),
  P('kyoto', 'kansai', '京都府', '京都'),
  P('osaka', 'kansai', '大阪府', '大阪'),
  P('hyogo', 'kansai', '兵庫県', '兵庫'),
  P('nara', 'kansai', '奈良県', '奈良'),
  P('wakayama', 'kansai', '和歌山県', '和歌山'),
  P('tottori', 'chugoku', '鳥取県', '鳥取'),
  P('shimane', 'chugoku', '島根県', '島根'),
  P('okayama', 'chugoku', '岡山県', '岡山'),
  P('hiroshima', 'chugoku', '広島県', '広島'),
  P('yamaguchi', 'chugoku', '山口県', '山口'),
  P('tokushima', 'shikoku', '徳島県', '徳島'),
  P('kagawa', 'shikoku', '香川県', '香川'),
  P('ehime', 'shikoku', '愛媛県', '愛媛'),
  P('kochi', 'shikoku', '高知県', '高知'),
  P('fukuoka', 'kyushu', '福岡県', '福岡'),
  P('saga', 'kyushu', '佐賀県', '佐賀'),
  P('nagasaki', 'kyushu', '長崎県', '長崎'),
  P('kumamoto', 'kyushu', '熊本県', '熊本'),
  P('oita', 'kyushu', '大分県', '大分'),
  P('miyazaki', 'kyushu', '宮崎県', '宮崎'),
  P('kagoshima', 'kyushu', '鹿児島県', '鹿児島'),
  P('okinawa', 'kyushu', '沖縄県', '沖縄'),
]

/**
 * v1 の10会場（要件定義書 4章）。県内の並び順はモックアップ 03（Prefecture.dc.html）に合わせる。
 * fetchMode の根拠は VENUE_POLICIES の確認記録。
 */
export const VENUES: VenueSeed[] = [
  {
    slug: 'marine-messe-fukuoka',
    prefecture: 'fukuoka',
    name: 'マリンメッセ福岡',
    area: '福岡市博多区',
    officialUrl: 'https://www.marinemesse.or.jp/messe/',
    scheduleUrl: 'https://www.marinemesse.or.jp/messe/event',
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'arena',
  },
  {
    slug: 'mizuho-paypay-dome-fukuoka',
    prefecture: 'fukuoka',
    name: 'みずほPayPayドーム福岡',
    area: '福岡市中央区',
    officialUrl: 'https://www.softbankhawks.co.jp/stadium/',
    scheduleUrl: 'https://www.softbankhawks.co.jp/stadium/event_schedule/',
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'dome',
  },
  {
    slug: 'zepp-fukuoka',
    prefecture: 'fukuoka',
    name: 'Zepp Fukuoka',
    area: '福岡市中央区',
    officialUrl: 'https://www.zepp.co.jp/hall/fukuoka/',
    scheduleUrl: 'https://www.zepp.co.jp/hall/fukuoka/schedule/',
    fetchMode: 'scrape',
    scraperKey: 'zepp',
    scraperConfig: { hall: 'fukuoka' },
    venueKind: 'music_hall',
  },
  {
    slug: 'fukuoka-kokusai-center',
    prefecture: 'fukuoka',
    name: '福岡国際センター',
    area: '福岡市博多区',
    officialUrl: 'https://www.marinemesse.or.jp/kokusai/',
    scheduleUrl: 'https://www.marinemesse.or.jp/kokusai/event',
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'arena',
  },
  {
    slug: 'kitakyushu-media-dome',
    prefecture: 'fukuoka',
    name: '北九州メディアドーム',
    area: '北九州市小倉北区',
    officialUrl: 'https://www.mediadome.jp/',
    scheduleUrl: 'https://www.mediadome.jp/events/index.html',
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'multi_purpose',
  },
  {
    slug: 'kumamoto-jo-hall',
    prefecture: 'kumamoto',
    name: '熊本城ホール',
    area: '熊本市中央区',
    officialUrl: 'https://www.kumamoto-jo-hall.jp/',
    scheduleUrl: 'https://www.kumamoto-jo-hall.jp/event/',
    fetchMode: 'scrape',
    scraperKey: 'kumamoto-jo-hall',
    scraperConfig: null,
    venueKind: 'multi_purpose',
  },
  {
    slug: 'osaka-jo-hall',
    prefecture: 'osaka',
    name: '大阪城ホール',
    area: '大阪市中央区',
    officialUrl: 'https://www.osaka-johall.com/',
    scheduleUrl: null,
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'arena',
  },
  {
    slug: 'kyocera-dome-osaka',
    prefecture: 'osaka',
    name: '京セラドーム大阪',
    area: '大阪市西区',
    officialUrl: 'https://www.kyoceradome-osaka.jp/',
    scheduleUrl: 'https://www.kyoceradome-osaka.jp/schedule/',
    fetchMode: 'ai_only',
    scraperKey: null,
    scraperConfig: null,
    venueKind: 'dome',
  },
  {
    slug: 'zepp-osaka-bayside',
    prefecture: 'osaka',
    name: 'Zepp Osaka Bayside',
    area: '大阪市此花区',
    officialUrl: 'https://www.zepp.co.jp/hall/osakabayside/',
    scheduleUrl: 'https://www.zepp.co.jp/hall/osakabayside/schedule/',
    fetchMode: 'scrape',
    scraperKey: 'zepp',
    scraperConfig: { hall: 'osakabayside' },
    venueKind: 'music_hall',
  },
  {
    slug: 'zepp-namba',
    prefecture: 'osaka',
    name: 'Zepp Namba',
    area: '大阪市浪速区',
    officialUrl: 'https://www.zepp.co.jp/hall/namba/',
    scheduleUrl: 'https://www.zepp.co.jp/hall/namba/schedule/',
    fetchMode: 'scrape',
    scraperKey: 'zepp',
    scraperConfig: { hall: 'namba' },
    venueKind: 'music_hall',
  },
]

const CHECKED_AT = '2026-10-23T06:00:00Z'
const CHECKED_BY = 'Claude Code による調査（運営者が確認）'
const ZEPP_ROBOTS = 'User-agent: * / Disallow: /wp-admin/ のみ。スケジュールは対象外'

/** 規約と robots.txt の確認記録（docs/plan.md 3.3） */
export const VENUE_POLICIES: VenuePolicySeed[] = [
  {
    venue: 'marine-messe-fukuoka',
    robotsUrl: 'https://www.marinemesse.or.jp/robots.txt',
    robotsResult: 'allowed',
    termsUrl: null,
    termsVerdict: 'unclear',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: 'robots.txt は Allow: /（運営者も確認済み）。ページは JS 描画（STUDIO）で、規約本文は未確認。規約を確認できたら v1.1 で取得ルールを追加',
  },
  {
    venue: 'mizuho-paypay-dome-fukuoka',
    robotsUrl: 'https://www.softbankhawks.co.jp/robots.txt',
    robotsResult: 'not_found',
    termsUrl: 'https://www.softbankhawks.co.jp/company/copyright.html',
    termsVerdict: 'unclear',
    termsQuote: '見出しを表示される場合は、別途、承諾を得てください。',
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: '見出し（公演名）の表示には承諾が必要。承諾が取れたら取得ルールを追加',
  },
  {
    venue: 'zepp-fukuoka',
    robotsUrl: 'https://www.zepp.co.jp/robots.txt',
    robotsResult: 'allowed',
    termsUrl: null,
    termsVerdict: 'ok',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: `${ZEPP_ROBOTS}。利用規約ページなし（プライバシー等のみ）`,
  },
  {
    venue: 'fukuoka-kokusai-center',
    robotsUrl: 'https://www.marinemesse.or.jp/robots.txt',
    robotsResult: 'allowed',
    termsUrl: null,
    termsVerdict: 'unclear',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: 'マリンメッセ福岡と同じサイト。JS 描画、規約本文は未確認',
  },
  {
    venue: 'kitakyushu-media-dome',
    robotsUrl: 'https://www.mediadome.jp/robots.txt',
    robotsResult: 'not_found',
    termsUrl: 'https://www.mediadome.jp/sitepolicy.html',
    termsVerdict: 'prohibited',
    termsQuote:
      '私的使用その他法律によって明示的に認められる範囲を超え、これらの情報を使用（複製、改変、アップロード、掲示、送信、頒布、販売、出版などを含む）をすることを禁止',
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: '複製・転載の禁止 → AI 検索のみ',
  },
  {
    venue: 'kumamoto-jo-hall',
    robotsUrl: 'https://www.kumamoto-jo-hall.jp/robots.txt',
    robotsResult: 'not_found',
    termsUrl: null,
    termsVerdict: 'ok',
    termsQuote: 'Copyright © KUMAMOTO-JO HALL All Rights Reserved.（各ページのフッター。転載・取得を禁じる条項はなし）',
    // PR 7 で取得ルールを書く前に再確認（初回は 2026-10-23）
    checkedAt: '2026-10-30T08:10:00Z',
    checkedBy: CHECKED_BY,
    note: '利用規約・サイトポリシーのページなし（/policy/ /privacy/ /terms/ /sitepolicy/ は 404、トップ・FAQ・お問い合わせにもリンクなし）。月ごとのページ /event/YYYYMM.html（予定の無い月は 404）。公演名・日付・開場／開演・主催者サイトへのリンクだけを取得',
  },
  {
    venue: 'osaka-jo-hall',
    robotsUrl: 'https://www.osaka-johall.com/robots.txt',
    robotsResult: 'unreachable',
    termsUrl: null,
    termsVerdict: 'unclear',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: 'サイトが緊急メンテナンスで公開休止中（503）。再開後に再確認',
  },
  {
    venue: 'kyocera-dome-osaka',
    robotsUrl: 'https://www.kyoceradome-osaka.jp/robots.txt',
    robotsResult: 'not_found',
    termsUrl: 'https://www.kyoceradome-osaka.jp/rules/',
    termsVerdict: 'prohibited',
    termsQuote: '許可なく無断で引用、転載、加工等をすることを禁じます',
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: '無断の引用・転載を禁止 → AI 検索のみ',
  },
  {
    venue: 'zepp-osaka-bayside',
    robotsUrl: 'https://www.zepp.co.jp/robots.txt',
    robotsResult: 'allowed',
    termsUrl: null,
    termsVerdict: 'ok',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: ZEPP_ROBOTS,
  },
  {
    venue: 'zepp-namba',
    robotsUrl: 'https://www.zepp.co.jp/robots.txt',
    robotsResult: 'allowed',
    termsUrl: null,
    termsVerdict: 'ok',
    termsQuote: null,
    checkedAt: CHECKED_AT,
    checkedBy: CHECKED_BY,
    note: ZEPP_ROBOTS,
  },
]
