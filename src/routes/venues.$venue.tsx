import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChevronRightIcon } from '@/components/nav/icons'
import { AiSearchStatus, useAiSearch } from '@/components/venue/AiSearchStatus'
import { EventList } from '@/components/venue/EventList'
import { ModeToggle } from '@/components/venue/ModeToggle'
import { fetchVenue } from '@/server/functions/geo'

const searchSchema = z.object({ mode: z.enum(['all', 'fav']).optional().catch(undefined) })

export const Route = createFileRoute('/venues/$venue')({
  validateSearch: searchSchema,
  loader: ({ params }) => fetchVenue({ data: { slug: params.venue } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.venue.name}のライブ | Live Map Checker` : 'Live Map Checker' }],
  }),
  component: VenuePage,
})

// 会場画面（Venue.dc.html / DeskVenue.dc.html）。スマホは縦1列、PC は左に会場情報、右にカードを複数列
function VenuePage() {
  const { region, prefecture, venue, otherVenues, events, ai } = Route.useLoaderData()
  const mode = Route.useSearch().mode ?? 'all'
  const { searching, failed } = useAiSearch(venue.slug, ai)
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
      <div className="flex flex-col lg:mt-5 lg:flex-row lg:flex-wrap lg:items-start lg:gap-5">
        <aside className="flex min-w-0 flex-col gap-4 lg:flex-[1_1_300px]">
          <section className="flex flex-col gap-1.5 px-6 pt-[22px] pb-3.5 lg:glass lg:gap-2.5 lg:rounded-panel lg:p-[22px]">
            <span className="kicker lg:text-[13px]">04 — ライブを見る</span>
            <h1 className="m-0 text-[28px] leading-snug font-extrabold lg:text-[32px] lg:leading-tight">
              {venue.name}
            </h1>
            <p className="m-0 text-[13px] text-fg-muted lg:text-sm">
              {venue.area}
              <span className="lg:hidden">
                {' · '}
                <a href={venue.officialUrl} target="_blank" rel="noopener noreferrer">
                  会場の公式サイト
                </a>
              </span>
            </p>
            <a
              href={venue.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 hidden h-11 items-center justify-center gap-1.5 rounded-button border border-[var(--glass-border-strong)] bg-[var(--glass-strong)] text-sm font-bold text-foreground no-underline hover:text-foreground lg:flex"
            >
              会場の公式サイト ↗
            </a>
          </section>
          {otherVenues.length > 0 && (
            <nav
              aria-label={`${prefecture.name}のほかの会場`}
              className="glass hidden flex-col gap-1.5 rounded-panel p-4 lg:flex"
            >
              <h2 className="mx-1.5 mt-0 mb-1.5 text-[13px] font-bold text-fg-muted">{prefecture.name}のほかの会場</h2>
              {otherVenues.map((v) => (
                <Link
                  key={v.slug}
                  to="/venues/$venue"
                  params={{ venue: v.slug }}
                  className="flex h-11 items-center justify-between rounded-md px-2.5 text-sm text-foreground no-underline hover:bg-[var(--glass-strong)] hover:text-foreground"
                >
                  {v.name}
                  <ChevronRightIcon size={14} />
                </Link>
              ))}
            </nav>
          )}
        </aside>
        <section aria-label="ライブ一覧" className="flex min-w-0 flex-col gap-3.5 lg:flex-[3_1_560px]">
          <div className="mx-4 flex flex-col gap-3 lg:mx-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
            <ModeToggle mode={mode} className="lg:w-[420px] lg:max-w-full" />
            <p className="mx-2 my-0 text-xs leading-relaxed text-fg-muted lg:mx-0">
              学会・展示会・スポーツなどは除いて表示しています。
              <span className="lg:hidden">
                会場サイトから取得できなかった公演は、AI が検索して「AIによる検索」の印を付けています。
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-3.5 px-4 pb-6 lg:px-0">
            {mode === 'all' ? (
              <>
                <AiSearchStatus ai={ai} searching={searching} failed={failed} />
                {events.length > 0 ? <EventList events={events} /> : !searching && <EmptyState />}
              </>
            ) : (
              <FavoritesPlaceholder />
            )}
          </div>
        </section>
      </div>
    </>
  )
}

function EmptyState() {
  return (
    <p className="glass m-0 rounded-card p-6 text-center text-sm leading-relaxed text-fg-muted">
      これから半年のライブは、まだ見つかっていません。
    </p>
  )
}

// お気に入りとの照合は feat/favorites で実装する
function FavoritesPlaceholder() {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="glass m-0 w-full rounded-card p-6 text-center text-sm leading-relaxed text-fg-muted">
        お気に入りのアーティストを登録すると、この会場に来るかを確認できます。
      </p>
      <Link
        to="/favorites"
        className="flex h-11 items-center rounded-button border border-[var(--glass-border-strong)] bg-[var(--glass-strong)] px-5 text-[13px] font-bold text-foreground no-underline hover:text-foreground"
      >
        お気に入りを登録する
      </Link>
    </div>
  )
}
