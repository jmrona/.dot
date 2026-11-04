import type { Hook, Register } from 'claude-code'
import { gitSubcommand, unquotedSegmentsOf } from './command-text'
import { commitMessageDenial } from './commit-message'
import { destructiveCommandDenial, rewrittenHistoryDenial } from './destructive-commands'
import type { RunGit } from './run-git'
import { stagedSecretsDenial } from './staged-secrets'

type Engine = Parameters<Hook<'tool.call'>>[0]

const PUSH_DENIAL = 'Pushes are forbidden (rules/common/git.md). Tell the user what to push.'
const TRAILER_DENIAL = 'Commit messages must not carry Co-Authored-By (rules/common/git.md).'

const GIT_PUSH = gitSubcommand('push')
const GIT_COMMIT = gitSubcommand('commit')
const CO_AUTHORED_BY = /co-authored-by/i

function gitRunnerFor($: Engine): RunGit {
  return async args => {
    const cwd = await $.session.cwd()
    const { exitCode, stdout } = await $.process.run(['git', ...args], { cwd })
    return { exitCode, stdout }
  }
}

function trailerDenial(segments: readonly string[], command: string): string | undefined {
  const hasCommit = segments.some(segment => GIT_COMMIT.test(segment))
  return hasCommit && CO_AUTHORED_BY.test(command) ? TRAILER_DENIAL : undefined
}

async function denialFor($: Engine, command: string): Promise<string | undefined> {
  const segments = unquotedSegmentsOf(command)
  if (segments.some(segment => GIT_PUSH.test(segment))) return PUSH_DENIAL
  const runGit = gitRunnerFor($)
  return (
    destructiveCommandDenial(segments) ??
    (await rewrittenHistoryDenial(runGit, segments)) ??
    (await stagedSecretsDenial(runGit, command)) ??
    (await commitMessageDenial(runGit, command)) ??
    trailerDenial(segments, command)
  )
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const denial = await denialFor($, e.command)
    return denial ? { deny: denial } : next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` },
  )
}
