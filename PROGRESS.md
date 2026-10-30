# 実行したこと（作業の記録）

- 更新: 2026-10-30
- これから行うことは `PLAN.md`、設計の詳細は `docs/plan.md`、分野ごとのルールとハマりどころは `.claude/rules/`
- リポジトリ: https://github.com/HORI-PNG/live-map-checker （公開）
- 本番: https://live-map-checker.horinouchi-yuki189.workers.dev
- staging: https://live-map-checker-staging.horinouchi-yuki189.workers.dev
- PR プレビュー: `https://pr-<番号>-live-map-checker-staging.horinouchi-yuki189.workers.dev`

## 2026-10-23 計画

- 要件定義書・モックアップを読み、設計と実装計画を作成（`docs/plan.md`）
- ユーザーと決めたこと: ライブ判定はルール＋AI の併用、AI 費用は日次上限で停止、取得の失敗は管理ページで確認、pnpm＋workers.dev、プレビューは共有の staging D1、お問い合わせは Microsoft Forms、演出は出現アニメのみ、AI モデルは実測して決める、地図はタイル配置
- 10会場の robots.txt と規約を調査（Zepp 3会場・熊本城ホールは取得可。メディアドーム・京セラドームは転載禁止で AI のみ。マリンメッセ・国際センター・PayPayドーム・大阪城ホールは保留で AI のみ）
- 計画の修正: AI の日次上限を $1.00 に（研究室予算）。毎朝の事前検索は一度入れて取り消し（AI 検索は会場を開いたときだけ）

## 2026-10-23〜26 PR 1 `chore/scaffold`（#1 マージ）

- create-cloudflare で雛形を作成、shadcn/ui・Tailwind v4・デザイントークン（モックアップの色・ガラス・角丸）
- Biome と整形の Hook（jq が無いので Node で実装）、CLAUDE.md、Vitest・Playwright、GitHub Actions（CI・プレビュー・デプロイ）
- 公開リポジトリを作成。会場サイトの本物の HTML は入れず、文字をダミーにした fixture を使う方針に
- CPU 時間を実測: トップ 2〜5ms、会場画面相当 最大 49ms、Zepp の抽出 最大 8ms、出典検証 最大 54ms
- Cloudflare の API トークン: アカウント API トークン（`cfat_`）は Workers API で使えず、ユーザーの API トークン（`cfut_`）に切り替え。チャットに一度貼られたトークンはロール済み
- `/code-review`（10件反映）、`/security-review`（脆弱性なし）。追加の強化: 本番デプロイは main の CI 成功後だけ、production 環境は main からのみ、main をルールセットで保護
- 有料プランは検討したが、ユーザーの決定で**無料プランのまま**（2026-10-26）

## 2026-10-26 PR 2 `feat/db-schema-seed`（#8 マージ）

- D1 を作成（lmc-prod・lmc-staging、APAC）、Drizzle で10表、地方8・都道府県47・会場10・確認記録10のシード
- 地図・県・会場の読み出し関数と結合テスト（`@cloudflare/vitest-plugin`）
- 発見: D1 の batch で結合すると同名の列が上書きされる → SQL で別名を付けて解決
- `/code-review`（9件反映）、`/security-review`（脆弱性なし）
- 本番 D1 にマイグレーションとシードが入ったことを確認

## 2026-10-26〜29 PR 3 `feat/app-shell`（#9）と PR 4 `feat/map-navigation`（#10）

- PR 3: 共通レイアウト、下部ナビ（長押しスライド）、PC 左ナビ、テーマ、ヘッダー・パンくず、404
- PR 4: タイル地図（関西の県配置は新規作成）、地方・県・会場一覧、スマホ／PC、不正な URL の 404、地方の会場数はルートで読んで使い回す
- CI の E2E がブラウザのインストール（`--with-deps`）で止まる → キャッシュを使う形に変更
- 強制 push は自動の安全確認で止められたため、マージコミットで対応
- #10 は向き先が `feat/app-shell` のままマージされ、#9 と一緒に main に入った（中身は一致を確認）
- 本番で地図・地方・県・会場ページを確認。使い終わったブランチを削除

## 2026-10-30 依存関係（#11 マージ）

- GitHub Actions の更新（checkout v7 など）、小さな npm 更新を取り込み
- メジャー更新（TypeScript 7・Vitest 5・@types/node 26）は v1 公開後に見送り
- Dependabot の PR ではプレビューを作らないように変更。古い Dependabot の PR（#2〜#7）を閉じた

## 2026-10-30 PR 5 `feat/venue-page`（#12 マージ）

- 会場画面（ライブ一覧・月ごと・表示切り替え・AI バッジ・出典リンク）、スマホ／PC、ダーク／ライト
- 表示用ページのキャッシュ（Cache API）。workers.dev でも効くことを実測（`x-lmc-cache: hit`）
- CPU 計測スクリプト。PR プレビューは `wrangler tail` に流れないため、staging にデプロイして計測（描画 4〜20ms、キャッシュから 0〜1ms）
- `/code-review`（指摘を反映。キャッシュの鍵の正規化・デプロイのバージョン・サーバー関数は対象外など）
- 本番で会場ページとキャッシュを確認（本番にはサンプル公演なし）

## 2026-10-30 PR 6 `feat/scraper-zepp`（作業中・未マージ）

- 取得の仕組みと Zepp 3会場の取得ルールを実装。実際の Zepp のページから取得できることを確認
- Cloudflare の Cron で1ページずつ取得すると CPU 15〜40ms（D1 往復の削減・解析範囲の絞り込みなどをしても 10ms に収まらず）
- → 取得は GitHub Actions の中の `wrangler dev`（D1 は remote）で動かす方式に変更。本番 Worker の Cron を停止
- 手元から staging に対して取得を実行（18ページ成功、公開中の公演数が月ごとの件数と一致）
- `/code-review`（2回、指摘を反映）、`/security-review`（高信頼度の脆弱性なし。http/https に限る強化を提案）
- CLAUDE.md を整理し、分野ごとのルール（`.claude/rules/`）と、この記録・`PLAN.md` を追加
