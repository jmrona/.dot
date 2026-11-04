import { expect, test } from 'claude-code/testing'
import { unquotedSegmentsOf } from './command-text'
import { destructiveCommandDenial, rewrittenHistoryDenial } from './destructive-commands'
import type { RunGit } from './run-git'

function denialFor(command: string): string | undefined {
  return destructiveCommandDenial(unquotedSegmentsOf(command))
}

function denialText(kind: string): string {
  return `Destructive git commands need the user's explicit permission for that exact action (rules/common/git.md): \`${kind}\`. Ask the user, and give them the command so they can run it themselves with \`! <command>\`.`
}

test('git reset --hard is denied', () => {
  expect(denialFor('git reset --hard')).toBe(denialText('git reset --hard'))
})

test('git checkout -- a file is denied', () => {
  expect(denialFor('git checkout -- f')).toBe(denialText('git checkout --'))
})

test('git checkout of a branch with -- before a path is denied', () => {
  expect(denialFor('git checkout main -- f')).toBe(denialText('git checkout --'))
})

test('git checkout . is denied', () => {
  expect(denialFor('git checkout .')).toBe(denialText('git checkout --'))
})

test('git checkout -f is denied', () => {
  expect(denialFor('git checkout -f main')).toBe(denialText('git checkout --'))
})

test('git checkout --force is denied', () => {
  expect(denialFor('git checkout --force main')).toBe(denialText('git checkout --'))
})

test('git checkout of a branch name is not denied', () => {
  expect(denialFor('git checkout main')).toBeUndefined()
})

test('git switch -f is denied', () => {
  expect(denialFor('git switch -f x')).toBe(denialText('git switch --discard-changes'))
})

test('git switch --force is denied', () => {
  expect(denialFor('git switch --force x')).toBe(denialText('git switch --discard-changes'))
})

test('git switch --discard-changes is denied', () => {
  const denial = denialFor('git switch --discard-changes x')
  expect(denial).toBe(denialText('git switch --discard-changes'))
})

test('git switch of a branch is not denied', () => {
  expect(denialFor('git switch x')).toBeUndefined()
})

test('git switch -c is not denied', () => {
  expect(denialFor('git switch -c x')).toBeUndefined()
})

test('git checkout -b is not denied', () => {
  expect(denialFor('git checkout -b x')).toBeUndefined()
})

test('git restore without --staged is denied', () => {
  expect(denialFor('git restore f')).toBe(denialText('git restore'))
})

test('git restore --staged --worktree is denied', () => {
  expect(denialFor('git restore --staged --worktree f')).toBe(denialText('git restore'))
})

test('git restore --staged is not denied', () => {
  expect(denialFor('git restore --staged f')).toBeUndefined()
})

test('git clean -fd is denied', () => {
  expect(denialFor('git clean -fd')).toBe(denialText('git clean -f'))
})

test('git clean --force is denied', () => {
  expect(denialFor('git clean --force')).toBe(denialText('git clean -f'))
})

test('git clean -xdf is denied', () => {
  expect(denialFor('git clean -xdf')).toBe(denialText('git clean -f'))
})

test('git clean -n is not denied', () => {
  expect(denialFor('git clean -n')).toBeUndefined()
})

test('git branch -D is denied', () => {
  expect(denialFor('git branch -D x')).toBe(denialText('git branch -D'))
})

test('git branch -d is not denied', () => {
  expect(denialFor('git branch -d x')).toBeUndefined()
})

test('git stash drop is denied', () => {
  expect(denialFor('git stash drop')).toBe(denialText('git stash drop'))
})

test('git stash clear is denied', () => {
  expect(denialFor('git stash clear')).toBe(denialText('git stash clear'))
})

test('git stash pop is not denied', () => {
  expect(denialFor('git stash pop')).toBeUndefined()
})

test('git stash alone is not denied', () => {
  expect(denialFor('git stash')).toBeUndefined()
})

test('git reset --hard inside a subshell is denied', () => {
  expect(denialFor('(git reset --hard)')).toBe(denialText('git reset --hard'))
})

test('git clean -fd inside a command substitution is denied', () => {
  expect(denialFor('echo $(git clean -fd)')).toBe(denialText('git clean -f'))
})

test('git branch -fD is denied', () => {
  expect(denialFor('git branch -fD x')).toBe(denialText('git branch -D'))
})

