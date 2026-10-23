#!/usr/bin/env node
// PostToolUse フック: Claude Code が編集したファイルを Biome で整形・自動修正する。
// 標準入力に { tool_input: { file_path } } の JSON が来る。
import { spawnSync } from 'node:child_process'
import { relative } from 'node:path'

const TARGET = /\.(ts|tsx|js|mjs|cjs|jsx|json|jsonc|css)$/

let input = ''
for await (const chunk of process.stdin) input += chunk

let filePath
try {
  filePath = JSON.parse(input)?.tool_input?.file_path
} catch {
  process.exit(0)
}
if (typeof filePath !== 'string' || !TARGET.test(filePath)) process.exit(0)

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const rel = relative(projectDir, filePath)
if (rel.startsWith('..') || rel.startsWith('docs/')) process.exit(0)

const result = spawnSync('pnpm', ['exec', 'biome', 'check', '--write', '--no-errors-on-unmatched', rel], {
  cwd: projectDir,
  encoding: 'utf8',
})
// 自動で直せない指摘は Claude に返して直させる（終了コード 2 で stderr が Claude に渡る）
if (result.status !== 0) {
  process.stderr.write(`biome check で指摘があります: ${rel}\n${result.stdout}${result.stderr}`)
  process.exit(2)
}
