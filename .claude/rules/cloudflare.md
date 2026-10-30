---
paths:
  - "src/server.ts"
  - "src/server/**"
  - "src/routes/**"
  - "wrangler*.jsonc"
  - "scripts/**"
---

# Cloudflare Workers（無料プラン）

- 1回の処理あたり **CPU 10ms**、サブリクエスト 50、D1 クエリ 50。有料プランにはしない（ユーザーの決定）。
- 重い処理は Cloudflare の外か、分けて行う（docs/plan.md 10.5）。
  - 会場サイトの取得: GitHub Actions の中の `wrangler dev`（ローカルの workerd）＋ D1 の `remote: true`（`wrangler.scraper.jsonc`）。Cloudflare の Cron で1ページずつ取ると CPU 15〜40ms かかり、収まらなかった。本番 Worker の Cron は使わない。
  - AI の出典検証: URL 1件ずつ別の呼び出しに分け、本文は軽い文字列処理で照合する（HTMLRewriter で要素ごとに処理すると 370KB で 40ms かかった）。
- 表示用ページは `src/server/cache.ts` で Cache API に5分保存する（workers.dev でも効く。2回目以降 `x-lmc-cache: hit`）。鍵はパスと `?mode` だけ＋デプロイのバージョン。サーバー関数（`/_serverFn/`）や利用者ごとに違う内容はキャッシュしない。
- 実測の目安: 会場画面の描画 4〜20ms（起動直後 47ms）、キャッシュから 0〜1ms。
- CPU の計測は `scripts/measure-cpu.mjs`。**PR プレビュー（別名 URL）の実行は `wrangler tail` に流れない**ので、測るブランチを staging にデプロイしてから測る。
- HTML の解析は HTMLRewriter（DOM を丸ごと作るライブラリは使わない）。HTMLRewriter が返す文字や属性の値は文字参照（`&quot;` `&amp;`）のままなので `decodeEntities` で戻す。
- tsconfig にブラウザ用の型（DOM）も入っているため、`caches.default` などは型を明示して使う。
- `wrangler.jsonc` のバインディングと vars は env に継承されない。staging（`env.staging`）にも同じものを書く。変えたら `pnpm cf-typegen`。
