---
paths:
  - "src/server/scraping/**"
  - "src/scraper-entry.ts"
  - "scripts/scrape.mjs"
  - "wrangler.scraper.jsonc"
  - ".github/workflows/scrape.yml"
  - "tests/fixtures/**"
  - "src/server/db/seed/data.ts"
---

# 会場サイトの取得

- 新しい会場の取得ルールを書く前に、規約と robots.txt を確認して `src/server/db/seed/data.ts` の `VENUE_POLICIES` に記録する（URL・該当箇所の引用・判定・確認日時）。禁止・不明なら `fetchMode: 'ai_only'`。
- 取得ルールは `ScraperAdapter`（`types.ts`）を実装し、`registry.ts` に登録する。会場ごとの違いは `venues.scraper_config`。
- 1回の取得（`runScrapeTick`）は1ページだけ。D1 は読み出し1往復・書き込み1往復にまとめる。会場の状態（`venue_fetch_state`）は全ページの結果から決める。
- 失敗の種類: network / http / robots（skipped）/ parse / empty（前回3件以上→0件）/ drop（20%未満に急減）。解析中の例外は parse。別の月のページが返ったら parse。
- 重複判定の鍵は会場・日付・開演時刻・正規化タイトルの FNV ハッシュ（`fingerprintOf`）。今日より前の公演は、ページから消えても無効にしない。ライブ判定（category）は取り直しても消さない。
- 実ページの確認は `node scripts/scrape.mjs staging`。本番は GitHub Actions の「Scrape」（6時間ごと、手動実行も可）。
- **会場サイトの本物の HTML は公開リポジトリに入れない。** 保存したら `*.real.html`（Git 管理外）にし、テスト用の fixture は構造と大きさを保ったまま文字・URL をダミーに置き換える（`tests/fixtures/zepp/fukuoka-2026-11.html` が例）。
- 取得ルールのテストは HTMLRewriter が必要なので結合テスト（`tests/integration/`）に書く。通信は偽の fetch に差し替える。
