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
