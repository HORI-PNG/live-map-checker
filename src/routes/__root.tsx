import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Live Map Checker' },
      { name: 'description', content: '行ける場所から、ライブを探そう。会場からライブを探せる地図アプリ。' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <>
      <PageHeader
        back={{ to: '/', label: '日本地図に戻る' }}
        crumbs={[{ label: '日本地図', to: '/' }, { label: 'ページが見つかりません' }]}
      />
      <section className="flex flex-col gap-3 px-6 pt-7">
        <span className="kicker">404</span>
        <h1 className="m-0 text-2xl font-extrabold">ページが見つかりません</h1>
        <p className="m-0 text-sm text-fg-muted">
          URL が変わったか、会場の登録が終わった可能性があります。<Link to="/">日本地図から探す</Link>
        </p>
      </section>
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // 初期値はダーク。保存済みの設定は THEME_INIT_SCRIPT が描画前に反映する
    <html lang="ja" className="dark" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 描画前にテーマを決める固定のスクリプト */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
