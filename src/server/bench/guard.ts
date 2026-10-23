// 計測用ルートは staging とローカル開発でだけ開く（本番では 404）
import { env } from 'cloudflare:workers'

export function benchEnabled(): boolean {
  return import.meta.env.DEV || env.APP_ENV === 'staging'
}
