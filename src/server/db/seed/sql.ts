// シードデータを冪等な SQL（INSERT ... ON CONFLICT DO UPDATE）に変換する。
// Node から直接実行するスクリプト（scripts/seed.ts）でも使うので、拡張子付きで import する。
import { PREFECTURES, REGIONS, VENUE_POLICIES, VENUES } from './data.ts'

function q(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

function upsert(table: string, row: Record<string, string>, conflict: string): string {
  const cols = Object.keys(row)
  const updates = cols.filter((c) => !conflict.split(',').includes(c)).map((c) => `${c} = excluded.${c}`)
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${Object.values(row).join(', ')}) ON CONFLICT(${conflict}) DO UPDATE SET ${updates.join(', ')};`
}

export function buildSeedSql(): string {
  const lines: string[] = []

  REGIONS.forEach((r, i) => {
    lines.push(
      upsert(
        'regions',
        { slug: q(r.slug), name: q(r.name), display_name: q(r.displayName), sort_order: q(i + 1) },
        'slug',
      ),
    )
  })

  PREFECTURES.forEach((p, i) => {
    lines.push(
      upsert(
        'prefectures',
        {
          region_id: `(SELECT id FROM regions WHERE slug = ${q(p.region)})`,
          slug: q(p.slug),
          name: q(p.name),
          short_name: q(p.shortName),
          sort_order: q(i + 1),
        },
        'slug',
      ),
    )
  })

  const orderInPrefecture = new Map<string, number>()
  for (const v of VENUES) {
    const order = (orderInPrefecture.get(v.prefecture) ?? 0) + 1
    orderInPrefecture.set(v.prefecture, order)
    lines.push(
      upsert(
        'venues',
        {
          prefecture_id: `(SELECT id FROM prefectures WHERE slug = ${q(v.prefecture)})`,
          slug: q(v.slug),
          name: q(v.name),
          area: q(v.area),
          official_url: q(v.officialUrl),
          schedule_url: q(v.scheduleUrl),
          fetch_mode: q(v.fetchMode),
          scraper_key: q(v.scraperKey),
          scraper_config: q(v.scraperConfig ? JSON.stringify(v.scraperConfig) : null),
          venue_kind: q(v.venueKind),
          sort_order: q(order),
          is_active: q(true),
        },
        'slug',
      ),
    )
  }

  for (const p of VENUE_POLICIES) {
    lines.push(
      upsert(
        'venue_policies',
        {
          venue_id: `(SELECT id FROM venues WHERE slug = ${q(p.venue)})`,
          robots_url: q(p.robotsUrl),
          robots_result: q(p.robotsResult),
          terms_url: q(p.termsUrl),
          terms_verdict: q(p.termsVerdict),
          terms_quote: q(p.termsQuote),
          checked_at: q(p.checkedAt),
          checked_by: q(p.checkedBy),
          note: q(p.note),
        },
        'venue_id,checked_at',
      ),
    )
  }

  return `${lines.join('\n')}\n`
}
