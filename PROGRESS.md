# 進捗と残りのタスク（引き継ぎ用）

- 更新: 2026-10-30
- 設計と実装順: `docs/plan.md`（10章の PR の順番、10.5 の CPU 対策）。作業ルール: `CLAUDE.md` と `.claude/rules/`（分野ごとの詳しいルールとハマりどころ）
- リポジトリ: https://github.com/HORI-PNG/live-map-checker （公開）
- 本番: https://live-map-checker.horinouchi-yuki189.workers.dev
- staging（PR プレビューの共有先）: https://live-map-checker-staging.horinouchi-yuki189.workers.dev
- PR プレビュー: `https://pr-<番号>-live-map-checker-staging.horinouchi-yuki189.workers.dev`（PR にコメントされる）

## 完了（main にマージ済み・本番反映済み）

| PR | 内容 |
|---|---|
| #1 | 雛形（TanStack Start + Workers）、Tailwind v4 + shadcn/ui、デザイントークン、Biome＋整形 Hook、Vitest／Playwright、CI・PR プレビュー・本番デプロイ |
| #8 | D1（lmc-prod / lmc-staging）、Drizzle スキーマ10表、10会場のシード＋規約・robots.txt の確認記録 |
| #9 | 共通レイアウト、下部ナビ（長押しスライド）、PC 左ナビ、テーマ（初期値ダーク）、404 |
| （#10 は #9 に含まれて main へ） | タイル地図（九州・関西）、地方・県・会場一覧、スマホ／PC |
| #11 | 依存関係の更新、Dependabot 設定（npm はマイナー・パッチのみ。メジャーは v1 公開後） |
| #12 | 会場画面（ライブ一覧・表示切り替え・AI バッジ）、表示用ページのキャッシュ（Cache API、workers.dev でも有効を確認） |

## 作業中: PR 6 `feat/scraper-zepp`（未マージ・PR 未作成）

- ブランチは push 済み（最新コミット `2ca0076`）。**PR はまだ作っていない**。
- 実装済み: Zepp 3会場の自動取得、robots.txt 確認、取得ログ（fetch_runs / venue_fetch_state / fetch_pages）、失敗の検知、重複防止（FNV fingerprint）。
- **取得は GitHub Actions で実行する方式に変更**（Cloudflare の Cron だと1回 CPU 15〜40ms で無料プランの 10ms を超えたため）
  - `.github/workflows/scrape.yml`（6時間ごと＋手動実行）→ `scripts/scrape.mjs` → `wrangler dev -c wrangler.scraper.jsonc`（D1 は remote: true で本番に接続）→ `src/scraper-entry.ts` の `POST /tick` を順番待ちが無くなるまで呼ぶ
  - 本番 Worker の Cron は停止（`wrangler.jsonc` の crons は空）
  - 手元から `node scripts/scrape.mjs staging` で staging に対して動作確認済み（18ページ成功）
- テスト: 単体・結合 84、E2E 35 すべて通過。`/code-review`（2回、指摘すべて反映）
- `/security-review`: 高信頼度の脆弱性なし。任意の強化として「取得した URL を http/https に限る」の提案あり（下の残りタスク）

### PR 6 の残り
1. 取得した `detailUrl` を http/https のスキームに限る（`src/server/scraping/types.ts` の `rawEventSchema` に refine を追加。可能なら取得元と同じホストに限る）。React 19 が `javascript:` を無効化するので現状でも実害はないが、念のため
2. PR を作成（base: main）。本文に CPU 実測（Cron 方式 15〜40ms → GitHub Actions に移した理由）を書く
3. CI を確認 → **ユーザーにマージの許可をもらう**（下の「進め方の注意」参照）
4. マージ後: 本番 D1 にマイグレーション 0001 が自動で入ることを確認（deploy.yml）。Actions の「Scrape」を手動実行（target=prod）して本番に公演が入ることを確認
5. 熊本城ホールは取得ルール未登録のため、取得のたびに「設定エラー」が記録される（PR 7 で解消）

## 残りの PR（docs/plan.md 10章の順）

