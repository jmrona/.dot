import { gitSubcommand } from './command-text'
import type { RunGit } from './run-git'

interface DestructiveRule {
  kind: string
  matches: (segment: string) => boolean
}

function denialFor(kind: string): string {
  return `Destructive git commands need the user's explicit permission for that exact action (rules/common/git.md): \`${kind}\`. Ask the user, and give them the command so they can run it themselves with \`! <command>\`.`
}

function tokensOf(segment: string): string[] {
  return segment.split(/[\s(){}`]+/)
}

function hasToken(segment: string, ...wanted: string[]): boolean {
  return tokensOf(segment).some(token => wanted.includes(token))
}

function isForced(segment: string): boolean {
  return hasToken(segment, '--force') || hasShortFlag(segment, 'f')
}

function isForcedBranchDelete(segment: string): boolean {
  const isDelete = hasToken(segment, '--delete') || hasShortFlag(segment, 'd')
  return hasShortFlag(segment, 'D') || (isDelete && isForced(segment))
}

function hasShortFlag(segment: string, flag: string): boolean {
  return tokensOf(segment).some(token => new RegExp(`^-[a-zA-Z]*${flag}[a-zA-Z]*$`).test(token))
}

function isCheckoutDiscard(segment: string): boolean {
  return hasToken(segment, '--', '.') || isForced(segment)
}

function isForcedSwitch(segment: string): boolean {
  return hasToken(segment, '--discard-changes') || isForced(segment)
}

function isDestructiveRestore(segment: string): boolean {
  const isStagedOnly = hasToken(segment, '--staged', '-S')
  const touchesWorktree = hasToken(segment, '--worktree', '-W')
  return !isStagedOnly || touchesWorktree
}

const RULES: readonly DestructiveRule[] = [
  {
    kind: 'git reset --hard',
    matches: segment =>
      gitSubcommand('reset').test(segment) && hasToken(segment, '--hard'),
  },
  {
    kind: 'git checkout --',
    matches: segment =>
      gitSubcommand('checkout').test(segment) && isCheckoutDiscard(segment),
  },
  {
    kind: 'git switch --discard-changes',
    matches: segment =>
      gitSubcommand('switch').test(segment) && isForcedSwitch(segment),
  },
  {
    kind: 'git restore',
    matches: segment =>
      gitSubcommand('restore').test(segment) && isDestructiveRestore(segment),
  },
  {
    kind: 'git clean -f',
    matches: segment =>
      gitSubcommand('clean').test(segment) && isForced(segment),
  },
  {
    kind: 'git branch -D',
    matches: segment =>
      gitSubcommand('branch').test(segment) && isForcedBranchDelete(segment),
  },
  {
    kind: 'git stash drop',
    matches: segment =>
      gitSubcommand('stash').test(segment) && hasToken(segment, 'drop'),
  },
  {
    kind: 'git stash clear',
    matches: segment =>
      gitSubcommand('stash').test(segment) && hasToken(segment, 'clear'),
  },
  {
    kind: 'git tag -d',
    matches: segment =>
      gitSubcommand('tag').test(segment) && hasToken(segment, '-d', '--delete'),
  },
]

export function destructiveCommandDenial(segments: readonly string[]): string | undefined {
  for (const segment of segments) {
    const rule = RULES.find(candidate => candidate.matches(segment))
    if (rule) return denialFor(rule.kind)
  }
  return undefined
}

const AMEND_DENIAL =
  'This commit is already pushed, so amending it rewrites published history (rules/common/git.md). Make a new commit instead, or ask the user to run the amend themselves with `! <command>`.'

const REBASE_DENIAL =
  'This branch is already pushed, so a rebase rewrites published commits (rules/common/git.md). Ask the user, and give them the command so they can run it themselves with `! <command>`.'

async function isPushedRebase(runGit: RunGit, segment: string): Promise<boolean> {
  if (!gitSubcommand('rebase').test(segment)) return false
  if (hasToken(segment, '--continue', '--abort', '--skip', '--quit')) return false
  return (await runGit(['rev-parse', '--abbrev-ref', '@{u}'])).exitCode === 0
}

async function isPushedAmend(runGit: RunGit, segment: string): Promise<boolean> {
  if (!gitSubcommand('commit').test(segment) || !hasToken(segment, '--amend')) return false
  return (await runGit(['merge-base', '--is-ancestor', 'HEAD', '@{u}'])).exitCode === 0
}

export async function rewrittenHistoryDenial(
  runGit: RunGit,
  segments: readonly string[],
): Promise<string | undefined> {
  for (const segment of segments) {
    if (await isPushedAmend(runGit, segment)) return AMEND_DENIAL
    if (await isPushedRebase(runGit, segment)) return REBASE_DENIAL
  }
  return undefined
}
