import { expect, test } from 'claude-code/testing'
import type { RunGit } from './run-git'
import { stagedSecretsDenial } from './staged-secrets'

interface FailedRun {
  readonly failedWith: string
}

interface GitSession {
  runGit: RunGit
  ranCommands: string[]
}

function gitSession(outputs: Record<string, string | FailedRun>): GitSession {
  const ranCommands: string[] = []
  const runGit: RunGit = async args => {
    const command = ['git', ...args].join(' ')
    ranCommands.push(command)
    const output = outputs[command]
    if (output === undefined) return { exitCode: 1, stdout: '' }
    if (typeof output === 'string') return { exitCode: 0, stdout: output }
    return { exitCode: 128, stdout: output.failedWith }
  }
  return { runGit, ranCommands }
}

function nul(...fields: string[]): string {
  return fields.map(field => `${field}\0`).join('')
}

const STAGED = 'git diff --cached --name-only -z'
const UNSTAGED = 'git diff --name-only -z'
const STATUS = 'git status --porcelain -z --untracked-files=all'
const COMMIT = 'git commit -m x'
const ADD_ALL_THEN_COMMIT = 'git add -A && git commit -m x'

function denialFor(paths: string): string {
  return (
    `Secret files must not be committed (rules/common/security.md): ${paths}. ` +
    'Unstage them with `git restore --staged <file>`, ' +
    'and add untracked ones to .gitignore or remove them.'
  )
}

async function denialForStaged(
  stagedPaths: string[],
  command = COMMIT,
): Promise<string | undefined> {
  const { runGit } = gitSession({ [STAGED]: nul(...stagedPaths) })
  return stagedSecretsDenial(runGit, command)
}

test('a command without a commit passes', async () => {
  const { runGit } = gitSession({ [STAGED]: nul('.env') })
  expect(await stagedSecretsDenial(runGit, 'git status')).toBeUndefined()
})

test('a command without a commit runs no git process', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: nul('.env') })
  await stagedSecretsDenial(runGit, 'git status')
  expect(ranCommands).toEqual([])
})

test('a staged .env is denied', async () => {
  expect(await denialForStaged(['.env'])).toBe(denialFor('.env'))
})

test('a staged config/.env.local is denied', async () => {
  expect(await denialForStaged(['config/.env.local'])).toBe(denialFor('config/.env.local'))
})

const SECRET_PATHS = [
  'certs/server.pem',
  'certs/server.key',
  'certs/bundle.p12',
  'certs/bundle.pfx',
  'id_rsa',
  'id_ed25519',
]

for (const secret of SECRET_PATHS) {
  test(`a staged ${secret} is denied`, async () => {
    expect(await denialForStaged([secret])).toBe(denialFor(secret))
  })
}

for (const template of ['.env.example', '.env.sample', '.env.dist', '.env.template']) {
  test(`a staged ${template} passes`, async () => {
    expect(await denialForStaged([template])).toBeUndefined()
  })
}

test('a clean staged list passes', async () => {
  expect(await denialForStaged(['src/app.ts', 'README.md'])).toBeUndefined()
})

test('a staged non-ASCII name ending in .pem is denied', async () => {
  expect(await denialForStaged(['certs/clé.pem'])).toBe(denialFor('certs/clé.pem'))
})

test('a staged upper-case extension is denied', async () => {
  expect(await denialForStaged(['Server.PEM'])).toBe(denialFor('Server.PEM'))
})

test('a staged upper-case .ENV is denied', async () => {
  expect(await denialForStaged(['.ENV'])).toBe(denialFor('.ENV'))
})

test('a staged upper-case .env.EXAMPLE passes', async () => {
  expect(await denialForStaged(['.env.EXAMPLE'])).toBeUndefined()
})

test('git commit -a checks the unstaged tracked changes', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [UNSTAGED]: nul('.env') })
  expect(await stagedSecretsDenial(runGit, 'git commit -a -m x')).toBe(denialFor('.env'))
})

test('git commit -am reads the unstaged tracked changes', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: '', [UNSTAGED]: nul('src/a.ts') })
  await stagedSecretsDenial(runGit, 'git commit -am "x"')
  expect(ranCommands).toContain(UNSTAGED)
})

test('git commit --all reads the unstaged tracked changes', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: '', [UNSTAGED]: nul('src/a.ts') })
  await stagedSecretsDenial(runGit, 'git commit --all -m x')
  expect(ranCommands).toContain(UNSTAGED)
})

test('a commit without -a does not read the unstaged changes', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: '', [UNSTAGED]: nul('.env') })
  expect(await stagedSecretsDenial(runGit, COMMIT)).toBeUndefined()
  expect(ranCommands).not.toContain(UNSTAGED)
})

test('paths after a standalone -- are checked', async () => {
  expect(await denialForStaged([], 'git commit -m x -- .env')).toBe(denialFor('.env'))
})

test('quoted paths after a standalone -- are checked without their quotes', async () => {
  const denial = await denialForStaged([], 'git commit -m x -- "my dir/id_rsa"')
  expect(denial).toBe(denialFor('my dir/id_rsa'))
})

test('paths after -- are checked when the message holds a semicolon', async () => {
  expect(await denialForStaged([], 'git commit -m "a; b" -- .env')).toBe(denialFor('.env'))
})

test('git add followed by commit reads the status', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: '', [STATUS]: nul('A  .env') })
  await stagedSecretsDenial(runGit, 'git add .env && git commit -m x')
  expect(ranCommands).toContain(STATUS)
})

test('a secret named by git add is denied from the status', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: nul('A  .env') })
  const denial = await stagedSecretsDenial(runGit, 'git add .env && git commit -m x')
  expect(denial).toBe(denialFor('.env'))
})

