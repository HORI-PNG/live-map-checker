// staging の CPU 時間を測る（docs/plan.md 10.5）。
// wrangler tail に流れるのは staging に「デプロイした」バージョンだけで、PR プレビュー（別名 URL）は流れない。
// そのため、測りたいブランチを staging にデプロイしてから実行する:
//   CLOUDFLARE_ENV=staging pnpm build && pnpm exec wrangler deploy && pnpm db:seed:staging
//   node scripts/measure-cpu.mjs [staging の URL（既定は下）] [1ページあたりの回数（既定 10）]
// - wrangler tail で staging Worker の実行ログ（cpuTime）を受け取りながら、各ページにアクセスする
// - 「描画」: x-lmc-cache-bypass でキャッシュを外したとき（staging だけ受け付ける）
// - 「キャッシュ」: キャッシュから返したとき（応答の x-lmc-cache が hit のものだけ。cf-ray で実行ログと照合する）
import { spawn } from 'node:child_process'

const base = (process.argv[2] ?? 'https://live-map-checker-staging.horinouchi-yuki189.workers.dev').replace(/\/$/, '')
const rounds = Number(process.argv[3] ?? 10)

const PATHS = ['/', '/regions/kyushu', '/prefectures/fukuoka', '/venues/marine-messe-fukuoka', '/venues/zepp-fukuoka']
const LIMIT_MS = 10

const tail = spawn('pnpm', ['exec', 'wrangler', 'tail', 'live-map-checker-staging', '--format', 'json'], {
  stdio: ['ignore', 'pipe', 'inherit'],
})
let buffer = ''
const events = []
tail.stdout.on('data', (chunk) => {
  buffer += chunk
  // wrangler tail は整形した JSON を続けて出すので、波かっこの対応で1件ずつ切り出す
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  let consumed = 0
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        events.push(JSON.parse(buffer.slice(start, i + 1)))
        consumed = i + 1
      }
    }
  }
  buffer = buffer.slice(consumed)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
console.log('wrangler tail に接続しています…')
await sleep(12_000)

/** cf-ray（先頭の16進）→ 表の行の名前 */
const labels = new Map()
async function request(path, bypass) {
  const res = await fetch(`${base}${path}`, { headers: bypass ? { 'x-lmc-cache-bypass': '1' } : {} })
  await res.arrayBuffer()
  const ray = res.headers.get('cf-ray')?.split('-')[0]
  const cache = res.headers.get('x-lmc-cache')
  if (ray)
    labels.set(ray, `${path} ${cache === 'hit' ? 'キャッシュ' : cache === 'bypass' ? '描画' : `その他(${cache})`}`)
}

for (const path of PATHS) {
  await request(path, false) // キャッシュを温める
  for (let i = 0; i < rounds; i++) {
    await request(path, true)
    await request(path, false)
  }
}
await sleep(10_000)
tail.kill()

const groups = new Map()
for (const e of events) {
  const label = labels.get(e.event?.request?.headers?.['cf-ray'])
  if (!label || typeof e.cpuTime !== 'number') continue
  groups.set(label, [...(groups.get(label) ?? []), e.cpuTime])
}

const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
console.log(`\n| ページ | 回数 | 中央値 | p95 | 最大 | ${LIMIT_MS}ms 超え |\n|---|---|---|---|---|---|`)
let over = 0
for (const [label, values] of rows) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const exceeded = values.filter((v) => v > LIMIT_MS).length
  over += exceeded
  console.log(`| ${label} | ${values.length} | ${at(0.5)} | ${at(0.95)} | ${sorted.at(-1)} | ${exceeded} |`)
}
console.log(rows.length === 0 ? '\nログを受け取れませんでした（URL と wrangler のログインを確認）' : '')
process.exit(over > 0 ? 1 : 0)
