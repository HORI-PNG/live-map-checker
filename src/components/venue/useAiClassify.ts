// ルールで決まらなかったタイトルの AI によるライブ判定を、会場を開いたときに始める（docs/plan.md 5章）。
// 表示は変えずに裏で行い、判定が変わったとき・ほかの人の判定を待ち終えたときだけ画面のデータを読み直す
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { classifyVenueWithAi } from '@/server/functions/ai'

/** ほかの人が判定中のとき、終わったかを確かめる間隔と回数（最大 約1分） */
const POLL_MS = 2_000
const MAX_POLLS = 30

export function useAiClassify(slug: string, pending: boolean) {
  const router = useRouter()
  const classify = useServerFn(classifyVenueWithAi)
  useEffect(() => {
    if (!pending) return
    let cancelled = false
    const run = async () => {
      let waited = false
      for (let i = 0; i < MAX_POLLS; i++) {
        const result = await classify({ data: { slug } }).catch(() => null)
        if (cancelled || !result) return
        if (result.status === 'classified') {
          if (result.changed > 0) await router.invalidate()
          return
        }
        if (result.status !== 'running') {
          if (waited) await router.invalidate()
          return
        }
        waited = true
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        if (cancelled) return
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pending, slug, classify, router])
}
