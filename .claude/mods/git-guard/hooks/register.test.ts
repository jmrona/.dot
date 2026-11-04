import { expect, test } from 'claude-code/testing'

const PUSH_DENIAL = 'Pushes are forbidden (rules/common/git.md). Tell the user what to push.'
const TRAILER_DENIAL = 'Commit messages must not carry Co-Authored-By (rules/common/git.md).'

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
  on('tool.call', () => ({ result: {} }))
  const command = "git commit -m 'feat: x\n\nco-authored-by: Someone <a@b.c>'"
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit behind a wrapper carrying Co-Authored-By is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const command = 'env X=1 git -C "my dir" commit -m "x Co-Authored-By: A"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit without Co-Authored-By reaches the tool unchanged', async ($, on) => {
  const received: string[] = []
  on('tool.call', { tool: 'Bash' }, (_, e) => {
    received.push(e.command)
    return { result: {} }
  })
  const command = "git commit -m 'feat: x'"
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
  on('tool.call', () => ({ result: {} }))
  const command = 'git -c user.name="A B" commit -m "x Co-Authored-By: y"'
  const answer = await $.tool.call({ tool: 'Bash', command })
  expect(answer.deny).toContain(TRAILER_DENIAL)
})

test('a commit message that mentions push reaches the tool unchanged', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git commit -m "git push now"' })
  expect(answer.deny).toBeUndefined()
})

test('a git push with a quoted config value holding a semicolon is denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const answer = await $.tool.call({ tool: 'Bash', command: 'git -c a="x;y" push' })
  expect(answer.deny).toContain(PUSH_DENIAL)
})