test('git add -A followed by commit denies an untracked .env', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: nul('?? .env', '?? src/new.ts') })
  expect(await stagedSecretsDenial(runGit, ADD_ALL_THEN_COMMIT)).toBe(denialFor('.env'))
})

test('a commit without a git add segment does not read the status', async () => {
  const { runGit, ranCommands } = gitSession({ [STAGED]: '', [STATUS]: nul('?? .env') })
  expect(await stagedSecretsDenial(runGit, COMMIT)).toBeUndefined()
  expect(ranCommands).not.toContain(STATUS)
})

test('a rename status entry yields the new path', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: nul('R  .env', 'old.txt') })
  expect(await stagedSecretsDenial(runGit, ADD_ALL_THEN_COMMIT)).toBe(denialFor('.env'))
})

test('a rename status entry yields the old path', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: nul('R  new.txt', '.env') })
  expect(await stagedSecretsDenial(runGit, ADD_ALL_THEN_COMMIT)).toBe(denialFor('.env'))
})

test('a status path with spaces is read whole', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: nul('?? my dir/server.key') })
  const denial = await stagedSecretsDenial(runGit, ADD_ALL_THEN_COMMIT)
  expect(denial).toBe(denialFor('my dir/server.key'))
})

test('a non-zero exit of the staged listing contributes no paths', async () => {
  const { runGit } = gitSession({ [STAGED]: { failedWith: nul('.env') } })
  expect(await stagedSecretsDenial(runGit, COMMIT)).toBeUndefined()
})

test('a non-zero exit of git status contributes no paths', async () => {
  const { runGit } = gitSession({ [STAGED]: '', [STATUS]: { failedWith: nul('?? .env') } })
  expect(await stagedSecretsDenial(runGit, ADD_ALL_THEN_COMMIT)).toBeUndefined()
})

test('the same secret reported twice is listed once', async () => {
  const { runGit } = gitSession({ [STAGED]: nul('.env'), [STATUS]: nul('A  .env') })
  expect(await stagedSecretsDenial(runGit, 'git add . && git commit -m x')).toBe(denialFor('.env'))
})

test('secrets are listed in first-seen order', async () => {
  const { runGit } = gitSession({ [STAGED]: nul('keys/a.pem', '.env') })
  expect(await stagedSecretsDenial(runGit, COMMIT)).toBe(denialFor('keys/a.pem, .env'))
})

test('a secret path named after the message without -- is denied', async () => {
  expect(await denialForStaged([], 'git commit -m "x" .env')).toBe(denialFor('.env'))
})

test('a key path named after the message without -- is denied', async () => {
  expect(await denialForStaged([], 'git commit -m "x" id_rsa')).toBe(denialFor('id_rsa'))
})

test('a clean path after a combined -am message passes', async () => {
  expect(await denialForStaged([], 'git commit -am "feat(a): b" src/app.ts')).toBeUndefined()
})

test('a message that looks like a secret path is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m .env')).toBeUndefined()
})

test('the argument of --message is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit --message .env')).toBeUndefined()
})

test('the argument of a value-taking flag is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x -F .env')).toBeUndefined()
})

test('a path after a --author= single token is still a path candidate', async () => {
  const denial = await denialForStaged([], 'git commit --author=a -m x .env')
  expect(denial).toBe(denialFor('.env'))
})

test('a heredoc body with a stray double quote does not leak path candidates', async () => {
  const command = 'git commit -m "$(cat <<\'EOF\'\nIgnore "config and .env\nEOF\n)"'
  expect(await denialForStaged([], command)).toBeUndefined()
})

test('the argument of --trailer is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit --trailer .env -m x')).toBeUndefined()
})

test('the argument of --cleanup is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit --cleanup .env -m x')).toBeUndefined()
})

test('the argument of --reuse-message is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit --reuse-message .env')).toBeUndefined()
})

test('the argument of --reedit-message is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit --reedit-message .env')).toBeUndefined()
})

test('a redirect target after the commit is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x > .env')).toBeUndefined()
})

test('an append redirect target is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x >> .env')).toBeUndefined()
})

test('a stderr redirect target is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x 2> .env')).toBeUndefined()
})

test('a redirect target attached to the operator is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x >.env')).toBeUndefined()
})

test('a command with commit only as a word prefix yields no path candidates', async () => {
  expect(await denialForStaged([], 'git commit-tree .env')).toBeUndefined()
})

test('a pathspec on the heredoc marker line is checked', async () => {
  const denial = await denialForStaged([], "git commit -F - <<'EOF' .env\nbody\nEOF")
  expect(denial).toBe(denialFor('.env'))
})

test('a path after a 2>&1 redirect is checked', async () => {
  expect(await denialForStaged([], 'git commit -m x 2>&1 .env')).toBe(denialFor('.env'))
})

test('a path after an &> redirect target is checked', async () => {
  expect(await denialForStaged([], 'git commit -m x &>/dev/null .env')).toBe(denialFor('.env'))
})

test('the target of a spaced &> redirect is not a path candidate', async () => {
  expect(await denialForStaged([], 'git commit -m x &> .env')).toBeUndefined()
})

test('a command after a lone & is not part of the commit segment', async () => {
  expect(await denialForStaged([], 'git commit -m x & touch .env')).toBeUndefined()
})

test('a path attached to a redirect operator is checked', async () => {
  expect(await denialForStaged([], 'git commit -m x .env>/dev/null')).toBe(denialFor('.env'))
})

test('a path attached to an &> operator is checked', async () => {
  expect(await denialForStaged([], 'git commit -m x .env&>/dev/null')).toBe(denialFor('.env'))
})
