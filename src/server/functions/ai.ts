// 会場画面から呼ぶ AI 検索（docs/plan.md 4.2）。利用者が会場を開いたときだけ呼ばれる（取得の処理では呼ばない）

import { env, exports, waitUntil } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getAiProvider } from '../ai/provider'
import { runVenueAiSearch } from '../ai/search'
import { purgePages } from '../cache'
import { getDb } from '../db/client'

const input = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,64}$/) })

export const searchVenueWithAi = createServerFn({ method: 'POST' })
  .validator(input)
  .handler(async ({ data }) => {
    const search = runVenueAiSearch(getDb(), env.DB, data.slug, {
      provider: () => getAiProvider(env as Env & { ANTHROPIC_API_KEY?: string }),
      // 出典は URL 1件ごとに別の呼び出しで確かめる（それぞれが CPU 時間の枠を別に使える）
      verify: (url, items) => exports.SourceVerifier.verify(url, items),
      budgetMicros: Math.round(Number(env.AI_DAILY_BUDGET_USD) * 1_000_000) || 0,
    })
    // 利用者が途中で画面を閉じても、結果と費用の記録までできるだけ続ける（打ち切られても見積もり額は記録済み）
    waitUntil(search.catch(() => {}))
    const outcome = await search
    // 新しい結果が入ったら、この拠点に保存した会場ページの HTML を消す（次に開いた人にすぐ見えるように）
    if (outcome.status === 'searched') await purgePages(`/venues/${data.slug}`, env.CF_VERSION_METADATA.id)
    return outcome
  })
