import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const PUSH_DENIAL = 'Pushes are forbidden (rules/common/git.md). Tell the user what to push.'
const TRAILER_DENIAL = 'Commit messages must not carry Co-Authored-By (rules/common/git.md).'

const FINISHED = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

const SESSION_CWD = '/home/dev/app'

const CLEAN_INDEX = { 'diff --cached --name-only -z': { exitCode: 0, stdout: '' } }

const ON_FEAT_1 = { 'branch --show-current': { exitCode: 0, stdout: 'FEAT-1\n' } }

const AMEND = 'git commit --amend --no-edit'

const PUSHED_HEAD = { 'merge-base --is-ancestor HEAD @{u}': { exitCode: 1, stdout: '' } }

interface GitAnswer {
  readonly exitCode: number
  readonly stdout: string
}

type GitAnswers = Record<string, GitAnswer>

function stubGitProcess(on: On, answers: GitAnswers = {}) {
  const runs: { argv: readonly string[]; cwd: string | undefined }[] = []
  on('session.cwd', () => ({ value: SESSION_CWD }))
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const answer = answers[e.argv.slice(1).join(' ')] ?? { exitCode: 1, stdout: '' }
    return { value: { ...FINISHED, ...answer } }
  })
  return runs
}

function stubGit(on: On, answers: GitAnswers = {}) {
  on('tool.call', () => ({ result: {} }))
  return stubGitProcess(on, answers)
}

test('a whole command of git push is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push after an && segment is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'cd x && git push origin main' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a push after a newline is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git add .\ngit push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push with a directory option is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C x push --force' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push behind a wrapper command is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'sudo git push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push inside a subshell is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: '(git push)' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push with a quoted option argument holding a space is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C "my dir" push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a commit carrying Co-Authored-By in any case is denied', async ($, on) => {
  stubGitProcess(on)
  on('tool.call', () => ({ result: {} }))
  const command = "git commit -m 'feat(app): x\n\nco-authored-by: Someone <a@b.c>'"
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit behind a wrapper carrying Co-Authored-By is denied', async ($, on) => {
  stubGitProcess(on)
  on('tool.call', () => ({ result: {} }))
  const command = 'env X=1 git -C "my dir" commit -m "feat(app): x Co-Authored-By: A"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit without Co-Authored-By reaches the tool unchanged', async ($, on) => {
  stubGitProcess(on)
  const received: string[] = []
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    received.push(e.command)
    return { result: {} }
  })
  const command = "git commit -m 'feat(app): x'"
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toBeUndefined()
  expect(received).toEqual([command])
})

test('a command that only mentions push reaches the tool unchanged', async ($, on) => {
  const received: string[] = []
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    received.push(e.command)
    return { result: {} }
  })
  const answer = await $.tool.call({ tool: 'Bash', command: 'echo push' })
  expect(answer.deny).toBeUndefined()
  expect(received).toEqual(['echo push'])
})

test('git status reaches the tool unchanged', async ($, on) => {
  const received: string[] = []
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    received.push(e.command)
    return { result: {} }
  })
  const answer = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(answer.deny).toBeUndefined()
  expect(received).toEqual(['git status'])
})

test('a git push with a quoted config value holding a space is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -c user.name="A B" push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push with a single-quoted config value holding a space is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: "git -c a='x y' push" })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a git push with a backslash-escaped space in a directory option is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -C my\\ dir push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a commit with a quoted config value carrying Co-Authored-By is denied', async ($, on) => {
  stubGitProcess(on)
  on('tool.call', () => ({ result: {} }))
  const command = 'git -c user.name="A B" commit -m "feat(app): x Co-Authored-By: y"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit message that mentions push reaches the tool unchanged', async ($, on) => {
  stubGitProcess(on)
  on('tool.call', () => ({ result: {} }))
  const command = 'git commit -m "feat(app): git push now"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toBeUndefined()
})

test('a git push with a quoted config value holding a semicolon is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -c a="x;y" push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a destructive git command is denied with the command to run by hand', async ($, on) => {
  stubGit(on)
  const answer = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
  expect(answer.deny).toContain('`! <command>`')
})

test('an amend of a pushed commit is denied when the upstream contains HEAD', async ($, on) => {
  stubGit(on, { 'merge-base --is-ancestor HEAD @{u}': { exitCode: 0, stdout: '' } })
  const answer = await $.tool.call({ tool: 'Bash', command: 'git commit --amend --no-edit' })
  expect(answer.deny).toContain('already pushed')
})

test('a commit with a staged .env file is denied', async ($, on) => {
  stubGit(on, { 'diff --cached --name-only -z': { exitCode: 0, stdout: '.env\0' } })
  const command = 'git commit -m "feat(app): add x (FEAT-1)"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain('.env')
})

test('a commit whose subject lacks the branch ticket key is denied', async ($, on) => {
  stubGit(on, ON_FEAT_1)
  const answer = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat(app): add x"' })
  expect(answer.deny).toContain('needs the suffix (FEAT-1)')
})

test('a commit whose subject has no scope is denied', async ($, on) => {
  stubGit(on, ON_FEAT_1)
  const command = 'git commit -m "feat: add x (FEAT-1)"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain('the subject must start with a type')
})

test('a valid heredoc commit with a clean index reaches the tool', async ($, on) => {
  const received: string[] = []
  stubGitProcess(on, { ...ON_FEAT_1, ...CLEAN_INDEX })
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    received.push(e.command)
    return { result: {} }
  })
  const message = "$(cat <<'EOF'\nfeat(app): add x (FEAT-1)\n\nWhy it matters.\nEOF\n)"
  const command = `git commit -m "${message}"`
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toBeUndefined()
  expect(received).toEqual([command])
})

test('git queries run in the session directory', async ($, on) => {
  const runs = stubGit(on, PUSHED_HEAD)
  await $.tool.call({ tool: 'Bash', command: AMEND })
  expect(runs.length).toBeGreaterThan(0)
  expect(runs.every(run => run.cwd === SESSION_CWD)).toBe(true)
})

test('git queries start with the git executable', async ($, on) => {
  const runs = stubGit(on, PUSHED_HEAD)
  await $.tool.call({ tool: 'Bash', command: AMEND })
  expect(runs.length).toBeGreaterThan(0)
  expect(runs.every(run => run.argv[0] === 'git')).toBe(true)
})

test('a push wins over a destructive command in the same call', async ($, on) => {
  stubGit(on)
  const answer = await $.tool.call({ tool: 'Bash', command: 'git reset --hard && git push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})

test('a destructive restore after a background separator is denied', async ($, on) => {
  stubGit(on)
  const command = 'git restore --staged f & git restore g'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain('git restore')
})

test('a command that is not git runs no git process', async ($, on) => {
  const runs = stubGit(on)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(runs).toEqual([])
})

test('a rebase on a branch without an upstream queries the upstream once', async ($, on) => {
  const runs = stubGit(on)
  await $.tool.call({ tool: 'Bash', command: 'git rebase main' })
  const upstreamQueries = runs.filter(run => run.argv.includes('--abbrev-ref'))
  expect(upstreamQueries).toHaveLength(1)
})
