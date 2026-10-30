---
paths:
  - "src/components/**"
  - "src/routes/**"
  - "src/styles/**"
  - "src/lib/**"
---

# 画面

- 見た目はモックアップ（`docs/mockup/*.dc.html`）に合わせる。PC は 1024px 以上（`lg:`）。スマホと PC は同じ URL で、表示を CSS で切り替える。
- 色・角丸・影は `src/styles/app.css` のトークンを使い、色コードを直接書かない（`bg-background`、`text-fg-muted`、`rounded-card`、`rounded-button`、`glass`、`--accent-soft` など）。ダークが既定で、ライトは `:root:not(.dark)` で上書きする。足りないトークンは app.css に足す。
- `glass` ユーティリティは枠と背景も決める。別の枠・背景にしたい部品（AI のカードなど）では `glass` を使わず直接指定する。
- 角丸のトークンは `@theme`（inline ではない方）に置く。`@theme inline` に置くと CSS 変数として出力されない。
- テーマは `src/lib/theme.ts`（初期値ダーク、描画前のスクリプトで反映）。お気に入りなど利用者ごとの内容はブラウザ側で処理する（ページはキャッシュされるため）。
- 地図のタイル配置は `src/lib/map-layout.ts`（座標はモックアップの値、色は `tone`）。配置を変えたら単体テスト（枠内・重なりなし・シードと一致）を通す。
- 地方ごとの会場数はルートの loader（`__root.tsx`）で読み、`useRegionSummaries()` で使う。
- 外部へのリンクは `target="_blank" rel="noopener noreferrer"`。取得した URL を `href` に使う前に http/https であることを確かめる。
