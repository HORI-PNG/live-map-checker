// シードを D1 に流し込む: node scripts/seed.ts <local|staging|prod>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildSeedStatements } from '../src/server/db/seed/sql.ts'

const TARGETS = {
  local: ['lmc-prod', '--local'],
  staging: ['lmc-staging', '--remote', '--env', 'staging'],
  prod: ['lmc-prod', '--remote'],
} as const

const target = process.argv[2] as keyof typeof TARGETS
if (!Object.hasOwn(TARGETS, target)) {
  console.error('使い方: node scripts/seed.ts <local|staging|prod>')
  process.exit(1)
}

mkdirSync('.wrangler', { recursive: true })
const file = '.wrangler/seed.sql'
writeFileSync(file, `${buildSeedStatements().join('\n')}\n`)
const [db, ...flags] = TARGETS[target]
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', db, ...flags, '--file', file, '--yes'], { stdio: 'inherit' })