| # | ブランチ | 内容 | メモ |
|---|---|---|---|
| 7 | `feat/scraper-kumamoto-classify` | 熊本城ホールの取得ルール（`/event/YYYYMM.html`）、ライブ判定ルール（除外・ライブのキーワード辞書、`classification_cache`） | 取得の前に robots.txt と規約を再確認（data.ts の記録を更新）。実ページは保存したら `*.real.html`（Git 管理外）にし、コミットする fixture は文字を置き換えたダミーにする。Zepp でも「ハライチ」などお笑いが混ざる |
| 8 | `feat/ai-search` | AI 提供元の抽象化（AiProvider）、Claude（Web 検索）、mock、24時間キャッシュ、出典検証、日次予算 $1.00、ローディング表示、モデル比較の実測 | 出典検証は URL 1件ずつ別の呼び出しに（CPU 10ms）。本文は軽い文字列処理で照合。AI の結果を再検索したら古い AI 公演を無効にする（PR 5 レビューの持ち越し）。ページのキャッシュ（5分）と AI 結果の反映の兼ね合いに注意。`ANTHROPIC_API_KEY` は本番だけ `wrangler secret put` |
| 9 | `feat/ai-classify` | unknown の AI 分類とキャッシュ | |
| 10 | `feat/favorites` | お気に入り画面、正規化（`src/shared/normalize.ts` を拡張、略称表）、照合、「お気に入りが来るか」表示 | EventCard の `favorite` / `highlightDate`、`--fav-badge-*` トークンはこのために用意済み |
| 11 | `feat/account-pages` | アカウント画面（ゲスト表示・通知 v2 予定・リンク）、取得方法・規約・プライバシー、Microsoft Forms へのリンク | テーマ選択は PR 3 で実装済み。PC は2列カード（max 880px） |
| 12 | `feat/admin` | 管理ページ（取得状況・AI 使用額・手動再取得）＋ Cloudflare Access | Access 下では Cache API が使えない点に注意（/admin はキャッシュ対象外なので問題なし） |
| 13 | `chore/release-polish` | 出現アニメ、a11y、全体の `/security-review`、本番データ確認、v1 公開（11/29〜30 予備） | |

その他: Dependabot の #13（actions/cache 4→6）・#14（マイナー更新3件）が開いている。CI を確認して取り込む。メジャー更新（TypeScript 7・Vitest 5・@types/node 26）は v1 公開後。

## 決定事項（ユーザー確認済み）

- **Cloudflare は無料プランのまま。有料には絶対にしない**（CPU 10ms／回、サブリクエスト 50、D1 クエリ 50）
- AI の日次上限 `AI_DAILY_BUDGET_USD = 1.00`（研究室予算）。Opus に決めた場合は上限を見直す
- AI 検索は利用者が会場を開いたときだけ（Cron・取得処理では行わない）、24時間キャッシュ
- AI モデルは PR 8 で Haiku／Sonnet／Opus 5.5 を実測して決める（初期値 Sonnet 5.5）
- お問い合わせは Microsoft Forms へのリンク
- 公開リポジトリ。会場サイトの本物の HTML は再配布しない（`*.real.html` は Git 管理外）

## 進め方の注意（運用で分かったこと）

- **マージは毎回ユーザーの明示的な許可が必要**（「#N をマージして」）。曖昧な「進めて」では自動の安全確認に止められる。強制 push も止められるので、ブランチの更新はマージコミットで行う
- 積み重ねた PR は、先に向き先を main に変えてからマージする
- ユーザーへの説明は日本語・平易に。トークンなどの秘密はチャットに貼らないよう案内する（一度貼られたのでロール済み）
- Cloudflare の API トークンは「ユーザーの API トークン」（`cfut_`）。アカウント API トークン（`cfat_`）は Workers API で使えなかった
- `pkill -f` は自分のコマンドまで止めるので使わない（ポートは `fuser -k 3000/tcp`）
- Playwright のブラウザがローカルから消えることがある → `pnpm exec playwright install chromium`

## 技術メモ（ハマりどころ）

- **D1 の batch で結合すると同名の列（id, name, slug）が上書きされる** → `src/server/db/alias.ts` の `aliased()` で SQL の別名を付ける
- D1 は1文あたり値（パラメータ）100個まで。drizzle は全列を並べるので多行 INSERT に注意（取得は準備済みの文で1件ずつ）
- `wrangler tail` には PR プレビュー（別名 URL）の実行は流れない。CPU 計測は staging にデプロイしてから `node scripts/measure-cpu.mjs`
- 会場画面の描画は 4〜20ms（起動直後は 47ms）。キャッシュから返すと 0〜1ms
- E2E は `tests/e2e/helpers.ts` の `open()` でハイドレーション完了（`html[data-hydrated]`）を待つ。globalSetup で毎回 `db:setup:local`
- サンプル公演は local / staging だけ（`src/server/db/seed/sample-events.ts`、日付は流した日基準）
- Biome は Markdown・`docs/`・fixture を対象外にしている
- TanStack Router は現在のページへのリンクに自動で `aria-current="page"` を付ける
- タイルのリンク名は画面の文字と一致させる（axe の label-content-name-mismatch）
