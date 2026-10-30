# 行うべきこと（タスク一覧）

- 更新: 2026-10-30
- v1 公開: 2026年11月中（11/29〜30 は予備日）
- 実行した記録は `PROGRESS.md`、設計の詳細（なぜそうするか）は `docs/plan.md`
- 1つの PR を終えたら、ここのチェックを付け、`PROGRESS.md` に記録する
- マージは毎回ユーザーの明示的な許可（「#N をマージして」）をもらってから

## 0. 計画と準備

- [x] 要件定義書・UI モックアップの確認、設計と実装計画（`docs/plan.md`）
- [x] 計画の修正: AI の日次上限 $1.00、AI 検索は会場を開いたときだけ（毎朝の事前検索はしない）
- [x] Cloudflare アカウントとの接続（wrangler login）、GitHub リポジトリ（公開）
- [x] GitHub の Environment（production / preview）と Secrets（Cloudflare のユーザー API トークン・アカウント ID）
- [x] Cloudflare は無料プランのまま続けると決定（有料にはしない）

## 1. PR 1 `chore/scaffold`（#1）

- [x] TanStack Start + Cloudflare Workers の雛形、Tailwind v4 + shadcn/ui、デザイントークン
- [x] Biome、整形の Hook、CLAUDE.md、Vitest / Playwright
- [x] CI・PR プレビュー・本番デプロイの GitHub Actions
- [x] CPU 時間の実測（会場画面の描画・出典検証が 10ms 超え → 無料プランのまま工夫で対応）

## 2. PR 2 `feat/db-schema-seed`（#8）

- [x] D1（lmc-prod / lmc-staging）、Drizzle スキーマ、マイグレーション
- [x] 10会場のシード、規約・robots.txt の確認記録
- [x] 地図・県・会場の読み出し関数と結合テスト

## 3. PR 3 `feat/app-shell`（#9）

- [x] 共通レイアウト、下部ナビ（長押しスライド）、PC 左ナビ、ヘッダーとパンくず
- [x] テーマ（システム／ライト／ダーク、初期値ダーク）、404
- [ ] スマホ実機での下部ナビの触り心地をユーザーに確認してもらう（任意）

## 4. PR 4 `feat/map-navigation`（#10、#9 と一緒に main へ）

- [x] タイル地図（九州・関西）、地方・県・会場一覧、スマホ／PC のレイアウト
- [x] 不正な URL は 404

## 5. PR 5 `feat/venue-page`（#12）

- [x] 会場画面（ライブ一覧・月ごと・表示切り替え・AI バッジ・出典リンク）
- [x] 表示用ページのキャッシュ（Cache API）と CPU 計測スクリプト

## 6. PR 6 `feat/scraper-zepp`（#15 マージ）

- [x] 取得の仕組み（順番待ち・robots.txt・取得ログ・失敗の検知・重複防止）
- [x] Zepp 3会場の取得ルール
- [x] 取得を GitHub Actions で動かす（Cloudflare の Cron では CPU 10ms に収まらなかったため）
- [x] `/code-review`（指摘を反映）、`/security-review`（高信頼度の脆弱性なし）
- [x] 取得した `detailUrl` を http/https に限る（`src/server/scraping/types.ts` の `rawEventSchema`。できれば取得元と同じホストに）
- [x] PR を作成（#15。base: main。本文に CPU 実測と GitHub Actions に移した理由）
- [x] CI を確認 → ユーザーにマージの許可をもらう → マージ
- [x] 本番 D1 にマイグレーション 0001 が入ったことを確認
- [x] Actions の「Scrape」を手動実行（target=prod）し、本番に Zepp の公演が入ることを確認

## 7. PR 7 `feat/scraper-kumamoto-classify`（#16 マージ）

