import { execFileSync } from 'node:child_process'

export default function globalSetup() {
  execFileSync('pnpm', ['db:setup:local'], { stdio: 'inherit' })
}
