// 日本地図・地方のタイル配置（docs/mockup の Main / Region / DeskMain の座標をそのまま使う）
// 座標はスマホ版の px（幅 330px）。描画するときは幅に対する % に直すので、PC（462px）でも同じ形になる

/** tone: 情報がある場合の色（0 = ミント、1 = ティール）。モックアップの色に合わせる */
export type Tile = { slug: string; x: number; y: number; w: number; h: number; small?: boolean; tone?: 0 | 1 }
export type TileLayout = { width: number; height: number; tiles: Tile[] }

/** 日本地図（Main.dc.html。PC の DeskMain.dc.html はこれを 1.4 倍にしたもの） */
export const JAPAN_LAYOUT: TileLayout = {
  width: 330,
  height: 360,
  tiles: [
    { slug: 'hokkaido', x: 237, y: 0, w: 93, h: 71 },
    { slug: 'tohoku', x: 230, y: 79, w: 67, h: 106 },
    { slug: 'kanto', x: 230, y: 193, w: 67, h: 67 },
    { slug: 'chubu', x: 160, y: 164, w: 62, h: 96 },
    { slug: 'kansai', x: 93, y: 207, w: 60, h: 77, tone: 1 },
    { slug: 'chugoku', x: 19, y: 207, w: 66, h: 52 },
    { slug: 'shikoku', x: 68, y: 292, w: 73, h: 40, small: true },
    { slug: 'kyushu', x: 0, y: 266, w: 60, h: 93, tone: 0 },
  ],
}

/** 地方ごとの県の配置。九州は Region.dc.html、関西はモックアップに無いため同じ様式で作成 */
export const REGION_LAYOUTS: Record<string, TileLayout> = {
  kyushu: {
    width: 330,
    height: 290,
    tiles: [
      { slug: 'nagasaki', x: 0, y: 48, w: 58, h: 97 },
      { slug: 'saga', x: 66, y: 29, w: 43, h: 68, small: true },
      { slug: 'fukuoka', x: 116, y: 0, w: 106, h: 87, tone: 0 },
      { slug: 'oita', x: 230, y: 19, w: 87, h: 87 },
      { slug: 'kumamoto', x: 116, y: 95, w: 106, h: 93, tone: 1 },
      { slug: 'miyazaki', x: 230, y: 114, w: 87, h: 106 },
      { slug: 'kagoshima', x: 96, y: 196, w: 126, h: 87 },
      { slug: 'okinawa', x: 0, y: 251, w: 70, h: 39, small: true },
    ],
  },
  kansai: {
    width: 330,
    height: 290,
    tiles: [
      { slug: 'hyogo', x: 0, y: 20, w: 104, h: 120 },
      { slug: 'kyoto', x: 112, y: 0, w: 98, h: 84 },
      { slug: 'shiga', x: 218, y: 24, w: 72, h: 84 },
      { slug: 'osaka', x: 112, y: 92, w: 68, h: 100, tone: 1 },
      { slug: 'nara', x: 188, y: 116, w: 64, h: 84 },
      { slug: 'mie', x: 260, y: 116, w: 70, h: 130 },
      { slug: 'wakayama', x: 96, y: 208, w: 156, h: 72 },
    ],
  },
}

/** 情報がある地方・県のタイルの色（ミントとティール） */
export const ACTIVE_TILE_COLORS = ['var(--brand-accent)', 'var(--brand-main)'] as const

// 地方・県の色。配置で指定が無いものは、配置の中の並び順で交互に決める（どの画面でも同じ色になる）
const TONES = new Map<string, 0 | 1>(
  [JAPAN_LAYOUT, ...Object.values(REGION_LAYOUTS)].flatMap((layout) =>
    layout.tiles.map((t, i) => [t.slug, t.tone ?? ((i % 2) as 0 | 1)] as const),
  ),
)

/** 地方・県の色（0 = ミント、1 = ティール）。配置に無い地方・県はミント */
export function toneOf(slug: string): 0 | 1 {
  return TONES.get(slug) ?? 0
}

/** 番号付きの一覧で i 番目に使う色。県の色から始めて交互にする */
export function toneColor(start: 0 | 1, index: number): string {
  return ACTIVE_TILE_COLORS[(start + index) % ACTIVE_TILE_COLORS.length]
}
