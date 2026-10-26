import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { fetchVenue } from '@/server/functions/geo'

export const Route = createFileRoute('/venues/$venue')({
  loader: ({ params }) => fetchVenue({ data: { slug: params.venue } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.venue.name}のライブ | Live Map Checker` : 'Live Map Checker' }],
  }),
  component: VenuePage,
})

// ライブ一覧・表示切り替え・PC の2列レイアウトは feat/venue-page で実装する
function VenuePage() {
  const { region, prefecture, venue, otherVenues } = Route.useLoaderData()
  return (
    <>
      <PageHeader
        back={{ to: `/prefectures/${prefecture.slug}`, label: `${prefecture.name}の会場一覧に戻る` }}
        crumbs={[
          { label: '日本地図', to: '/' },
          { label: region.name, to: `/regions/${region.slug}` },
          { label: prefecture.name, to: `/prefectures/${prefecture.slug}` },
          { label: venue.name },
        ]}
      />
      <section className="flex flex-col gap-1.5 px-6 pt-[22px] pb-3.5 lg:px-2">
        <span className="kicker">04 — ライブを見る</span>
        <h1 className="m-0 text-[28px] leading-snug font-extrabold">{venue.name}</h1>
        <p className="m-0 text-[13px] text-fg-muted">
          {venue.area} ·{' '}
          <a href={venue.officialUrl} target="_blank" rel="noopener noreferrer">
            会場の公式サイト
          </a>
        </p>
      </section>
      <p className="mx-6 text-sm text-fg-muted lg:mx-2">ライブ情報は準備中です。</p>
      {otherVenues.length > 0 && (
        <nav aria-label={`${prefecture.name}のほかの会場`} className="mx-6 mt-4 flex flex-col gap-1 lg:mx-2">
          <h2 className="m-0 text-[13px] font-bold text-fg-muted">{prefecture.name}のほかの会場</h2>
          {otherVenues.map((v) => (
            <Link key={v.slug} to="/venues/$venue" params={{ venue: v.slug }} className="text-sm">
              {v.name}
            </Link>
          ))}
        </nav>
      )}
    </>
  )
}
