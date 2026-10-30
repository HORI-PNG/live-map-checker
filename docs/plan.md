# Live Map Checker v1 設計・実装計画（docs/plan.md）

- 作成日: 2026-10-23
- 対象: v1（2026年11月中に公開）
- 前提資料: `docs/requirements.md`（要件定義書）、`docs/mockup/`（UIモックアップ確定版）

## 0. Context（この計画の目的）

場所（会場）からライブを探す Web アプリ「Live Map Checker」の v1 を、11月中に公開する。現在リポジトリには要件定義書とモックアップしかなく、コードはない。この計画は、要件定義書で「設計時に決定」とされた項目（スクレイピングの可否、ライブ判定、地図データ、表記ゆれ、AI費用の上限）を決め、1機能＝1ブランチ＝1PRで実装できる順番に分けるためのもの。

### 計画前に決めたこと（質疑の結果）

| 項目 | 決定 |
|---|---|
| ライブ判定 | ルール＋AIの併用（ルールで決まらないものだけAIで分類し、結果をキャッシュ） |
| AI費用の上限 | 研究室の予算を使うため月1,000円の制約は外す。暴走対策として日次上限 $1.00 で停止（6会場を毎日検索できる値）。Anthropic コンソールの利用上限も二重に設定 |
| AI検索のタイミング | 利用者が会場を開いたときだけ検索し、結果を24時間キャッシュ。Cron は会場サイトの自動取得専用（毎朝の事前検索はしない。2026-10-23 決定） |
| 取得失敗の把握 | 管理ページ（/admin、Cloudflare Access で保護）で確認 |
| パッケージ管理・公開URL | pnpm、`*.workers.dev`（独自ドメインは後から） |
| Workers プラン | **無料プランのまま続ける（有料にはしない。2026-10-26 決定）**。PR 1 の実測で 10ms を超えた処理（会場画面の描画 最大49ms、出典検証 最大54ms）は、11章の「CPU 10ms に収める工夫」で対応する |
| プレビュー環境のDB | 共有の staging 用 D1 を1つ。プレビューでは AI はモック |
| お問い合わせ | Microsoft Forms へのリンク |
| 演出 | スクロールでの出現アニメのみ（カルーセルは v2 以降） |
| AIモデル | 実測して決める（初期値 Sonnet 5.5。AI検索PRで Haiku 5.5／Sonnet 5.5／Opus 5.5 を比較し確定。環境変数で切替） |
| 日本地図 | モックアップどおり**タイル配置**（GeoJSON は使わない → 地図データのライセンス問題が発生しない） |

### 調査で分かった前提（2026-10-23 時点の公式ドキュメント）

- TanStack Start（`@tanstack/react-start` 1.169 系）は Cloudflare の Vite プラグインで Workers に載る。Cron 用の `scheduled` は `src/server.ts` に独自の入口を作って並べる。
- 無料プランの制限: CPU 10ms/回（HTTP・Cron とも）、サブリクエスト 50/回、Cron は1アカウント5個まで、D1 のクエリは 50/回・書き込み 10万行/日。
- Drizzle の安定版は 0.45 系（ドキュメントは v1 RC が中心）。v1 は安定版の 0.45 系を使う。
- Workers の Vitest 連携は `@cloudflare/vitest-plugin`（旧 `vitest-pool-workers`。Vitest 4.1 以上）。
- ローカルで Cron を試す URL は `/cdn-cgi/local/scheduled`。
- Context7 は認可エラーのため今回は使えず、公式サイトを直接確認した。**各 PR の最初に Context7 で再確認する**（CLAUDE.md に明記）。

---

## 1. プロジェクトの初期構成

### 作成コマンド（PR 1 で実行。承認前には実行しない）

```bash
# 1) 既存の docs/ があるため、一時ディレクトリに作ってから移す
pnpm create cloudflare@latest lmc-tmp --framework=tanstack-start --git=false --deploy=false
rsync -a lmc-tmp/ ./ --exclude .git && rm -rf lmc-tmp
git init && git switch -c main

# 2) UI
pnpm dlx shadcn@latest init            # Tailwind v4 + tw-animate-css。既存プロジェクトへの追加
pnpm dlx shadcn@latest add button toggle-group switch skeleton sonner

# 3) DB・AI・検証
pnpm add drizzle-orm@^0.45 @anthropic-ai/sdk zod
pnpm add -D drizzle-kit@^0.31 @biomejs/biome vitest@^4.1 @cloudflare/vitest-plugin @playwright/test @axe-core/playwright

# 4) D1（本番と staging）
pnpm wrangler d1 create lmc-prod
pnpm wrangler d1 create lmc-staging
```

`vite.config.ts` は `cloudflare({ viteEnvironment: { name: 'ssr' } })`, `tanstackStart()`, `viteReact()`, `tailwindcss()` の順。`wrangler.jsonc` は次の形にする。

```jsonc
{
  "name": "live-map-checker",
  "main": "src/server.ts",               // fetch は TanStack Start、scheduled は自前
  "compatibility_flags": ["nodejs_compat"],
  "upload_source_maps": true,
  "observability": { "enabled": true },
  "triggers": { "crons": ["*/10 * * * *"] },   // 会場サイトの自動取得のみ。1回で1ページ（AI 検索には使わない）
  "d1_databases": [{ "binding": "DB", "database_name": "lmc-prod", "database_id": "…", "migrations_dir": "drizzle/migrations" }],
  "vars": { "AI_PROVIDER": "anthropic", "AI_MODEL": "claude-sonnet-5-5", "AI_DAILY_BUDGET_USD": "1.00" },
  "env": {
    "staging": {
      "d1_databases": [{ "binding": "DB", "database_name": "lmc-staging", "database_id": "…", "migrations_dir": "drizzle/migrations" }],
      "vars": { "AI_PROVIDER": "mock", "AI_MODEL": "mock", "AI_DAILY_BUDGET_USD": "0" },
      "triggers": { "crons": [] }      // staging では定期取得しない（必要なら手動）
    }
  }
}
```

サーバーのコードでは `import { env } from "cloudflare:workers"` で `env.DB` を使う。型は `pnpm cf-typegen`（`wrangler types`）で生成する。

### ディレクトリ構成

