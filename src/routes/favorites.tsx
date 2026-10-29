import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/PageHeader'

export const Route = createFileRoute('/favorites')({
  head: () => ({ meta: [{ title: 'お気に入り | Live Map Checker' }] }),
  component: Favorites,
})

// お気に入りの登録・削除は feat/favorites で実装する
function Favorites() {
  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-[880px]">
      <PageHeader back={{ to: '/', label: '日本地図に戻る' }} crumbs={[{ label: 'お気に入り' }]} />
      <section className="flex flex-col gap-2 px-6 pt-6 pb-4 lg:px-2">
        <span className="kicker">05 — お気に入り</span>
        <h1 className="m-0 text-[28px] leading-snug font-extrabold">お気に入りアーティスト</h1>
        <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
          このブラウザに保存されます。ログイン機能の追加後は、アカウントに引き継げます。
        </p>
      </section>
    </div>
  )
}
