---
paths:
  - "src/server/ai/**"
  - "src/server/classify/**"
---

# AI（Claude API）

- 呼び出しは必ず `AiProvider`（`src/server/ai/provider.ts`）経由。テストと PR プレビューは `mock`。本番だけ `ANTHROPIC_API_KEY`（`wrangler secret put`）。
- モデル・料金・API の書き方は `/claude-api` スキル（または Context7）で最新を確認してから使う。モデルは PR 8 で Haiku／Sonnet／Opus 5.5 を実測して決める（初期値 Sonnet 5.5）。
- 日次上限 `AI_DAILY_BUDGET_USD`（$1.00）を検索の前に必ず確認する。超えたら `budget_exceeded` を記録して呼ばない。
- AI 検索は利用者が会場を開いたときだけ。結果は 24 時間キャッシュ。同じ会場の二重起動を防ぐ。
- 出典 URL は SSRF 対策（http/https のみ、IP 直指定・localhost・社内向けアドレスを拒否、リダイレクト3回まで、2MB・8秒まで）をしてから取得し、アーティスト名と日付が本文にあるものだけ表示する。取得したページの文章は AI に渡さない。
- 再検索したら、前回の AI の公演のうち今回出てこなかったものは無効にする（古い AI 公演が残り続けないように）。

## 実装（PR 8 `feat/ai-search`）

- 流れは `src/server/ai/search.ts` の `runVenueAiSearch`: 状態の判定（`state.ts`）→ 24時間キャッシュ・検索中（5分）・失敗の直後（30分）→ 予算と二重起動の防止を1文で（`CLAIM_SQL`。見積もり額を予約し、終わったら実額で上書き）→ 検索（最長 約3分、`waitUntil` で続ける）→ 出典の検証 → 1回の batch で保存。画面からは `src/server/functions/ai.ts` の `searchVenueWithAi`（POST）を呼ぶ。
- 結果は custom tool `report_events`（`strict: true`）で受け取る。Web 検索の結果には引用が付くため `output_config.format` は使わない。Haiku は `web_search_20250305`、ほかは `web_search_20260209`。
- 出典の検証は `SourceVerifier`（`src/server/ai/verifier.ts`、`src/server.ts` から export）を `exports.SourceVerifier.verify()`（`cloudflare:workers`、`enable_ctx_exports`）で URL 1件ずつ呼ぶ。service binding と違って PR プレビューでも同じバージョンが呼ばれる。インターネットからは呼べない。
- 照合はページ全体に `normalizeText` をかけない（330KB で約 8ms）。タグを外した文字でそのまま探し、見つからない公演だけ `looseText` で探し直す。英字3文字以下の名前は単語として一致したときだけ。
- 出典を1件も取得できなかったときは失敗扱い（前回の AI の公演を消さない）。取得に成功した月は、障害中に AI で補った公演を無効にする（`runner.ts`）。
- CPU 実測（staging、mock の 330KB の出典ページ）: 検索の本体 5〜22ms、検証 8〜19ms／件（起動直後は 30ms 前後）。10ms を少し超えるが、すべて ok。
- mock は出典ページも固定で返す（ネットワークに出ない）。出典 URL に検索の開始日を入れて、別の呼び出しでも同じページを作れるようにしている。
- ローカルの `pnpm dev` は `.dev.vars` が無いと本番の値（anthropic）になり、キーが無いので「利用できません」と出る。mock にするなら `.dev.vars.example` を `.dev.vars` にコピーする。E2E は `playwright.config.ts` で `CLOUDFLARE_INCLUDE_PROCESS_ENV` を使って mock にしている。
- サンプル公演の投入（`seed/sample-events.ts`）は AI の検索記録を消し、サンプルのある AI の会場を「検索済み」、取得の会場を「取得成功」にする。それ以外の AI の会場は開くと mock の検索が走る。