- [x] 熊本城ホールの robots.txt と規約を再確認し、`data.ts` の確認記録を更新
- [x] 熊本城ホールの取得ルール（`/event/YYYYMM.html`、本物は `*.real.html`、fixture はダミー化）
- [x] ライブ判定のルール（会場のラベル → 除外キーワード → ライブのキーワード → unknown、`classification_cache`、手動の上書き）
- [x] 取得時に判定して `category` を入れる（Zepp に混ざるお笑い公演なども除外）
- [x] テスト、`/code-review`（指摘9件を反映）、`/security-review`（脆弱性なし）
- [x] PR を作成 → CI → マージの許可 → マージ → 本番で「Scrape」を手動実行し熊本城ホールの公演とライブ判定を確認

## 8. PR 8 `feat/ai-search`（#17 マージ）

- [x] AI 提供元の抽象化（`AiProvider`）、Claude（Web 検索）、mock
- [x] 24時間キャッシュ、同じ会場の二重起動の防止、ローディング表示、予算超過・失敗時の表示
- [x] 出典の検証（SSRF 対策、URL 1件ずつ別の呼び出し、軽い文字列照合）
- [x] 日次上限 $1.00 の確認と費用の記録
- [x] 再検索したら、前回の AI の公演のうち出てこなかったものを無効にする
- [x] ページのキャッシュ（5分）と AI 結果の反映の兼ね合い
- [ ] Anthropic の API キーを発行し、月額上限を設定、本番に `wrangler secret put`（ユーザーの作業）
- [ ] モデル比較の実測（Haiku／Sonnet／Opus 5.5）→ モデルと日次上限を確定
- [x] CPU 計測（検索の本体 5〜22ms、検証 8〜19ms／件）、`/code-review`（10件反映）、`/security-review`（脆弱性なし）
- [x] PR、マージ（#17。PR プレビューで mock の AI 検索を確認、本番は API キー未設定で「利用できません」と表示）

## 9. PR 9 `feat/ai-classify`（作業中）

- [x] 判定できなかったタイトル（unknown）の AI 分類とキャッシュ（会場を開いたときに最大40件、`classification_cache` に保存）
- [x] 記録は `ai_searches.kind='classify'`（マイグレーション 0002）、日次上限は検索と共通
- [x] `/code-review`（8件反映、tool_choice の強制は Sonnet/Opus 5.5 で 400 になるため見送り）、`/security-review`
- [ ] PR、マージ

## 10. PR 10 `feat/favorites`

- [ ] お気に入り画面（登録・削除、ブラウザに保存）
- [ ] 正規化の拡張（略称表など）、照合
- [ ] 会場画面の「お気に入りが来るか」表示、カードのお気に入りバッジ
- [ ] v2 でアカウントへ引き継げる保存形式

## 11. PR 11 `feat/account-pages`

- [ ] アカウント画面（ゲスト表示、通知は v2 予定、リンク）、PC は2列カード
- [ ] 取得方法・利用規約・プライバシーポリシーのページ（文面はユーザーが確認）
- [ ] Microsoft Forms へのリンク（フォームはユーザーが作成）

## 12. PR 12 `feat/admin`

- [ ] 管理ページ（会場ごとの取得状況・当日／当月の AI 使用額・手動の再取得）
- [ ] Cloudflare Access で保護し、アプリ側でも JWT を確認

## 13. PR 13 `chore/release-polish`

- [ ] 出現アニメ（prefers-reduced-motion 対応）
- [ ] アクセシビリティと表示速度の確認、全体の `/security-review`
- [ ] 本番データ（取得・AI）の確認、v1 公開

## そのほか

- [ ] Dependabot の PR を確認して取り込む（#13 actions/cache 4→6 はマージ済み、#14 マイナー更新3件）
- [ ] マリンメッセ福岡・福岡国際センターの規約確認（取得ルールは v1.1 以降）
- [ ] みずほPayPayドーム・大阪城ホールへの問い合わせ（任意。承諾が取れたら取得ルールを追加）
- [ ] v1 公開後: メジャー更新（TypeScript 7・Vitest 5・@types/node 26）を計画して上げる
