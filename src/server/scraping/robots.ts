// robots.txt の判定（RFC 9309 の要点: 自分に当てはまるグループの Allow / Disallow のうち、最も長く一致した規則が勝つ）
export const USER_AGENT_TOKEN = 'LiveMapChecker'

type Rule = { allow: boolean; path: string }

function parseGroups(body: string): { agents: string[]; rules: Rule[] }[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const field = match[1].toLowerCase()
    const value = match[2].trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false
      // 空の Disallow は「制限なし」なので規則として持たない
      if (value) current.rules.push({ allow: field === 'allow', path: value })
    } else {
      lastWasAgent = false
    }
  }
  return groups
}

function matches(pattern: string, path: string): boolean {
  // * は任意の文字列、末尾の $ は行末
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${body.join('.*')}${anchored ? '$' : ''}`).test(path)
}

/** body が null（robots.txt が無い）なら制限なし */
export function isAllowedByRobots(body: string | null, pathWithQuery: string, agent = USER_AGENT_TOKEN): boolean {
  if (!body) return true
  const groups = parseGroups(body)
  const ua = agent.toLowerCase()
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)))
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes('*'))
  let best: Rule | null = null
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!matches(rule.path, pathWithQuery)) continue
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule
    }
  }
  return best ? best.allow : true
}
