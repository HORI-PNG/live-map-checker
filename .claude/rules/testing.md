---
paths:
  - "tests/**"
  - "playwright.config.ts"
  - "vitest.config.ts"
---

# テスト

- `pnpm test` は2つのプロジェクト: `unit`（Node）と `integration`（`@cloudflare/vitest-plugin`、Workers 環境＋ローカル D1）。結合テストは `tests/integration/setup.ts` でマイグレーション・シード・サンプル公演（「今日」= 2026-11-01）を入れる。
- 結合テストで DB を書き換えたら `finally` で戻す（同じファイルのテストは DB を共有する）。数えるときはサンプル公演（`fingerprint LIKE 'sample:%'`）を除く。
- E2E はスマホ幅（390px）と PC 幅（1440px）の2プロジェクト。片方だけのテストは `test.skip(({ viewport }) => …)` で絞る。
- **E2E では `tests/e2e/helpers.ts` の `open(page, path)` を使う。** ハイドレーション完了（`html[data-hydrated]`）を待たずにクリックすると、ボタンが反応しないことがある。
- E2E の前に globalSetup が `pnpm db:setup:local` を流す（サンプル公演の日付を今日基準にそろえる）。
- アクセシビリティは axe で検査している。リンクやボタンの読み上げ名は、画面の文字を含める（`aria-label` で別の文言にすると label-content-name-mismatch になる。補足は `sr-only` の文字で足す）。
- TanStack Router は現在のページへのリンクに `aria-current="page"` を自動で付ける。
- 画面の確認でスクリーンショットを撮るスクリプトは `.wrangler/`（Git 管理外）に置く（scratchpad に置くと node_modules を見つけられない）。開発サーバーの起動直後の1枚目は描画が間に合わないことがある。
