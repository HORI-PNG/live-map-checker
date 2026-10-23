import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
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
})

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
