import { expect, test } from 'claude-code/testing'
import { commitMessageDenial } from './commit-message'
import type { GitResult, RunGit } from './run-git'

function branchRunner(branch: GitResult): { runGit: RunGit; runs: string[] } {
  const runs: string[] = []
  const runGit: RunGit = async args => {
    runs.push(args.join(' '))
    return branch
  }
  return { runGit, runs }
}

function onBranch(name: string) {
  return { exitCode: 0, stdout: `${name}\n` }
}

function commitWith(message: string): string {
  return `git commit -m "$(cat <<'EOF'\n${message}\nEOF\n)"`
}

function denialText(reason: string): string {
  return (
    `Commit message breaks the format in rules/common/git.md: ${reason}. ` +
    'Expected shape: `type(scope): description (KEY)`, ' +
    'with the suffix only when the branch name starts with a ticket key.'
  )
}

async function denialFor(command: string, branch = onBranch('FEAT-1')) {
  return commitMessageDenial(branchRunner(branch).runGit, command)
}

test('a command without a commit passes', async () => {
  expect(await denialFor('git status')).toBeUndefined()
})

test('a command without a commit runs no process', async () => {
  const { runGit, runs } = branchRunner(onBranch('FEAT-1'))
  await commitMessageDenial(runGit, 'git status')
  expect(runs).toEqual([])
})

test('a subject without the branch ticket suffix is denied', async () => {
  const command = commitWith('feat(mods): add x')
  expect(await denialFor(command)).toBe(denialText('the branch FEAT-1 needs the suffix (FEAT-1)'))
})

test('a subject with the suffix on a branch without a ticket key is denied', async () => {
  const command = commitWith('feat(mods): add x (FEAT-1)')
  expect(await denialFor(command, onBranch('main'))).toBe(
    denialText('the branch main has no ticket key, so the subject takes no suffix'),
  )
})

test('a subject without the suffix on a branch without a ticket key passes', async () => {
  expect(await denialFor(commitWith('feat(mods): add x'), onBranch('main'))).toBeUndefined()
})

test('a valid heredoc subject on a ticket branch passes', async () => {
  expect(await denialFor(commitWith('feat(mods): add x (FEAT-1)\n\nBody text.'))).toBeUndefined()
})

test('a detached head skips the ticket check', async () => {
  const detached = { exitCode: 128, stdout: '' }
  expect(await denialFor(commitWith('feat(mods): add x'), detached)).toBeUndefined()
})

const SHAPE_REASON =
  'the subject must start with a type from git.md and a lowercase scope in brackets'

test('a subject without a scope is denied', async () => {
  const denial = await denialFor(commitWith('feat: add x'), onBranch('main'))
  expect(denial).toBe(denialText(SHAPE_REASON))
})

test('a subject with an unknown type is denied', async () => {
  const denial = await denialFor(commitWith('feature(mods): add x'), onBranch('main'))
  expect(denial).toBe(denialText(SHAPE_REASON))
})

test('a description starting in uppercase is denied', async () => {
  expect(await denialFor(commitWith('feat(mods): Add x'), onBranch('main'))).toBe(
    denialText('the description must start in lowercase'),
  )
})

test('a subject ending in a full stop is denied', async () => {
  expect(await denialFor(commitWith('feat(mods): add x.'), onBranch('main'))).toBe(
    denialText('the subject must not end with a full stop'),
  )
})

test('a full stop before the ticket suffix is denied', async () => {
  expect(await denialFor(commitWith('feat(mods): add x. (FEAT-1)'))).toBe(
    denialText('the subject must not end with a full stop'),
  )
})

const LITERAL_REASON = 'the message must be literal text in the command, so the guard can read it'
const DASH_REASON =
  'the message must not contain em-dashes, en-dashes or emojis (rules/common/language.md)'

test('an em-dash in the body is denied', async () => {
  const denial = await denialFor(commitWith('feat(mods): add x (FEAT-1)\n\nBody — text.'))
  expect(denial).toBe(denialText(DASH_REASON))
})

test('an en-dash in the body is denied', async () => {
  const denial = await denialFor(commitWith('feat(mods): add x (FEAT-1)\n\nBody – text.'))
  expect(denial).toBe(denialText(DASH_REASON))
})

