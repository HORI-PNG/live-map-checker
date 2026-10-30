// AI 検索の状態の表示（docs/plan.md 4.2）。24時間以内の結果が無ければ、開いたときに AI 検索を始めて、
// 終わったら画面のデータを読み直す。検索中・失敗・予算超過・最終確認の日時を出す
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import type { AiView } from '@/server/ai/state'
import { searchVenueWithAi } from '@/server/functions/ai'

/** 別の人が検索中のとき、終わったかを確かめる間隔と回数（最大 約5分。state.ts の RUNNING_TIMEOUT_MS） */
const POLL_MS = 2_000
const MAX_POLLS = 150

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * AI 検索を始めて、終わったら画面のデータを読み直す。searching: 検索中の表示を出すか。
 * 通信に失敗した・待ちきれなかったときは failed にして、検索中の表示を止める
 */
export function useAiSearch(slug: string, ai: AiView) {
  const router = useRouter()
  const search = useServerFn(searchVenueWithAi)
  // 失敗は会場ごと（同じ画面のまま別の会場へ移ったときに持ち越さない）
  const [failedSlug, setFailedSlug] = useState<string | null>(null)
  const failed = failedSlug === slug
  const pending = ai.needed && (ai.status === 'due' || ai.status === 'running')

  useEffect(() => {
    if (!pending) return
    let cancelled = false
    const run = async () => {
      let done = false
      for (let i = 0; i < MAX_POLLS && !done; i++) {
        const result = await search({ data: { slug } }).catch(() => null)
        if (cancelled) return
        if (!result) break
        if (result.status !== 'running') done = true
        else await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        if (cancelled) return
      }
      if (!done) setFailedSlug(slug)
      await router.invalidate()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pending, slug, search, router])

  return { searching: pending && !failed, failed: pending && failed }
}

export function AiSearchStatus({ ai, searching, failed }: { ai: AiView; searching: boolean; failed: boolean }) {
  if (!ai.needed) return null
  if (failed) {
    return (
      <p role="status" className="glass m-0 rounded-card p-4 text-sm leading-relaxed text-fg-muted">
        AI による検索に失敗しました。時間をおいて開き直してください。
      </p>
    )
  }
  if (searching) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-card border border-[var(--ai-border)] bg-[var(--ai-bg)] p-4 text-sm leading-relaxed"
      >
        <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full bg-brand-ai" />
        <span>
          <strong className="font-bold">AI で公演を検索しています…</strong>
          <br />
          <span className="text-xs text-fg-muted">
            会場サイトから取得できない公演を、AI が Web 検索で探しています（10〜30秒かかることがあります）。
          </span>
        </span>
      </div>
    )
  }
  if (ai.status === 'unavailable') {
    return (
      <p role="status" className="glass m-0 rounded-card p-4 text-sm leading-relaxed text-fg-muted">
        {ai.reason === 'budget'
          ? '本日の AI 検索の上限に達したため、AI による検索はお休みしています。'
          : '現在、AI による検索を利用できません。'}
        {ai.checkedAt && <>前回の検索結果（最終確認: {formatCheckedAt(ai.checkedAt)}）を表示しています。</>}
      </p>
    )
  }
  return ai.checkedAt ? (
    <p className="m-0 px-2 text-xs text-fg-muted">AI による検索の最終確認: {formatCheckedAt(ai.checkedAt)}</p>
  ) : null
}
