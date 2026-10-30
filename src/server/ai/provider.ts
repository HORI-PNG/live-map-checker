// AI の提供元を選ぶ（docs/plan.md 4.1）。AI は必ずここを通して呼ぶ（CLAUDE.md）。
// 大学のサービスなどに替えるときは、AiProvider を実装したものを1つ足して、ここで選べるようにする
import { createAnthropicProvider } from './anthropic'
import { createMockProvider } from './mock'
import { AiError, type AiProvider } from './types'

type AiEnv = { AI_PROVIDER: string; AI_MODEL: string; ANTHROPIC_API_KEY?: string }

export function getAiProvider(env: AiEnv): AiProvider {
  switch (env.AI_PROVIDER) {
    case 'mock':
      return createMockProvider()
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) throw new AiError('unavailable', 'ANTHROPIC_API_KEY が設定されていません')
      return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL })
    default:
      throw new AiError('unavailable', `AI_PROVIDER が不明です: ${env.AI_PROVIDER}`)
  }
}
