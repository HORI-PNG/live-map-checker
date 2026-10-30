// 会場サイトの自動取得を1回分まとめて行う（GitHub Actions から定期実行。手元でも実行できる）。
// 使い方: node scripts/scrape.mjs [prod|staging]（既定 prod）
// wrangler dev で取得用の Worker を起動し、順番待ちのページが無くなるまで1ページずつ取得する
import { spawn } from 'node:child_process'

const target = process.argv[2] ?? 'prod'
if (!['prod', 'staging'].includes(target)) {
  console.error('使い方: node scripts/scrape.mjs [prod|staging]')
  process.exit(1)
}
const PORT = 8799
const MAX_PAGES = 60
/** 同じサイトへ続けてアクセスしないよう、ページの間に空ける時間 */
const INTERVAL_MS = 3_000

const args = ['exec', 'wrangler', 'dev', '-c', 'wrangler.scraper.jsonc', '--port', String(PORT), '--ip', '127.0.0.1']
if (target === 'staging') args.push('--env', 'staging')
const server = spawn('pnpm', args, { stdio: ['ignore', 'pipe', 'inherit'] })
server.stdout.on('data', (chunk) => process.stdout.write(chunk))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function tick(sync) {
  const res = await fetch(`http://127.0.0.1:${PORT}/tick${sync ? '?sync=1' : ''}`, { method: 'POST' })
  if (!res.ok) throw new Error(`tick: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

let exitCode = 0
try {
  // 起動を待つ
  for (let i = 0; ; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`)
      break
    } catch {
      if (i > 120) throw new Error('wrangler dev が起動しません')
      await sleep(1_000)
    }
  }
  const summary = { success: 0, failed: 0, skipped: 0 }
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = await tick(i === 0)
    console.log(JSON.stringify(result))
    if (result.status === 'idle') break
    summary[result.status]++
    await sleep(INTERVAL_MS)
  }
  console.log(`\n取得: 成功 ${summary.success} / 失敗 ${summary.failed} / robots.txt で見送り ${summary.skipped}`)
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  server.kill()
}
process.exit(exitCode)
