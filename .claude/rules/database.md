---
paths:
  - "src/server/db/**"
  - "src/server/repo/**"
  - "src/server/scraping/**"
  - "drizzle/**"
  - "scripts/seed.ts"
  - "tests/integration/**"
---

# D1 と Drizzle

- スキーマを直したら `pnpm db:generate`。マイグレーションは手で書かない。列の削除・型変更は「追加 → 移行 → 削除」の2回の PR に分ける。
- 本番はデプロイ前にマイグレーション、デプロイ後にシード（`deploy.yml`）。PR プレビューは staging にマイグレーションとシード（`preview.yml`）。
- **D1 の batch で結合すると、同じ列名（id, name, slug など）が上書きされる。** batch に入れる結合クエリでは `src/server/db/alias.ts` の `aliased()` で SQL の別名を付ける（テーブルを丸ごと select しない）。
- D1 は1文あたりの値（パラメータ）が 100 個まで。drizzle は INSERT に全列（既定値の列も）を並べるので、多行 INSERT はすぐ上限を超える。件数が多い書き込みは準備済みの文（`d1.prepare().bind()`）を batch で流す。
- 1画面の読み出しは `db.batch` で1往復にまとめる。書き込みもまとめる（D1 への往復ごとに CPU 時間を使う）。
- シードは `src/server/db/seed/data.ts`（冪等な upsert に変換される）。DB を直接書き換えても次のデプロイでシードの値に戻る。会場をやめるときは `isActive: false`。
- サンプル公演（`seed/sample-events.ts`）は local と staging だけ。日付は流した日からの相対。本番には入れない。
- staging の D1（`lmc-staging`）は全 PR のプレビューで共有。マージされなかった PR のマイグレーションも入る。ずれたら `wrangler d1 time-travel restore lmc-staging --env staging --timestamp <時刻>` か、作り直して main のマイグレーションとシードを流し直す。
- `drizzle-kit` は 0.31 系（平らな `drizzle/migrations/*.sql`）。drizzle v1 RC のフォルダ形式は使っていない。