test('an emoji in the subject is denied', async () => {
  const denial = await denialFor(commitWith('feat(mods): add x \u{1F680} (FEAT-1)'))
  expect(denial).toBe(denialText(DASH_REASON))
})

test('a merge subject passes the subject checks', async () => {
  expect(await denialFor(commitWith("Merge branch 'x' into FEAT-1"))).toBeUndefined()
})

test('a merge subject with an em-dash is still denied', async () => {
  expect(await denialFor(commitWith('Merge branch — x'))).toBe(denialText(DASH_REASON))
})

async function shapeDenialFor(command: string) {
  return denialFor(command, onBranch('main'))
}

test('a combined -am flag with a double-quoted message is read', async () => {
  expect(await shapeDenialFor('git commit -am "bad subject"')).toBe(denialText(SHAPE_REASON))
})

test('a combined -nm flag with a single-quoted message is read', async () => {
  expect(await shapeDenialFor("git commit -nm 'bad subject'")).toBe(denialText(SHAPE_REASON))
})

test('an unquoted -m word is read', async () => {
  expect(await shapeDenialFor('git commit -m bad')).toBe(denialText(SHAPE_REASON))
})

test('a --message flag with a quoted message is read', async () => {
  expect(await shapeDenialFor('git commit --message "bad subject"')).toBe(denialText(SHAPE_REASON))
})

test('a --message= flag with a quoted message is read', async () => {
  expect(await shapeDenialFor('git commit --message="bad subject"')).toBe(denialText(SHAPE_REASON))
})

test('a --message= flag with an unquoted message is read', async () => {
  expect(await shapeDenialFor('git commit --message=bad')).toBe(denialText(SHAPE_REASON))
})

test('an em-dash after an escaped quote inside a double-quoted message is denied', async () => {
  const command = 'git commit -m "feat(mods): add \\"x\\" (a)—"'
  expect(await shapeDenialFor(command)).toBe(denialText(DASH_REASON))
})

test('with two -m flags the second does not count as the subject', async () => {
  const command = 'git commit -m "feat(mods): add x" -m "Body."'
  expect(await shapeDenialFor(command)).toBeUndefined()
})

test('a body paragraph from a second -m flag is checked for dashes', async () => {
  const command = 'git commit -m "feat(mods): add x" -m "Body — text."'
  expect(await shapeDenialFor(command)).toBe(denialText(DASH_REASON))
})

test('a commit that reads its message from a file passes', async () => {
  expect(await shapeDenialFor('git commit -F msg.txt')).toBeUndefined()
})

test('a commit chained after another command is read', async () => {
  expect(await shapeDenialFor("cd x && git commit -m 'bad subject'")).toBe(denialText(SHAPE_REASON))
})

test('a commit without a message flag runs no process', async () => {
  const { runGit, runs } = branchRunner(onBranch('FEAT-1'))
  expect(await commitMessageDenial(runGit, 'git commit --no-edit')).toBeUndefined()
  expect(runs).toEqual([])
})

test('a heredoc with a bare marker is read', async () => {
  const command = 'git commit -m "$(cat <<EOF\nbad subject\nEOF\n)"'
  expect(await shapeDenialFor(command)).toBe(denialText(SHAPE_REASON))
})

test('a heredoc with a double-quoted marker is read', async () => {
  const command = 'git commit -m "$(cat <<"END"\nbad subject\nEND\n)"'
  expect(await shapeDenialFor(command)).toBe(denialText(SHAPE_REASON))
})

test('a bad second commit after a valid first commit is denied', async () => {
  const command = 'git commit -m "feat(x): y (FEAT-1)" && git commit -m "Bad subject (FEAT-1)"'
  expect(await denialFor(command)).toBe(denialText(SHAPE_REASON))
})

test('a bad commit after a log whose quoted text mentions git commit is denied', async () => {
  const command = 'git log --grep "git commit" && git commit -m "Bad subject"'
  expect(await shapeDenialFor(command)).toBe(denialText(SHAPE_REASON))
})

test('a message attached to -m without a space is read', async () => {
  expect(await shapeDenialFor('git commit -m"Bad subject"')).toBe(denialText(SHAPE_REASON))
})

test('a message attached to -am without a space is read', async () => {
  expect(await shapeDenialFor('git commit -am"Bad subject"')).toBe(denialText(SHAPE_REASON))
})

