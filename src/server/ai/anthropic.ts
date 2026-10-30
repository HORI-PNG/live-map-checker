// Claude（Web 検索ツール）で会場の公演を探す（docs/plan.md 4.1）。
// 結果は report_events ツール（strict）で受け取る。Web 検索の結果には引用が付くため、JSON 出力の指定（output_config.format）は使わない
import Anthropic from '@anthropic-ai/sdk'
import { estimateSearchMicros, type TokenUsage, usageOf } from './pricing'
import { AiError, type AiProvider, type VenueSearchInput } from './types'

/** 1回の検索で Web 検索を使う上限（費用の上限にもなる） */
const MAX_SEARCHES = 3
/** サーバー側の検索が長引いて pause_turn で止まったときに続けさせる回数 */
const MAX_CONTINUATIONS = 2
/** 1回の呼び出しの待ち時間。再試行はしない（検索全体を 約3分以内に収める。state.ts の RUNNING_TIMEOUT_MS） */
const REQUEST_TIMEOUT_MS = 60_000

const REPORT_TOOL: Anthropic.Tool = {
  name: 'report_events',
  description: '調べた公演の一覧を報告する。調べ終えたら必ず1回だけ呼ぶ。見つからなければ events を空の配列にする。',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['artist', 'title', 'tour', 'date', 'open', 'start', 'source_url'],
          properties: {
            artist: { type: 'string', description: 'アーティスト名（出典ページの表記のまま）' },
            title: { type: 'string', description: '公演名。無ければアーティスト名' },
            tour: { type: ['string', 'null'], description: 'ツアー名。無ければ null' },
            date: { type: 'string', description: '公演日 YYYY-MM-DD' },
            open: { type: ['string', 'null'], description: '開場 HH:MM。不明なら null' },
            start: { type: ['string', 'null'], description: '開演 HH:MM。不明なら null' },
            source_url: { type: 'string', description: 'この公演が書かれていたページの URL（検索で実際に見たもの）' },
          },
        },
      },
    },
  },
}

const SYSTEM = `あなたは日本のライブ会場で行われる音楽の公演を調べるアシスタントです。
- Web 検索で、指定された会場・期間の「音楽のライブ・コンサート」だけを探してください。スポーツ・展示会・学会・お笑い・演劇・ミュージカルなどは含めません。
- source_url には、その公演の日付とアーティスト名が書かれていて、検索で実際に見たページの URL だけを入れてください。URL を推測で作ってはいけません。
- 日付・時刻が確かめられない項目は null にしてください。期間外の公演は含めません。
- 調べ終えたら report_events を1回だけ呼んで報告してください。`

function prompt(input: VenueSearchInput): string {
  return [
    `会場: ${input.venueName}（${input.prefectureName} ${input.area}）`,
    `会場の公式サイト: ${input.officialUrl}`,
    input.scheduleUrl ? `会場のスケジュールのページ: ${input.scheduleUrl}` : null,
    `期間: ${input.from} 〜 ${input.to}`,
    'この会場で、この期間に行われる音楽のライブ・コンサートを探してください。',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Haiku は動的フィルタリング付きの Web 検索に対応していないので、基本版を使う */
function webSearchTool(model: string): Anthropic.ToolUnion {
  const options = {
    name: 'web_search' as const,
    max_uses: MAX_SEARCHES,
    user_location: { type: 'approximate' as const, country: 'JP', timezone: 'Asia/Tokyo' },
  }
  return model.startsWith('claude-haiku')
    ? { type: 'web_search_20250305', ...options }
    : { type: 'web_search_20260209', ...options }
}

function addUsage(total: TokenUsage, usage: Anthropic.Usage) {
  total.inputTokens += usage.input_tokens
  total.outputTokens += usage.output_tokens
  total.cacheCreationTokens = (total.cacheCreationTokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  total.webSearchCount += usage.server_tool_use?.web_search_requests ?? 0
}

export function createAnthropicProvider({ apiKey, model }: { apiKey: string; model: string }): AiProvider {
  return {
    name: 'anthropic',
    model,
    estimateCostMicros: () => estimateSearchMicros(model),

    async searchVenueEvents(input) {
      const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS })
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt(input) }]
      const total: TokenUsage = { inputTokens: 0, outputTokens: 0, webSearchCount: 0 }
      const usage = () => usageOf(model, total)

      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        let res: Anthropic.Message
        try {
          res = await client.messages.create({
            model,
            max_tokens: 8000,
            system: SYSTEM,
            tools: [webSearchTool(model), REPORT_TOOL],
            // 探す・まとめるだけなので深く考えさせない（費用と時間を抑える）
            output_config: { effort: 'low' },
            messages,
          })
        } catch (error) {
          const message = error instanceof Anthropic.APIError ? `HTTP ${error.status}: ${error.message}` : String(error)
          throw new AiError('api', message.slice(0, 300), usage())
        }
        addUsage(total, res.usage)

        const report = res.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === REPORT_TOOL.name,
        )
        if (report) {
          const events = (report.input as { events?: unknown }).events
          if (!Array.isArray(events)) throw new AiError('invalid_response', 'events が配列ではありません', usage())
          return { candidates: events, usage: usage() }
        }
        if (res.stop_reason === 'refusal') {
          throw new AiError('refusal', `refusal: ${res.stop_details?.category ?? 'unknown'}`, usage())
        }
        if (res.stop_reason !== 'pause_turn') {
          throw new AiError('invalid_response', `report_events が呼ばれませんでした（${res.stop_reason}）`, usage())
        }
        // サーバー側の検索の途中で止まった。そのまま送り返すと続きから再開する
        messages.push({ role: 'assistant', content: res.content })
      }
      throw new AiError('invalid_response', 'pause_turn が続いたため打ち切りました', usage())
    },
  }
}
