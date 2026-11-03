import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.claude/hooks/block-git-commands.mjs',
)

function runHook(stdin) {
  return spawnSync(HOOK_PATH, [], { input: stdin, encoding: 'utf8', timeout: 5000 })
}

function runBash(command) {
  return runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }))
}

const blockedCommands = [
  'git push',
  'git -C . push',
  'cd . && git push',
  'echo hi; git push',
  'echo hi || git push',
  'true | git push',
  'sleep 1 & git push',
  'echo hi\ngit push',
  'sh -c "git push"',
  'sh -c "git -C . push origin HEAD"',
  'bash -c \'git push\'',
  'zsh -c "git push"',
  'sh -lc "git push"',
  'sh -c "sh -c \\"git push\\""',
  'eval git push',
  'echo $(git push)',
  'echo `git push`',
  '(git push)',
  'FOO=bar git push',
  'env git push',
  'env -i FOO=bar git push',
  'command git push',
  'exec git push',
  'nohup git push',
  'nice git push',
  'time git push',
  'timeout 5 git push',
  'sudo git push',
  'xargs git push',
  '/usr/bin/git push',
  "git 'push'",
  'git "push"',
  'git pu""sh',
  'git -c alias.x=push x',
  'git -c user.name=a push',
  'git --git-dir .git push',
  'git --no-pager push',
  'git reset --hard',
  'git reset HEAD~1 --hard',
  'git clean -f',
  'git clean -xfd',
  'git clean -df',
  'git clean --force',
  'git checkout .',
  'git restore .',
  'git branch -D feature',
  'git rebase',
  'sh <<EOF\ngit push\nEOF',
  'cat <<EOF | sh\ngit push\nEOF',
  '>/dev/null git push',
  '2>/dev/null git push',
  '2>&1 git push',
  'git branch --delete --force x',
  'git branch -d -f x',
  'git branch -fd x',
  'git branch -df x',
  "x=$(cat <<'EOF'\n(\nEOF\n); git push",
]

const allowedCommands = [
  'git commit -m "fix git push"',
  'echo "git push"',
  "echo 'git push'",
  'echo git push',
  'grep "git push" README.md',
  'git log --grep=push',
  'git status',
  'git stash push',
  'git fetch',
  'git reset --soft HEAD~1',
  'git checkout main',
  'git restore file.txt',
  'git branch -d x',
  'git clean -n',
  'git add .',
  "cat <<'EOF'\ngit push origin main\nEOF",
  'cat <<EOF\ngit push\nEOF',
  'cat <<"EOF" > notes.md\nRun git push now.\nEOF',
  'cat <<-EOF\n\tgit push\n\tEOF',
  'echo "$(date)"',
  'echo "a && git push"',
  'sh -c "echo git push"',
  'git -c alias.x=status x',
  'echo done # git push',
  'python3 -c "print(1)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: don\'t crash\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: unbalanced ( paren\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: unbalanced \" quote\nEOF\n)"',
  'git branch -f x main',
  "echo $'it\\'s'",
]

for (const command of blockedCommands) {
  test(`blocks the command ${JSON.stringify(command)} with exit status 2`, () => {
    assert.equal(runBash(command).status, 2)
  })
}

for (const command of allowedCommands) {
  test(`allows the command ${JSON.stringify(command)} with exit status 0`, () => {
    assert.equal(runBash(command).status, 0)
  })
}

const blockedMessageCases = [
  ["x=$(cat <<'EOF'\n(\nEOF\n); git push", /git push/],
  ['git push origin main', /git push/],
  ['sh -c "git reset --hard"', /git reset --hard/],
  ['git clean -fd', /git clean/],
  ['git rebase main', /git rebase/],
  ['git branch -D x', /git branch -D/],
  ['git checkout .', /git checkout \./],
  ['git restore .', /git restore \./],
]

for (const [command, pattern] of blockedMessageCases) {
  test(`the message for ${JSON.stringify(command)} names the blocked command`, () => {
    assert.match(runBash(command).stderr, pattern)
  })
}

test('the block message tells the user to run the command themselves', () => {
  assert.match(runBash('git push').stderr, /user (must )?runs? (it|the command) themselves|run (it|the command) themselves/i)
})

test('an allowed command writes nothing to stderr', () => {
  assert.equal(runBash('git status').stderr, '')
})

test('a tool other than Bash is allowed even when its input mentions git push', () => {
  const payload = { tool_name: 'Write', tool_input: { command: 'git push' } }
  assert.equal(runHook(JSON.stringify(payload)).status, 0)
})

const failClosedCases = [
  ['stdin is not valid JSON', 'not json'],
  ['the Bash command is missing', JSON.stringify({ tool_name: 'Bash', tool_input: {} })],
  ['the Bash command is not a string', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } })],
  ['a single quote is unterminated', JSON.stringify({ tool_name: 'Bash', tool_input: { command: "echo 'abc" } })],
  ['a double quote is unterminated', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo "abc' } })],
  ['a quote is unterminated inside sh -c', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'sh -c "echo \'abc"' } })],
]

for (const [description, stdin] of failClosedCases) {
  test(`exits with status 2 when ${description}`, () => {
    assert.equal(runHook(stdin).status, 2)
  })

  test(`says that the command could not be analysed when ${description}`, () => {
    assert.match(runHook(stdin).stderr, /could not be analysed/)
  })
}

function runHookCopyBesidePackageType(packageType) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-package-type-'))
  try {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ type: packageType }))
    const hookCopy = path.join(projectDir, path.basename(HOOK_PATH))
    fs.copyFileSync(HOOK_PATH, hookCopy)
    fs.chmodSync(hookCopy, 0o755)
    const stdin = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } })
    return spawnSync(hookCopy, [], { input: stdin, encoding: 'utf8', timeout: 5000 })
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
}

for (const packageType of ['module', 'commonjs']) {
  test(`allows git status when the hook sits beside a package.json of type ${packageType}`, () => {
    assert.equal(runHookCopyBesidePackageType(packageType).status, 0)
  })
}