test('trailing whitespace after the subject is ignored', async () => {
  expect(await denialFor('git commit -m "feat(x): y (FEAT-1) "')).toBeUndefined()
})

test('a commit inside a subshell is read without its closing bracket', async () => {
  expect(await denialFor('(git commit -m "feat(x): y (FEAT-1)")')).toBeUndefined()
})

test('a heredoc body line that merely contains the marker does not end the body', async () => {
  const command = commitWith('feat(mods): add x (FEAT-1)\n\nsee EOF) "quoted"\nand \u2014 dash')
  expect(await denialFor(command)).toBe(denialText(DASH_REASON))
})

test('a message taken from a shell variable is denied as not literal', async () => {
  const denial = await shapeDenialFor('git commit -m "$MSG"')
  expect(denial).toBe(denialText(LITERAL_REASON))
})

test('a message from a non-heredoc command substitution is denied as not literal', async () => {
  const denial = await shapeDenialFor('git commit -m "$(cat msg.txt)"')
  expect(denial).toBe(denialText(LITERAL_REASON))
})

test('a message in dollar-single-quote form is denied as not literal', async () => {
  const denial = await shapeDenialFor("git commit -m $'feat(mods): add x'")
  expect(denial).toBe(denialText(LITERAL_REASON))
})

test('a single-quoted message that starts with a dollar sign gets the shape reason', async () => {
  const denial = await shapeDenialFor("git commit -m '$5 fee (FEAT-1)'")
  expect(denial).toBe(denialText(SHAPE_REASON))
})

test('a double-quoted message with an escaped leading dollar gets the shape reason', async () => {
  const denial = await shapeDenialFor('git commit -m "\\$5 fee (FEAT-1)"')
  expect(denial).toBe(denialText(SHAPE_REASON))
})

test('an unquoted message with an escaped leading dollar gets the shape reason', async () => {
  const denial = await shapeDenialFor('git commit -m \\$5')
  expect(denial).toBe(denialText(SHAPE_REASON))
})

function answeringByArguments(answers: Record<string, GitResult>): {
  runGit: RunGit
  runs: string[]
} {
  const runs: string[] = []
  const runGit: RunGit = async args => {
    runs.push(args.join(' '))
    return answers[args.join(' ')] ?? { exitCode: 1, stdout: '' }
  }
  return { runGit, runs }
}

const SUBJECT_FOR_598 = 'feat(mods): add x (VAN3-598)'

test('a commit after cd into another worktree is checked against that worktree branch', async () => {
  const { runGit } = answeringByArguments({
    'branch --show-current': onBranch('VAN3-597'),
    '-C /wt/598 branch --show-current': onBranch('VAN3-598'),
  })
  const command = `cd /wt/598 && ${commitWith(SUBJECT_FOR_598)}`
  expect(await commitMessageDenial(runGit, command)).toBeUndefined()
})

test('a commit with -C queries the branch of that directory', async () => {
  const { runGit, runs } = answeringByArguments({
    '-C /wt/598 branch --show-current': onBranch('VAN3-598'),
  })
  await commitMessageDenial(runGit, `git -C /wt/598 commit -m "${SUBJECT_FOR_598}"`)
  expect(runs).toEqual(['-C /wt/598 branch --show-current'])
})

test('a quoted -C directory reaches the branch query unquoted', async () => {
  const queries: (readonly string[])[] = []
  const runGit: RunGit = async args => {
    queries.push(args)
    return onBranch('VAN3-598')
  }
  await commitMessageDenial(runGit, `git -C "my dir" commit -m "${SUBJECT_FOR_598}"`)
  expect(queries).toEqual([['-C', 'my dir', 'branch', '--show-current']])
})

test('a cd and a -C are queried in order', async () => {
  const { runGit, runs } = answeringByArguments({
    '-C a -C b branch --show-current': onBranch('VAN3-598'),
  })
  await commitMessageDenial(runGit, `cd a && git -C b commit -m "${SUBJECT_FOR_598}"`)
  expect(runs).toEqual(['-C a -C b branch --show-current'])
})

test('a commit without cd or -C queries the session branch', async () => {
  const { runGit, runs } = branchRunner(onBranch('VAN3-598'))
  await commitMessageDenial(runGit, `git commit -m "${SUBJECT_FOR_598}"`)
  expect(runs).toEqual(['branch --show-current'])
})
