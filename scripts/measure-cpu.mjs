// staging（PR プレビュー）の CPU 時間を測る（docs/plan.md 10.5）。
// 使い方: node scripts/measure-cpu.mjs <プレビューの URL> [1ページあたりの回数（既定 10）]
// - wrangler tail で staging Worker の実行ログ（cpuTime）を受け取りながら、各ページにアクセスする
// - 「描画」: 毎回違うクエリを付けてキャッシュを外したとき。「キャッシュ」: 同じ URL を繰り返したとき
import { spawn } from 'node:child_process'

const base = process.argv[2]?.replace(/\/$/, '')
const rounds = Number(process.argv[3] ?? 10)
if (!base) {
  console.error('使い方: node scripts/measure-cpu.mjs <プレビューの URL> [回数]')
  process.exit(1)
}

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

for (const path of PATHS) {
  for (let i = 0; i < rounds; i++) {
    await fetch(`${base}${path}?__cpu=${Date.now()}-${i}`) // 描画（キャッシュを外す）
    await fetch(`${base}${path}`) // キャッシュ（2回目以降は当たる）
  }
}
await sleep(10_000)
tail.kill()

const groups = new Map()
for (const e of events) {
  const url = e.event?.request?.url
  if (!url || typeof e.cpuTime !== 'number') continue
  const u = new URL(url)
  if (!PATHS.includes(u.pathname) && !u.pathname.startsWith('/_serverFn/')) continue
  const label = `${u.pathname.startsWith('/_serverFn/') ? '(サーバー関数)' : u.pathname} ${u.searchParams.has('__cpu') ? '描画' : 'キャッシュ'}`
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