```
live_map_checker/
├─ CLAUDE.md
├─ .claude/settings.json          # Hooks（整形）
├─ .claude/hooks/format.sh
├─ .github/workflows/{ci,preview,deploy}.yml
├─ .github/pull_request_template.md
├─ biome.json  vite.config.ts  vitest.config.ts  playwright.config.ts
├─ wrangler.jsonc  drizzle.config.ts  .dev.vars.example
├─ drizzle/migrations/            # drizzle-kit generate の出力（wrangler が適用）
├─ docs/  requirements.md  plan.md  mockup/
├─ src/
│  ├─ server.ts                   # fetch（TanStack Start）+ scheduled（Cron）
│  ├─ router.tsx
│  ├─ routes/                     # __root, index, regions.$region, prefectures.$pref,
│  │                              # venues.$venue, favorites, account, about.data, terms, privacy, admin
│  ├─ components/
│  │  ├─ ui/                      # shadcn/ui
│  │  ├─ nav/  TabBar SideNav
│  │  ├─ layout/  AppShell Header Breadcrumb
│  │  ├─ map/  TileMap RegionTile
│  │  └─ venue/  EventCard EventLinks AiBadge ModeToggle
│  ├─ lib/                        # theme.ts, favorites/, map-layout.ts, reveal.ts
│  ├─ shared/                     # normalize.ts, artist-aliases.ts, dates.ts（サーバー・ブラウザ共通）
│  ├─ server/
│  │  ├─ db/  schema.ts client.ts seed/
│  │  ├─ repo/  venues.ts events.ts fetchState.ts aiSearches.ts
│  │  ├─ functions/               # createServerFn（画面から呼ぶ入口）
│  │  ├─ scraping/  types.ts registry.ts fetcher.ts robots.ts runner.ts adapters/
│  │  ├─ classify/  rules.ts classify.ts
│  │  └─ ai/  provider.ts anthropic.ts mock.ts search.ts verify.ts budget.ts pricing.ts
│  └─ styles/app.css              # Tailwind v4、@theme、@custom-variant dark、glass
└─ tests/  unit/ integration/ e2e/ fixtures/<venue>/*.html
```

### lint／format と Hooks

- **Biome v2** を採用（lint と format を1つの道具で、速い）。利用者数は ESLint＋Prettier の方が多いが、この規模なら設定が少なく済む Biome の方が向いている。`shadcn` の生成物もそのまま整形対象にする。
- Claude Code の Hooks（`.claude/settings.json`、リポジトリに含める）:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh", "timeout": 30 }] }
    ]
  }
}
```

`format.sh` は標準入力の JSON から `jq -r '.tool_input.file_path'` で編集したファイルを取り出し、対象の拡張子（ts/tsx/js/json/css）なら `pnpm biome check --write <file>` を実行する。型チェック（`tsc --noEmit`）は重いので Hooks ではなく CI と `pnpm check` で行う。

- `package.json` のスクリプト: `dev`, `build`（`vite build && tsc --noEmit`）, `check`（biome + tsc）, `test`, `test:e2e`, `db:generate`, `db:migrate:local|staging|prod`, `db:seed:local|staging|prod`, `cf-typegen`, `deploy`。

### CLAUDE.md に書く内容

1. プロジェクトの概要と、`docs/requirements.md`・`docs/plan.md`・`docs/mockup/` へのリンク（見た目はモックアップが正）
2. よく使うコマンド（上のスクリプト、ローカルで Cron を試す `curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`）
3. ディレクトリの地図と、どこに何を書くか
4. 進め方のルール: 1機能＝1ブランチ＝1PR、Conventional Commits、PR 前に `pnpm check && pnpm test`、`/code-review` を実行
5. **ライブラリの API を使う前に Context7 で最新ドキュメントを確認する**
6. 秘密情報: キーをコードや `.dev.vars` 以外に書かない。`.dev.vars` はコミットしない
7. AI は必ず `AiProvider` 経由で呼ぶ。テスト・プレビューは `mock`。予算確認を省略しない
8. スクレイピング: 取得ルールは `registry` に登録した会場だけ。新しい会場は `venue_policies` に確認記録を追加してから。robots.txt の確認を外さない
9. 日付は JST の `YYYY-MM-DD` 文字列。`new Date()` の素の比較をしない（`shared/dates.ts` を使う）
10. 無料プランの制限（CPU 10ms、サブリクエスト 50、D1 クエリ 50/回）を意識する
11. UI 文言は日本語。色・角丸は `app.css` のトークンだけを使う

---

## 2. DB設計（D1 + Drizzle）

日付は **JST の暦日文字列**（`YYYY-MM-DD`）、時刻は `HH:MM` 文字列で持つ（タイムゾーン変換の事故を防ぐ）。記録用の日時は UTC の ISO 文字列。ID は整数の連番、URL には `slug` を使う。

### テーブル

| テーブル | 主な列 | 役割 |
|---|---|---|
| `regions` | id, slug(`kyushu`), name(`九州`), display_name(`九州・沖縄`), sort_order | 地方 |
| `prefectures` | id, region_id, slug(`fukuoka`), name(`福岡県`), short_name(`福岡`), sort_order | 県 |
| `venues` | id, prefecture_id, slug, name, area(`福岡市博多区`), official_url, schedule_url, **fetch_mode**(`scrape`/`ai_only`/`disabled`), scraper_key, scraper_config(JSON), venue_kind(`music_hall`/`arena`/`dome`/`multi_purpose`), sort_order, is_active | 会場。取得方法は会場ごとにここで切替 |
| `venue_policies` | id, venue_id, robots_url, robots_result(`allowed`/`disallowed`/`not_found`/`unreachable`), terms_url, terms_verdict(`ok`/`prohibited`/`unclear`), terms_quote, checked_at, checked_by, note | 情報源（規約・robots.txt の確認記録）。確認履歴として追記していく |
| `events` | id, venue_id, **source_kind**(`scrape`/`ai`), title, artist_name, artist_norm, tour_name, date, open_time, start_time, detail_url, source_url, source_label, category(`live`/`non_live`/`unknown`), classified_by(`venue_label`/`rule`/`ai`/`manual`), fingerprint, ai_search_id, first_seen_at, last_seen_at, is_active | 公演。fingerprint = hash(venue_id + date + 正規化タイトル) で一意。取得で見えなくなった公演は is_active=0 |
| `classification_cache` | title_hash(PK), title, category, method, reason, model, created_at | ライブ判定の結果（同じタイトルを二度AIに聞かない） |
| `ai_searches` | id, venue_id, status(`running`/`succeeded`/`failed`/`budget_exceeded`), provider, model, started_at, finished_at, **expires_at**(=完了+24h), input_tokens, output_tokens, web_search_count, cost_usd_micros, candidates, verified, error | AI検索のキャッシュ兼記録 |
| `ai_verifications` | id, ai_search_id, url, http_status, artist_found, date_found, verdict, checked_at | 出典URLの検証結果（なぜ表示/非表示になったかを後で追える） |
| `fetch_runs` | id, venue_id, trigger(`cron`/`manual`), started_at, finished_at, status(`success`/`failed`/`skipped`), error_kind(`network`/`http`/`robots`/`parse`/`empty`/`drop`), http_status, pages_fetched, events_found, events_live, message, scraper_version | 取得ログ |
| `venue_fetch_state` | venue_id(PK), last_attempt_at, last_success_at, consecutive_failures, last_error_kind | 会場ごとの最新状態（判定を速くするための集計） |

v2 用（v1 では作らない・名前だけ予約）: `users`, `user_favorite_artists`, `user_favorite_venues`, `notification_settings`, `affiliate_links`。

### 「AIで補完する会場か」の判定

```
needsAi(venue) =
  venue.fetch_mode == 'ai_only'
  || (venue.fetch_mode == 'scrape' && (last_success_at が 48時間より前 || consecutive_failures >= 2))
