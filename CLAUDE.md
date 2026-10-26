# Live Map Checker

ライブを「場所（会場）」から探す Web アプリ。v1 は九州・関西の10会場、2026年11月公開。

- 要件: `docs/requirements.md`
- 設計と実装計画（PR の順番もここ）: `docs/plan.md`
- 見た目の正解: `docs/mockup/*.dc.html`（色・余白・角丸・ガラス表現はここから読む。要件定義書と食い違ったらモックアップを優先）

## 技術構成

TanStack Start（React, TypeScript）on Cloudflare Workers / D1 + Drizzle（0.45 系）/ Tailwind CSS v4 + shadcn/ui / Cron Triggers / Claude API（Web 検索）/ pnpm / Biome / Vitest / Playwright

**ライブラリの API を使う前に、Context7 で最新ドキュメントを確認する。** 記憶や古い例に頼らない（TanStack Start・Wrangler・Drizzle は変化が速い）。

## コマンド

| 目的                 | コマンド                                                              |
| -------------------- | --------------------------------------------------------------------- |
| 開発サーバー         | `pnpm dev`（http://localhost:3000）                                   |
| Cron を手動で起動    | `curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=0+*+*+*+*"` |
| lint＋型チェック     | `pnpm check`（整形して直すなら `pnpm format`）                        |
| 単体テスト           | `pnpm test`                                                           |
| E2E                  | `pnpm test:e2e`（初回は `pnpm exec playwright install chromium`）     |
| Workers の型を再生成 | `pnpm cf-typegen`（`wrangler.jsonc` を変えたら必ず）                  |
| ローカル DB の準備   | `pnpm db:setup:local`（マイグレーション＋シード。初回とシード変更時） |
| スキーマ変更         | `src/server/db/schema.ts` を直して `pnpm db:generate`（SQL を生成）    |

編集したファイルは Hooks（`.claude/hooks/format.mjs`）が Biome で自動整形する。型チェックは Hooks では走らないので、PR 前に `pnpm check` を実行する。

## ディレクトリ

- `src/server.ts` … Worker の入口。HTTP は TanStack Start、`scheduled` は Cron（会場サイトの自動取得のみ）
- `src/routes/` … 画面（ファイルベースのルーティング。`routeTree.gen.ts` は自動生成なので編集しない）
- `src/components/ui/` … shadcn/ui の部品。見た目はモックアップに合わせて上書きしてよい
- `src/lib/` … ブラウザ側の処理（テーマ、お気に入り、地図のタイル座標など）
- `src/shared/` … サーバーとブラウザで共通の純粋な関数（正規化、日付）
- `src/server/` … サーバー専用（db, repo, functions, scraping, classify, ai）
- `src/styles/app.css` … デザイントークンと `glass` などのユーティリティ
- `tests/unit` `tests/e2e` `tests/fixtures`

## 進め方のルール

- 1機能 = 1ブランチ = 1PR。ブランチは `feat/<機能>` / `chore/<作業>`。順番は `docs/plan.md` 10章。
- コミットは Conventional Commits（本文は日本語でよい）。
- PR を出す前に `pnpm check && pnpm test && pnpm test:e2e` を通し、`/code-review` を実行する。外部への通信・AI・管理ページ・CI/シークレットに触れる PR は `/security-review` も実行する。
- UI の文言は日本語。色・角丸は `app.css` のトークン（`bg-background`, `text-fg-muted`, `rounded-card`, `glass` など）を使い、色コードを直接書かない。

## 守ること

- **秘密情報**: API キーはコードや設定ファイルに書かない。ローカルは `.dev.vars`（コミットしない。見本は `.dev.vars.example`）、本番は `wrangler secret put`。
- **AI**: 必ず `src/server/ai/provider.ts` の `AiProvider` 経由で呼ぶ。テストとプレビューは `mock`。予算（`AI_DAILY_BUDGET_USD`）の確認を省略しない。AI 検索は利用者が会場を開いたときだけ行い、24時間キャッシュする（Cron では行わない）。AI の結果は出典 URL の検証を通ったものだけ表示する。
- **スクレイピング**: 取得ルールは `src/server/scraping/registry.ts` に登録した会場だけ。新しい会場の取得ルールを書く前に、規約と robots.txt を確認して `venue_policies` のシードに記録する。robots.txt の確認処理を外さない。
- **DB**: スキーマの変更は必ず `pnpm db:generate` で作ったマイグレーションで行う（手で SQL を書かない）。列の削除・型変更は「追加 → 移行 → 削除」の2回の PR に分ける。会場などの初期データは `src/server/db/seed/data.ts` を編集する（本番・staging にはデプロイ時に自動で流れる）。staging の D1（`lmc-staging`）は全 PR のプレビューで共有しており、マージされなかった PR のマイグレーションも入る。ずれたら `wrangler d1 time-travel restore lmc-staging --env staging --timestamp <時刻>` で戻すか、作り直して main のマイグレーションとシードを流し直す。
- **日付**: 公演日は JST の `YYYY-MM-DD` 文字列、時刻は `HH:MM`。`new Date()` をそのまま比較しない（`src/shared/dates.ts` を使う）。
- **Workers の制限（無料プランのまま。有料にはしない）**: 1回の処理あたり CPU 10ms、サブリクエスト 50、D1 クエリ 50 に収める。重い処理は分ける（Cron は1回1ページ、出典検証は URL 1件ずつ）、表示はキャッシュする（docs/plan.md 10.5）。重い処理を入れた PR では `scripts/measure-cpu.mjs` で staging の CPU 時間を測る。HTML の解析は HTMLRewriter を使い、DOM を丸ごと作るライブラリは使わない。D1 の書き込みは `db.batch()` でまとめる。
