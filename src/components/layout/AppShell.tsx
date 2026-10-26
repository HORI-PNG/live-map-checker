// 全画面の共通レイアウト。スマホ（〜1023px）は下部ナビ、PC（1024px〜）は左ナビ

import { useEffect } from 'react'
import { SideNav } from '@/components/nav/SideNav'
import { TabBar } from '@/components/nav/TabBar'
import { useFollowSystemTheme } from '@/lib/theme'

export function AppShell({ children }: { children: React.ReactNode }) {
  useFollowSystemTheme()
  // 操作できる状態になった印（E2E テストはこれを待ってから操作する）
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])
  return (
    <div className="min-h-dvh lg:flex lg:items-start lg:gap-6 lg:p-6">
      <div className="hidden lg:sticky lg:top-6 lg:block">
        <SideNav />
      </div>
      {/* スマホは下部ナビ（高さ 64px＋上下の余白）の分だけ下を空ける */}
      <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col pb-[calc(96px+env(safe-area-inset-bottom))] lg:mx-0 lg:min-h-0 lg:max-w-none lg:min-w-0 lg:flex-1 lg:pb-0">
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[640px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] lg:hidden">
        <TabBar />
      </div>
    </div>
  )
}