```

### 初期データ（10会場）の入れ方

- `src/server/db/seed/` に地方（8）・県（47）・会場（10）・規約確認記録を **TypeScript の定数**で持つ。型チェックが効き、テストからも同じデータを使える。
- `pnpm db:seed` で、定数から冪等な SQL（`INSERT ... ON CONFLICT(slug) DO UPDATE`）を生成し、`wrangler d1 execute` でローカル／staging／本番に流す。
- スキーマ変更は `drizzle-kit generate` で SQL マイグレーションを作り、`wrangler d1 migrations apply` で適用する（CI からも同じコマンド）。
- 管理画面での会場登録は v1 では作らない（会場の追加はシードの PR で行う）。

### 10会場の初期設定（2026-10-23 の調査結果）

| 会場 | fetch_mode | 根拠 | 取得ルール |
|---|---|---|---|
| Zepp Fukuoka / Osaka Bayside / Namba | `scrape` | robots.txt は `/wp-admin/` のみ禁止。規約に禁止条項なし | `zepp`（共通1本、`hall` を設定で切替。`/hall/{hall}/schedule/?_y=YYYY&_m=M`） |
| 熊本城ホール | `scrape` | robots.txt なし、規約ページなし | `kumamoto-jo-hall`（`/event/YYYYMM.html`） |
| マリンメッセ福岡・福岡国際センター | `ai_only`（取得の候補） | robots.txt は全許可（`Allow: /`）。ただしJSで描画（STUDIO）、規約本文は未確認 | 規約を確認できたら v1.1 で追加（Browser Rendering か CMS の JSON を使うかを、そのときに判断） |
| みずほPayPayドーム福岡 | `ai_only` | 著作権ページに「見出しの表示には別途承諾が必要」 | 承諾が取れたら追加 |
| 大阪城ホール | `ai_only` | 10/23 時点でサイトが緊急メンテナンス中で確認できない | 再開後に再確認 |
| 北九州メディアドーム | `ai_only` | サイトポリシーで複製・転載を禁止 | なし |
| 京セラドーム大阪 | `ai_only` | 規約で無断の引用・転載を禁止 | なし |

---

## 3. データ取得（スクレイピング）

### 3.1 取得ルールを差し替えられる作り

```ts
// src/server/scraping/types.ts
export interface ScraperAdapter {
  key: string;                 // 'zepp' など。venues.scraper_key と対応
  version: number;             // 取得ルールを直したら上げる（fetch_runs に記録）
  pageUrls(config: unknown, today: string): string[];   // 今月〜5か月先
  parse(html: string, ctx: { pageUrl: string; today: string }): RawEvent[];
}
```

- `src/server/scraping/adapters/zepp.ts`, `kumamoto-jo-hall.ts` … を `registry.ts` に登録する。会場ごとの違い（Zepp のホール名など）は `venues.scraper_config` に入れる。
- 抽出結果は zod で検証（日付が正しい、タイトルが空でない）。会場サイトにジャンルのラベルがあれば `RawEvent.venueCategory` に入れる。
- HTML の解析は Workers 標準の **HTMLRewriter**（ストリーム処理で CPU 時間が少ない）。無料プランの CPU 10ms に収めるため、DOM を丸ごと作るライブラリは避ける。

### 3.2 実行の流れ（Cron）

- **取得は GitHub Actions で行う（2026-10-30 変更）**。Cloudflare の Cron で1ページずつ取得すると、1回あたり CPU 15〜40ms かかり、無料プランの 10ms に収まらなかったため（PR 6 の実測）。
  - `.github/workflows/scrape.yml` が6時間ごとに `scripts/scrape.mjs` を動かす。GitHub Actions の中で `wrangler dev`（ローカルの workerd）で取得用の Worker（`src/scraper-entry.ts`、`wrangler.scraper.jsonc`）を起動し、本番の D1 にだけリモートでつなぐ（remote bindings）。取得のコードは Workers 用のまま使える。
  - 1回の実行で、順番待ち（`fetch_pages`。会場×月のページ）のうち20時間以上取っていないページを、3秒間隔で1ページずつ取得する。各ページは1日1回取り直す。
  - 本番の Worker の Cron は使わない（`triggers.crons` は空）。
- AI 検索は取得の処理では行わない（AI 検索は利用者が会場を開いたときだけ。4.2）。
- 取得の手順（`src/server/scraping/fetcher.ts`）:
  1. robots.txt を取得（1日キャッシュ）し、対象パスが許可されているか確認。禁止なら `skipped(robots)` を記録して取得しない。
  2. User-Agent は `LiveMapChecker/1.0 (+https://<公開URL>/about/data)` と明示。同じホストへは間隔を空けて順番に取得。タイムアウト 10 秒。
  3. 抽出 → ライブ判定（5章）→ `events` に upsert（fingerprint で重複排除）。今回見えなかった未来の公演は `is_active=0`。

### 3.3 規約と robots.txt の確認手順

1. 会場ごとに、公式スケジュールページ・`/robots.txt`・利用規約（サイトポリシー／著作権／ご利用にあたって）を確認する。
2. 結果を `venue_policies` のシードに記録する（URL、該当箇所の引用、判定、確認日）。
3. 判定が `prohibited` または `unclear` なら `fetch_mode='ai_only'`。`ok` のときだけ取得ルールを書く。
4. 取得ルールの PR には、確認記録の追加を必須にする（CLAUDE.md とPRテンプレートに明記）。
5. robots.txt は毎回の実行時にも機械的に確認する。規約は**四半期ごと**に人が再確認する（管理ページに「最終確認日」を表示）。
6. 「ライブ情報の取得方法について」のページで、取得元・頻度・連絡先（削除依頼の窓口）を公開する。

### 3.4 失敗の検知と記録

| 種類 | 検知方法 |
|---|---|
| `network` / `http` | 例外、または 200 以外のステータス |
| `robots` | robots.txt で禁止 |
| `parse` | 解析中の例外、zod 検証で不正な行が半数以上 |
| `empty` | 0件（前回は1件以上あった場合）→ ページ構造の変化を疑う |
| `drop` | 件数が前回の 20% 未満に急減 |

- 失敗はすべて `fetch_runs` に記録し、`venue_fetch_state.consecutive_failures` を増やす。成功で 0 に戻す。
- 失敗した会場は、2章の `needsAi` により、閲覧時に自動的にAI補完へ切り替わる。過去に取得した公演は消さずに表示し続ける。
- 管理ページ（/admin）に、会場ごとの最終成功日時・連続失敗回数・直近のエラーと、当日／当月の AI 使用額を表示する。手動で再取得するボタンも置く。

---

## 4. AIによる補完検索

### 4.1 提供元を差し替えられる作り

```ts
// src/server/ai/provider.ts
export interface AiProvider {
  name: string;
  searchVenueEvents(input: VenueSearchInput): Promise<{ candidates: EventCandidate[]; usage: AiUsage }>;
  classifyTitles(titles: string[]): Promise<{ results: Classification[]; usage: AiUsage }>;
}
```

- 実装: `anthropic.ts`（Claude API の Web 検索ツール）、`mock.ts`（テスト・プレビュー用の固定データ）。`AI_PROVIDER` と `AI_MODEL` の環境変数で選ぶ。大学のサービスに替えるときは実装を1つ追加するだけにする。
- ブラウザ内LLM（Chrome内蔵AIなど）は Web 検索ができないため v1 では採用しない。将来、「サーバーが取得した本文からの抽出」専用の実装として追加できる形にしておく。
- Claude の呼び出し: 公式 SDK `@anthropic-ai/sdk`、Web 検索ツール（Sonnet/Opus 5.5 は `web_search_20260209`、Haiku 5.5 は `web_search_20250305`）、`max_uses: 3`、`user_location` は日本。返答は JSON（`{events:[{artist, title, tour, date, open, start, source_url}]}`）で受け取り、zod で検証する。指示文では「音楽のライブだけ」「今日から6か月先まで」「出典URLは検索で実際に見たページだけ」と明示する。
- `stop_reason`（`pause_turn`、`refusal`、`max_tokens`）を必ず確認し、想定外なら失敗として記録する。

### 4.2 呼び出しのタイミングと24時間キャッシュ

1. 会場ページを開くと、サーバーは DB の公演（取得分）と `needsAi` の結果を返す。
2. `needsAi` が真なら、`ai_searches` に24時間以内（`expires_at > now`）の成功結果があるか確認 → あれば、その公演を即時に表示する。
3. なければ、画面は「AIで検索中…（10〜30秒かかることがあります）」のローディングを出し、クライアントから AI 検索用のサーバー関数を呼ぶ。
4. 同時アクセスによる二重課金を防ぐため、同じ会場で `running` の行が2分以内にあれば新しく検索せず、その完了を待つ（2秒ごとに確認）。
5. 結果は検証（4.3）を通ったものだけ `events`（`source_kind='ai'`）に保存し、`expires_at = 完了 + 24時間` とする。
6. 予算超過や失敗のときは、期限切れでも前回の結果があればそれを「最終確認: ○月○日」と添えて表示し、なければ「現在AI検索を利用できません」と表示する。

### 4.3 出典URLの検証（アーティスト名と日付）

`src/server/ai/verify.ts`:

1. URL の安全確認: `https:`/`http:` のみ、IP アドレス直指定・`localhost`・社内向けアドレスは拒否（SSRF 対策）。リダイレクトは3回まで、本文は 2MB まで、タイムアウト 8 秒。
2. 同じ URL は1回だけ取得する（1ページに複数公演があることが多い）。1回の検索で取得するURLは最大 20 件。
   **URL 1件ごとに別の呼び出し（自分自身の Worker への内部リクエスト）で検証する**。それぞれが CPU 10ms の枠を使えるので、大きなページでも上限を超えにくい。
3. 本文の取り出しは軽い文字列処理で行う（script/style を除き、タグを取り除いて文字だけにする）。HTMLRewriter で要素ごとに処理するやり方は、370KB のページで 40ms かかったため使わない。その後、正規化（NFKC、小文字化、空白・記号の除去。7章と同じ関数）。
4. **アーティスト名**: 正規化した名前が本文に含まれるか。
5. **日付**: `2026年11月7日`、`2026/11/07`、`2026.11.7`、`2026-11-07`、`11月7日`、`11/7(土)` などの書き方をすべて生成して照合する。年のない書き方は、ページ内にその年が出てくる場合だけ認める。
6. 両方が見つかったものだけ表示する。結果は `ai_verifications` に記録する。
7. 過去の日付、取得済み公演と重複するもの（fingerprint が同じ）は捨てる。
8. D1 の書き込みは `db.batch()` でまとめる（無料プランの「1回の処理あたりクエリ50回」の制限に収めるため）。
9. 取得したページの文章は AI に渡さない（検証はサーバーの文字列照合だけで行う）。そのため、ページに書かれた指示で AI の動きが変わること（プロンプトインジェクション）は起きにくい。

### 4.4 費用の上限

- 料金の目安（2026-10 時点の公表価格。Web検索は1,000回あたり$10）: 1回の会場検索で検索3回・入力約25kトークンとすると、Haiku 5.5 で約$0.035、Sonnet 5.5 で約$0.10、Opus 5.5 で約$0.20。
- 費用は研究室の予算でまかなうため、月1,000円の制約は外す（2026-10-23 決定）。上限は「暴走したときに止める」ための安全装置として残す。
- **日次上限**: `AI_DAILY_BUDGET_USD = 1.00`（≒ 月$30）。24時間キャッシュにより1会場の検索は1日1回までなので、AI のみの6会場がすべて毎日開かれても（Sonnet 5.5 なら約$0.60）、自動取得に失敗した会場の補完とライブ判定の分を足して収まる値。検索の前に「当日（JST）の合計＋1回分の見積もり」が上限を超えないか確認し、超えるなら `budget_exceeded` を記録して呼ばない。実際の費用はレスポンスの `usage`（トークン数と検索回数）から計算して保存する。
- **注意**: Opus 5.5（約$0.20/回）に決めた場合、6会場で約$1.20 となり **$1.00 では毎日全会場を検索できない**。モデルを決める PR で「6会場×1回の実測費用×1.5」を下回らないよう上限を見直す（Opus なら $1.80 前後）。
- **二重の安全策**: Anthropic コンソールでワークスペースの月額上限を設定する（例: $40）。
- **プレビュー・テスト**: 常に `mock`。本番キーは本番 Worker にだけ設定する。
- **モデルの確定**: AI検索の PR で、AI のみの会場6つを3モデルで1回ずつ検索し、「検証を通った件数」「誤り（検証で落ちた件数）」「費用」「所要時間」を比べて決める。

---

## 5. ライブ判定

### 比較

| 方式 | 長所 | 短所 |
|---|---|---|
| ルールベース | 費用ゼロ、速い、結果が説明できる | 新しい種類のイベントを見逃す、辞書の手入れが要る |
| AIのみ | 精度が高い、辞書が要らない | 全件に費用がかかる、結果がぶれる |
| **併用（採用）** | 大半はルールで決まり、AIは残りだけ → 費用はほぼゼロで精度も高い | 仕組みが少し複雑 |

### 判定の順番（`src/server/classify/`）

1. **会場のラベル**: 会場サイトに「コンサート」「スポーツ」などの種別があれば、それに従う。
2. **除外ルール**: 学会・総会・展示会・見本市・EXPO・〇〇博・フェア・説明会・試験・セミナー・講演・シンポジウム・就職・野球・試合・vs・格闘技・ボクシング・プロレス・相撲・マラソン・販売会・物産・式典 など。
3. **ライブのルール**: LIVE・ライブ・TOUR・ツアー・コンサート・ワンマン・公演・リサイタル・アーティスト名＋年号 など。
4. **残りは `unknown`** → `classification_cache` を確認し、なければ AI でまとめて分類（タイトルを最大50件ずつ。費用は4.4の予算に含める）して保存する。
5. 予算超過などでAI分類できないとき: ライブハウス型の会場（Zepp など、`venue_kind='music_hall'`）は表示し、それ以外は非表示にする。
6. 誤判定の修正: `classification_cache` に `method='manual'` の行を入れれば、それが最優先になる。

除外とライブのキーワード辞書は `rules.ts` に置き、実際の会場ページの HTML（fixtures）を使った単体テストで守る。

---

## 6. 画面とルーティング

### ルート（スマホとPCで同じURL。表示は幅で切り替え）

| URL | スマホ（〜1023px） | PC（1024px〜） | モックアップ |
|---|---|---|---|
| `/` | 01 日本地図 | 左に地図、右に「地方を選んでください」 | Main / DeskMain |
| `/regions/$region` | 02 県のタイル地図 | 地図で地方を選択済み、右パネルに県ごとの会場一覧 | Region / DeskMain |
| `/prefectures/$pref` | 03 会場一覧 | `/regions/$region` と同じ画面で、その県の見出しまでスクロール | Prefecture / DeskMain |
| `/venues/$venue?mode=all\|fav` | 04 ライブ一覧（縦1列） | 左に会場情報と同じ県のほかの会場、右にカードを複数列 | Venue / DeskVenue |
| `/favorites` | 05 お気に入り | 中央寄せ | Favorites |
| `/account` | 06 アカウント・設定 | 中央寄せ（最大 880px）・2列のカード | Account / DeskAccount |
| `/about/data`, `/terms`, `/privacy` | 取得方法・利用規約・プライバシーポリシー | 同左 | なし（アカウント画面と同じ部品で作る） |
| `/admin` | 運営者用の状態一覧（Cloudflare Access で保護） | 同左 | なし |

- PC で地方を選んだときも URL を `/regions/$region` に変えるので、戻る操作や共有がスマホと同じに動く（画面全体は再描画しない）。
- 表示切替「すべて／お気に入りが来るか」は検索パラメータ `mode` に持つ。
- データの読み込みはルートの loader から TanStack Start のサーバー関数を呼ぶ。地図・会場一覧はサーバー側で描画するので即時に表示される。

### 日本地図（タイル配置）

- モックアップのとおり、地方・県を**角丸の長方形タイルを絶対配置**して表現する。座標は `src/lib/map-layout.ts` に、モックアップの値（スマホ 330×360、PC 462×504）をそのまま定数で持つ。
- 九州の県配置はモックアップにある。**関西の県配置はモックアップにないので、同じ様式で新しく作る**（大阪府のみ色付き、ほかは「準備中」）。
- 色付きタイル（会場あり）は `<Link>`、準備中は `<div aria-disabled>`。タイルには県名と会場数を表示し、キーボードでも選べるようにする。会場数は DB から集計する。
- GeoJSON を使わないので、外部データのライセンス確認は不要（要件定義書 11章の未決事項はこれで解決）。

### テーマ（ダークが初期値）

- localStorage `lmc:theme` = `system` / `light` / `dark`。**未設定なら `dark`**。
- `<head>` に小さなインラインスクリプトを置き、描画前に `<html class="dark">` を付ける（白い画面が一瞬出るのを防ぐ）。`system` のときは `matchMedia('(prefers-color-scheme: dark)')` の変化に追従する。
- Tailwind v4 の `@custom-variant dark` でクラス方式にする。色はモックアップから CSS 変数（`--bg`, `--fg`, `--muted`, `--glass`, `--glass-border`, `--accent`(#39EAC3), `--main`(#00C8BD), `--ai`(#8B7BD8) など）として `src/styles/app.css` の `@theme` に定義する。ライトモードの背景はモックアップの `#F6F3E8`（要件定義書の `#EAE7D6` 付近より、確定版のモックアップを優先）。
- ガラス表現（半透明＋`backdrop-blur`＋薄い白の縁取り）は `glass` / `glass-strong` というユーティリティにまとめる。角丸はヘッダー18px、カード16〜20px、ボタン10〜12px、バッジ8px。
- フォントは Google Fonts の M PLUS Rounded 1c（見出し）と Noto Sans JP（本文）。

### 下部ナビ（スマホ）

`src/components/nav/TabBar.tsx` は、モックアップ `TabBar.dc.html` の動きを React に移植する。

- タップ: 通常のリンクとして移動する（`<Link>`、`aria-current="page"`）。
- 長押し（250ms）: インジケーターが少し浮き上がる（`scale(1.1)`、影を強くする）。指に合わせて左右に動き（`touch-action: none`、Pointer Events）、指を離すと一番近いタブに吸い付いて、そのタブへ移動する。
- 移動のアニメーション: `transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2)`（少し弾む）。`prefers-reduced-motion` のときは弾みを無くす。
- 画面下に固定し、`env(safe-area-inset-bottom)` の余白を取る。長押しで出る標準メニューは `contextmenu` を止めて出さない。

### 左ナビ（PC）

`SideNav.tsx` はモックアップ `SideNav.dc.html` のとおり。幅88pxの縦型ガラスで、ホバーするとインジケーターが移動し、離れると現在のタブに戻る。キーボードのフォーカスでも同じように動く。

### そのほかの画面要素

- ヘッダー: 戻るボタンとパンくずリストのみ。パンくずは `text-overflow: ellipsis` で省略する。
- 公演カード: 日付ボックス、アーティスト、ツアー名、開場／開演、「詳細 ↗」。AI 取得分は紫系の枠と「🔍 AIによる検索」バッジ、出典リンクを付ける。お気に入りに一致したら「お気に入り」バッジを付ける。リンク部分は `EventLinks` という部品に分け、v2 でアフィリエイトリンクを差し込めるようにする。
- 出現アニメ: `IntersectionObserver` と CSS の transition で、カードを下からふわっと出す（GSAP は使わず軽くする）。`prefers-reduced-motion` のときは無効にする。
- UI 部品は shadcn/ui を土台にし、見た目はモックアップに合わせて上書きする（Button、Toggle Group、Switch、Skeleton、Sonner(トースト) など）。

---

## 7. お気に入り

### 保存（v1: ブラウザ）

- localStorage のキー `lmc:favorites`、値は `{ version: 1, items: [{ id: uuid, name: "元の表記", norm: "正規化", addedAt: ISO }] }`。
- `FavoritesStore` インターフェースを作り、v1 は `LocalFavoritesStore`、v2 は `AccountFavoritesStore`（API 経由）に差し替える。画面側は `useFavorites()` フックだけを使う。
- 読み書きは try/catch で囲む（プライベートブラウズなどで失敗しても画面は動く）。`storage` イベントでほかのタブと同期する。
- 保存前に同じ `norm` があれば追加しない（「すでに登録済みです」）。

### 表記ゆれの正規化（`src/shared/normalize.ts`、サーバーとブラウザで共通）

1. Unicode NFKC（全角英数→半角、半角カナ→全角）
2. 小文字化
3. ひらがな → カタカナ
4. 長音の表記をそろえる（`ｰ`、`－`、`—`、`〜` → `ー`）
5. 空白と記号（`・`、`.`、`!`、`?`、`'`、`"`、`&`、`-`、`_`、`/`、`×` など）を除去
6. 略称の対応表（`artist-aliases.ts`。例: 「ミセス」→「mrsgreenapple」）。v1 は少数から始め、v2 で DB に移す。

照合: 公演のアーティスト欄を区切り（`/`、`×`、`、`、`with`）で分けて正規化し、お気に入りの `norm` と**完全一致**するか、またはお気に入りの `norm` が3文字以上でタイトルの正規化文字列に含まれていれば一致とする。サーバーは保存時に `artist_norm` を計算しておく。

### v2 でアカウントへ引き継ぐ設計

- 各項目に安定した `id`（UUID）と `addedAt` を持たせておく。
- v2 でログインしたとき、ブラウザの一覧をサーバーへ送り、`norm` で重複を除いて統合する（サーバーで再計算した `norm` を正とする）。成功したら localStorage に `migratedAt` を書き、二度送らない。
- 正規化関数は共通モジュールなので、v2 でもサーバーとブラウザで同じ結果になる。

---

## 8. テストと品質

### 単体テスト（Vitest）

| 対象 | 内容 |
|---|---|
| `normalize` / 照合 | 全角半角、ひらがなカタカナ、記号、略称、区切り文字の分割（表形式のテストケースを多めに） |
| ライブ判定ルール | 実在のタイトル例（学会・展示会・野球・ライブ）で、除外とライブの判定 |
| 取得ルール | 会場ページの HTML を `tests/fixtures/<venue>/` に保存し、抽出結果をスナップショットで比較 |
| 出典の検証 | 日付表記の全パターン、名前が見つからない例、年のない例、SSRF にあたる URL の拒否 |
| 予算 | 日次上限の境界（ちょうど・超過）、JST の日付の切り替わり |
| テーマ・お気に入りの保存 | localStorage が使えないときにも例外を出さない |

### 結合テスト（Vitest + `@cloudflare/vitest-plugin`）

本物に近い D1（ローカル）で、Cron の1回分の処理（取得→判定→保存→ログ）、AI 検索の流れ（mock 提供元でキャッシュ・二重起動防止・予算超過）、会場一覧の集計を確認する。

### E2E（Playwright。スマホ幅 390px と PC 幅 1440px の2種類）

1. 地図 → 地方 → 県 → 会場 と進み、パンくずと戻るボタンが正しい
2. PC で地方を選ぶと、画面遷移せず右に会場一覧が出る
3. 会場で「すべて／お気に入りが来るか」を切り替える
4. お気に入りを追加（表記ゆれのある名前で）→ 会場で一致が表示される → 再読み込みしても残る
5. 初回はダークモード。アカウント画面でライトに変えると、再読み込みしても保たれる
6. 下部ナビのタップと、長押しスライドでの移動
7. AI のみの会場で、ローディングの後に「AIによる検索」ラベルと出典リンクが出る（mock）
8. アクセシビリティの自動チェック（axe）で重大な違反がない

E2E はローカルのシード済み D1 と `AI_PROVIDER=mock` で動かす。実際の会場サイトや Claude API には接続しない。

### `/code-review` と `/security-review` を使うタイミング

| タイミング | 使うもの |
|---|---|
| すべての PR を出す前 | `/code-review`（通常は medium。スクレイピングと AI の PR は high） |
| 外部への通信・入力を扱う PR（取得の仕組み、AI 検索と出典検証、管理ページ、CI/シークレット） | `/security-review` も実行する。重点: 出典URL取得の SSRF、取得した Web ページの文章による AI への指示の書き換え（プロンプトインジェクション）、管理ページの認証、キーの漏えい |
| 公開前の仕上げ PR | リポジトリ全体に `/security-review` と `/code-review --max-findings all` |

---

## 9. CI/CD とデプロイ

### 環境

| 環境 | Worker | D1 | AI | Cron |
|---|---|---|---|---|
| ローカル | `vite dev` | ローカル D1（シード済み） | mock（`.dev.vars` で切替可） | 取得は `node scripts/scrape.mjs staging` で staging の D1 に向けて手動 |
| PR プレビュー | `live-map-checker-staging` のバージョン（`pr-<番号>` の別名URL） | `lmc-staging`（全PRで共有） | mock | なし |
| 本番 | `live-map-checker`（`*.workers.dev`） | `lmc-prod` | anthropic | なし（会場サイトの取得は GitHub Actions が6時間ごと） |

### GitHub Actions

1. **`ci.yml`**（PR と main への push）: `pnpm install --frozen-lockfile` → `biome ci` → `tsc --noEmit` → `vitest run`（単体＋結合）→ `vite build` → Playwright（ローカル D1 にマイグレーションとシードを入れて、`AI_PROVIDER=mock` で起動）。失敗時は Playwright のレポートを成果物として保存。
2. **`preview.yml`**（PR の作成・更新時。CI が通った後）: `wrangler d1 migrations apply lmc-staging --env staging --remote` → `CLOUDFLARE_ENV=staging pnpm build` → `wrangler versions upload --env staging --preview-alias pr-<番号>` → 発行された URL を PR にコメント。`cloudflare/wrangler-action@v4` を使う。
   - Cloudflare が 2026-09 に出した新機能「Worker Previews」（`wrangler preview`）も候補だが、出たばかりで設定例が少ない。そのため、実績のあるバージョンの別名URLで始める。
3. **`deploy.yml`**（main への push。CI が通った後）: `wrangler d1 migrations apply lmc-prod --remote` → `pnpm build` → `wrangler deploy`。GitHub の Environment `production` を使い、シークレットをここに限定する。
4. **マイグレーションの安全策**: 列の削除・型変更は「追加 → 移行 → 削除」の2回の PR に分ける（新旧のコードが同じ DB を使っても壊れないように）。D1 の Time Travel（無料で7日分）で戻せることを手順書に書く。
5. 依存関係の更新は Dependabot（週1回、まとめて1つの PR）。

### シークレットの管理

| 名前 | 置き場所 | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Environment（production / preview） | デプロイ。権限は Workers の編集と D1 の編集だけ |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | 同上 |
| `ANTHROPIC_API_KEY` | `wrangler secret put ANTHROPIC_API_KEY`（**本番 Worker のみ**） | AI 検索 |
| ローカル用のキー | `.dev.vars`（`.gitignore` 済み）。見本は `.dev.vars.example` | 開発 |

- `wrangler.jsonc` の `secrets.required` に `ANTHROPIC_API_KEY` を書き、本番でキーが無いとデプロイに失敗するようにする。
- GitHub の Secret scanning と Push protection を有効にする。
- 管理ページは Cloudflare Access（Zero Trust の無料枠）で保護し、アプリ側でも `Cf-Access-Jwt-Assertion` ヘッダーの JWT を検証する（二重の確認）。

---

## 10. スケジュール（1機能 = 1ブランチ = 1PR）

ブランチ名は `feat/<機能>`・`chore/<作業>`、コミットは Conventional Commits（日本語可）。各 PR は「CI が通る」「`/code-review` 済み」「プレビュー環境で確認済み」でマージする。

| # | 期間 | ブランチ | 内容 | 完了の条件 |
|---|---|---|---|---|
| 1 | 10/26–10/28 | `chore/scaffold` | プロジェクト作成、Biome、Hooks、CLAUDE.md、Tailwind/shadcn、デザイントークン、CI、staging・本番への最初のデプロイ、PRプレビュー | workers.dev で空の画面が開き、PR にプレビューURLが付く。**CPU 時間の実測結果を報告**（下記） |
| 2 | 10/29–10/31 | `feat/db-schema-seed` | Drizzle スキーマ、マイグレーション、10会場のシード、規約確認記録、データ取得用の関数 | ローカル・staging に10会場が入る |
| 3 | 11/1–11/4 | `feat/app-shell` | 共通レイアウト、ヘッダーとパンくず、下部ナビ（長押しスライド）、左ナビ、テーマの仕組み（ダーク初期値） | 3タブを行き来でき、ダークで表示される |
| 4 | 11/4–11/7 | `feat/map-navigation` | タイル地図、地方・県・会場一覧、PC の地図＋右パネル | 01〜03 がモックアップどおり |
| 5 | 11/8–11/10 | `feat/venue-page` | 会場画面（スマホ1列・PC複数列）、公演カード、表示切替の枠 | DB の公演が日付順に表示される |
| 6 | 11/10–11/13 | `feat/scraper-zepp` | 取得の仕組み（fetcher、robots、Cron、取得ログ、失敗の検知）と Zepp 3会場 | Cron で Zepp の公演が入り、失敗が記録される |
| 7 | 11/13–11/15 | `feat/scraper-kumamoto-classify` | 熊本城ホールの取得ルール、ライブ判定ルール | 学会などが一覧から消える |
| 8 | 11/16–11/20 | `feat/ai-search` | AI 提供元の抽象化、Claude 実装、mock、24時間キャッシュ、出典検証、予算、ローディング表示、モデル比較の実測 | AI のみの会場に検証済みの公演が出る。2回目は即時に表示される。モデル確定と日次上限の見直し |
| 9 | 11/20–11/21 | `feat/ai-classify` | `unknown` のAI分類とキャッシュ | 判定できなかったタイトルが分類される |
| 10 | 11/21–11/24 | `feat/favorites` | お気に入り画面、正規化、照合、「お気に入りが来るか」表示 | E2E 4 が通る |
| 11 | 11/24–11/25 | `feat/account-pages` | アカウント画面、テーマ選択、取得方法・規約・プライバシー、Microsoft Forms へのリンク | 06 がモックアップどおり |
| 12 | 11/25–11/26 | `feat/admin` | 管理ページ（取得状況・AI使用額・手動再取得）と Cloudflare Access | 失敗した会場が一目で分かる |
| 13 | 11/26–11/28 | `chore/release-polish` | 出現アニメ、アクセシビリティ、表示速度、全体の `/security-review`、本番データの初回取得 | 全E2E通過、公開判断 |
| — | 11/29–11/30 | — | 予備日・**v1 公開** | |

### PR 1 での CPU 時間の実測

PR 1 の時点では本物の画面や取得処理がまだないため、重くなりそうな処理の「代表」を用意して測る。

| 測るもの | 方法 |
|---|---|
| 画面のサーバー描画（SSR） | モックアップ 04（会場、公演30件のダミー）相当のページを1つ仮に作り、staging に置いて100回アクセスする |
| Cron の取得処理 | Zepp のスケジュールページ1か月分の HTML を fixture として保存し、HTMLRewriter で抽出する仮の `scheduled` を staging で10回動かす |
| AI 出典の検証 | 1ページ分の HTML から本文を取り出して正規化・照合する処理を、同じく10回動かす |

- 計測は Workers Observability（Workers Logs の `cpuTime`）で、中央値と最大値を見る。
- 判断（当初）: どれかの最大値が 8ms を超えたら有料プランに切り替える予定だったが、**有料にはしないと決めた**（2026-10-26）。超えた処理は 10.5 の工夫で収める。
- 仮のページと仮の処理は、計測が終わったら PR 1 から取り除く。

v1.1 以降（公開後）: マリンメッセ福岡・福岡国際センターの取得ルール（規約確認後）、会場から承諾を得た場合の取得ルール追加、Context7 での依存ライブラリ更新。

### 実装と並行して、あなたにお願いしたいこと

| 時期 | 作業 |
|---|---|
| 10/26 まで | Cloudflare アカウント、GitHub リポジトリの作成。Cloudflare API トークンとアカウントIDを GitHub Secrets に登録（手順は PR 1 で案内） |
| 11/7 まで | マリンメッセ（福岡コンベンションセンター）の規約の確認、PayPayドーム・大阪城ホールへの問い合わせ（任意） |
| 11/15 まで | Anthropic の API キーの発行と月額上限の設定、`wrangler secret put` での登録 |
| 11/24 まで | Microsoft Forms の作成、利用規約・プライバシーポリシーの文面の確認（下書きはこちらで作ります） |

---

## 10.5 CPU 10ms に収める工夫（無料プランを続けるため）

| 処理 | 工夫 |
|---|---|
| 画面の描画（SSR） | 地図・会場ページの表示結果を **Cache API**（無料）に数分間保存し、同じページは描画せずに返す。お気に入りの照合はブラウザで行うので、キャッシュしても利用者ごとに違う内容にはならない。地方ごとの会場数はルートの loader で読み、10分間使い回す |
| 会場サイトの取得 | Cloudflare では行わず、GitHub Actions の中の wrangler dev（CPU の制限なし）で行う（3.2） |
| 出典検証（AI 検索） | URL 1件ごとに別の呼び出しに分け、本文は軽い文字列処理で照合する（4.3） |
| AI の呼び出し | 応答を待つ時間は CPU 時間に入らない。JSON の解析は小さいので問題ない |
| 確認方法 | `scripts/measure-cpu.mjs` で staging の CPU 時間を測る（Workers Logs の `cpuTime`）。重い処理を入れる PR（5・6・8）で毎回測り、最大値が 10ms を超えたら直してからマージする |
| それでも収まらない場合 | ほかのバッチ処理も同じ方法（GitHub Actions ＋ remote bindings）で Cloudflare の外に出す |

## 11. 動作確認（v1 全体の検証方法）

1. `pnpm check && pnpm test && pnpm test:e2e` がローカルと CI で通る。
2. `node scripts/scrape.mjs staging` を実行し、Zepp 3会場と熊本城ホールの公演が staging の `events` に入り、`fetch_runs` に成功が記録される。取得ルールの対象 URL をわざと 404 にすると `failed(http)` が記録され、会場画面が AI 補完に切り替わる。
3. staging（PR プレビュー）で、スマホ実機（iPhone／Android）と PC ブラウザで、モックアップ12画面と見比べる（ダーク・ライト両方）。
4. 本番で AI のみの会場を1つ開き、ローディング → 検証済み公演と出典リンクの表示を確認する。もう一度開くと即時に表示される（キャッシュ）。`ai_searches` の費用が記録され、管理ページの当日使用額に反映される。
5. `AI_DAILY_BUDGET_USD` を一時的に 0 にすると AI 検索が止まり、「利用できません」の表示になる。
6. 公開前に `/security-review` を全体にかけ、指摘ゼロ、または対応方針が決まっている状態にする。

---

## 承認後の最初の作業

1. この計画を `docs/plan.md` として保存する。
2. PR 1（`chore/scaffold`）を始める。Context7 を `/mcp` で認可し直して、作成コマンドと設定を再確認してから実行する。
