// 出典の検証を、URL 1件ごとに別の呼び出しで行うための入口（docs/plan.md 4.3）。
// 呼び出しごとに CPU 時間の枠（無料プランは 10ms）を別に使えるので、大きなページが続いても上限を超えにくい。
// 呼び出し元は ctx.exports（同じ Worker・同じバージョンへの内部の呼び出し。インターネットからは呼べない）
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createMockProvider } from './mock'
import { type SourceCheck, type SourceItem, verifySource } from './verify'

export class SourceVerifier extends WorkerEntrypoint<Env> {
  async verify(url: string, items: SourceItem[]): Promise<SourceCheck> {
    // mock のときは本物のネットワークに出ない
    const fetcher = this.env.AI_PROVIDER === 'mock' ? createMockProvider().fetchSource : undefined
    return verifySource(url, items, fetcher ?? ((input, init) => fetch(input, init)))
  }
}