test('git branch --delete --force is denied', () => {
  expect(denialFor('git branch --delete --force x')).toBe(denialText('git branch -D'))
})

test('git restore -S is not denied', () => {
  expect(denialFor('git restore -S f')).toBeUndefined()
})

test('git restore -S -W is denied', () => {
  expect(denialFor('git restore -S -W f')).toBe(denialText('git restore'))
})

test('git tag -d is denied', () => {
  expect(denialFor('git tag -d v1')).toBe(denialText('git tag -d'))
})

test('git tag --delete is denied', () => {
  expect(denialFor('git tag --delete v1')).toBe(denialText('git tag -d'))
})

test('a destructive command in a later segment of a chain is denied', () => {
  expect(denialFor('git status && git reset --hard')).toBe(denialText('git reset --hard'))
})

test('a destructive command quoted inside a commit message is not denied', () => {
  expect(denialFor('git commit -m "undo with git reset --hard now"')).toBeUndefined()
})

test('a destructive command behind a directory option is denied', () => {
  expect(denialFor('git -C x reset --hard')).toBe(denialText('git reset --hard'))
})

const AMEND_DENIAL =
  'This commit is already pushed, so amending it rewrites published history (rules/common/git.md). Make a new commit instead, or ask the user to run the amend themselves with `! <command>`.'
const REBASE_DENIAL =
  'This branch is already pushed, so a rebase rewrites published commits (rules/common/git.md). Ask the user, and give them the command so they can run it themselves with `! <command>`.'
const ANCESTOR_CHECK = 'merge-base --is-ancestor HEAD @{u}'
const UPSTREAM_LOOKUP = 'rev-parse --abbrev-ref @{u}'

function fakeGit(exitCodes: Record<string, number>): { runGit: RunGit; runs: string[] } {
  const runs: string[] = []
  const runGit: RunGit = async args => {
    runs.push(args.join(' '))
    return { exitCode: exitCodes[args.join(' ')] ?? 1, stdout: '' }
  }
  return { runGit, runs }
}

test('an amend of a commit that is already pushed is denied', async () => {
  const { runGit } = fakeGit({ [ANCESTOR_CHECK]: 0 })
  const segments = unquotedSegmentsOf('git commit --amend')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBe(AMEND_DENIAL)
})

test('an amend passes when the commit is not yet pushed', async () => {
  const { runGit } = fakeGit({ [ANCESTOR_CHECK]: 1 })
  const segments = unquotedSegmentsOf('git commit --amend')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBeUndefined()
})

test('a rebase on a branch with an upstream is denied', async () => {
  const { runGit } = fakeGit({ [UPSTREAM_LOOKUP]: 0 })
  const segments = unquotedSegmentsOf('git rebase main')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBe(REBASE_DENIAL)
})

test('a rebase passes when the branch has no upstream', async () => {
  const { runGit } = fakeGit({ [UPSTREAM_LOOKUP]: 128 })
  const segments = unquotedSegmentsOf('git rebase main')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBeUndefined()
})

test('a rebase --continue passes', async () => {
  const { runGit } = fakeGit({ [UPSTREAM_LOOKUP]: 0 })
  const segments = unquotedSegmentsOf('git rebase --continue')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBeUndefined()
})

test('a rebase --continue runs no git command', async () => {
  const { runGit, runs } = fakeGit({ [UPSTREAM_LOOKUP]: 0 })
  await rewrittenHistoryDenial(runGit, unquotedSegmentsOf('git rebase --continue'))
  expect(runs).toEqual([])
})

test('a command with neither an amend nor a rebase passes', async () => {
  const { runGit } = fakeGit({ [ANCESTOR_CHECK]: 0, [UPSTREAM_LOOKUP]: 0 })
  const segments = unquotedSegmentsOf('git commit -m "x" && git status')
  expect(await rewrittenHistoryDenial(runGit, segments)).toBeUndefined()
})

test('a command with neither an amend nor a rebase runs no git command', async () => {
  const { runGit, runs } = fakeGit({ [ANCESTOR_CHECK]: 0, [UPSTREAM_LOOKUP]: 0 })
  await rewrittenHistoryDenial(runGit, unquotedSegmentsOf('git commit -m "x" && git status'))
  expect(runs).toEqual([])
})
