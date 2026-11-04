import type { Register } from 'claude-code'

const PUSH_DENIAL = 'Pushes are forbidden (rules/common/git.md). Tell the user what to push.'
const TRAILER_DENIAL = 'Commit messages must not carry Co-Authored-By (rules/common/git.md).'

const OPTION_WITH_ARGUMENT = String.raw`-[^\s"']+(?:\s+(?:"[^"]*"|'[^']*'|[^\s-]\S*))?`

const gitSubcommand = (subcommand: string) =>
  new RegExp(String.raw`\bgit(?:\s+${OPTION_WITH_ARGUMENT})*\s+${subcommand}\b`)

const GIT_PUSH = gitSubcommand('push')
const GIT_COMMIT = gitSubcommand('commit')
const CO_AUTHORED_BY = /co-authored-by/i

const segmentsOf = (command: string) =>
  command.split(/&&|\|\||;|\||\n/).map(segment => segment.trim())

const denialFor = (command: string) => {
  const segments = segmentsOf(command)
  if (segments.some(segment => GIT_PUSH.test(segment))) return PUSH_DENIAL
  const hasCommit = segments.some(segment => GIT_COMMIT.test(segment))
  return hasCommit && CO_AUTHORED_BY.test(command) ? TRAILER_DENIAL : undefined
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const denial = denialFor(e.command)
    return denial ? { deny: denial } : next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` },
  )
}
