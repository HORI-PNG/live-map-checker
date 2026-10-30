# Live Map Checker

ライブを「場所（会場）」から探す Web アプリ。v1 は九州・関西の10会場、2026年11月公開。

- 要件: `docs/requirements.md`
- 設計と実装計画（PR の順番もここ）: `docs/plan.md`
- **進捗と残りのタスク（引き継ぎ）: `PROGRESS.md`** … 作業を始める前に読み、PR をマージしたら更新する
- 見た目の正解: `docs/mockup/*.dc.html`（色・余白・角丸・ガラス表現はここから読む。要件定義書と食い違ったらモックアップを優先）
- 分野ごとの詳しいルールとハマりどころ: `.claude/rules/`（該当するファイルを触るときに読み込まれる）

## 技術構成

TanStack Start（React, TypeScript）on Cloudflare Workers（無料プラン）/ D1 + Drizzle（0.45 系）/ Tailwind CSS v4 + shadcn/ui / GitHub Actions（CI・デプロイ・会場サイトの取得）/ Claude API（Web 検索）/ pnpm / Biome / Vitest / Playwright

**ライブラリの API を使う前に、Context7 で最新ドキュメントを確認する。** 記憶や古い例に頼らない（TanStack Start・Wrangler・Drizzle は変化が速い）。

## コマンド

| 目的                 | コマンド                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| 開発サーバー         | `pnpm dev`（http://localhost:3000）                                                            |
| ローカル DB の準備   | `pnpm db:setup:local`（マイグレーション＋シード＋サンプル公演。初回とシード変更時）            |
| lint＋型チェック     | `pnpm check`（整形して直すなら `pnpm format`）                                                 |
| 単体・結合テスト     | `pnpm test`                                                                                    |
| E2E                  | `pnpm test:e2e`（ブラウザが無いと言われたら `pnpm exec playwright install chromium`）          |
| スキーマ変更         | `src/server/db/schema.ts` を直して `pnpm db:generate`（SQL を生成）                             |
| Workers の型を再生成 | `pnpm cf-typegen`（`wrangler.jsonc` を変えたら必ず）                                           |
| 会場サイトの取得     | `node scripts/scrape.mjs staging`（staging の D1 に書き込む。本番は GitHub Actions が6時間ごと） |
| CPU 時間の計測       | staging にデプロイしてから `node scripts/measure-cpu.mjs`（手順はスクリプトの冒頭）             |

編集したファイルは Hooks（`.claude/hooks/format.mjs`）が Biome で自動整形する。型チェックは Hooks では走らないので、PR 前に `pnpm check` を実行する。

## ディレクトリ

- `src/server.ts` … Worker の入口（HTTP は TanStack Start、表示用ページのキャッシュ）
- `src/scraper-entry.ts` … 会場サイトの取得用の入口。Cloudflare にはデプロイせず、GitHub Actions の中の wrangler dev で動かす（`wrangler.scraper.jsonc`、`scripts/scrape.mjs`）
- `src/routes/` … 画面（ファイルベースのルーティング。`routeTree.gen.ts` は自動生成なので編集しない）
- `src/components/ui/` … shadcn/ui の部品。見た目はモックアップに合わせて上書きしてよい
- `src/lib/` … ブラウザ側の処理（テーマ、お気に入り、地図のタイル座標など）
- `src/shared/` … サーバーとブラウザで共通の純粋な関数（正規化、日付）
- `src/server/` … サーバー専用（db, repo, functions, scraping, classify, ai）
- `src/styles/app.css` … デザイントークンと `glass` などのユーティリティ
- `tests/unit` `tests/integration`（Workers 環境＋ローカル D1）`tests/e2e` `tests/fixtures`

## 進め方のルール

- 1機能 = 1ブランチ = 1PR。ブランチは `feat/<機能>` / `chore/<作業>`。順番は `docs/plan.md` 10章（現在地は `PROGRESS.md`）。
- コミットは Conventional Commits（本文は日本語でよい）。
- PR を出す前に `pnpm check && pnpm test && pnpm test:e2e` を通し、`/code-review` を実行する。外部への通信・AI・管理ページ・CI/シークレットに触れる PR は `/security-review` も実行する。
- **PR のマージは、毎回ユーザーの明示的な許可（「#N をマージして」）をもらってから行う。** 「進めて」だけでは許可とみなさない。許可をもらったらマージ後に本番デプロイの成功まで確認する。
- **強制 push（`--force` / `--force-with-lease`）や履歴の書き換えはしない。** ブランチを最新にするときは main をマージする。
- 積み重ねた PR（別の PR のブランチを base にしたもの）は、土台の PR をマージする前に向き先を main に変えておく。
- マージ済みのブランチは削除する（`gh pr merge --delete-branch`）。
- PR をマージしたら `PROGRESS.md` を更新する。

## ユーザーとのやりとり

- 説明は日本語で、専門用語には短い説明を添える。ユーザーに操作をお願いするときは、押す場所・入力するコマンドを1つずつ示す。
- **API キーやトークンの値をチャットに貼らないよう案内する。** 値はユーザー自身のターミナル（`read -rs` や `gh secret set` の入力欄）にだけ入力してもらう。貼られてしまったら、すぐにロール（無効化）を案内する。
- Cloudflare の API トークンは「ユーザーの API トークン」（`cfut_` で始まる）を使う。アカウント API トークン（`cfat_`）は Workers の API で使えなかった。

## 守ること

- **費用**: Cloudflare は無料プランのまま（**有料にはしない**。ユーザーの決定）。AI の費用は `AI_DAILY_BUDGET_USD`（1日 $1.00）で止める。
- **秘密情報**: API キーはコードや設定ファイルに書かない。ローカルは `.dev.vars`（コミットしない。見本は `.dev.vars.example`）、本番は `wrangler secret put`、CI は GitHub の Environment（production / preview）。
- **AI**: 必ず `src/server/ai/provider.ts` の `AiProvider` 経由で呼ぶ。テストとプレビューは `mock`。予算の確認を省略しない。AI 検索は利用者が会場を開いたときだけ行い、24時間キャッシュする（取得の処理では行わない）。AI の結果は出典 URL の検証を通ったものだけ表示する。
- **スクレイピング**: 取得ルールは `src/server/scraping/registry.ts` に登録した会場だけ。新しい会場の取得ルールを書く前に、規約と robots.txt を確認して `venue_policies` のシードに記録する。robots.txt の確認処理を外さない。会場サイトの本物の HTML は公開リポジトリに入れない（`*.real.html` は Git 管理外）。
- **DB**: スキーマの変更は必ず `pnpm db:generate` で作ったマイグレーションで行う（手で SQL を書かない）。会場などの初期データは `src/server/db/seed/data.ts` を編集する。
- **日付**: 公演日は JST の `YYYY-MM-DD` 文字列、時刻は `HH:MM`。`new Date()` をそのまま比較しない（`src/shared/dates.ts` を使う）。
- **Workers の制限**: 1回の処理あたり CPU 10ms、サブリクエスト 50、D1 クエリ 50 に収める（詳しくは `.claude/rules/cloudflare.md`）。
- **シェル**: `pkill -f` は自分のコマンドまで止めてしまうので使わない。開発サーバーを止めるときは `fuser -k 3000/tcp`。
