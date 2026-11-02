import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.claude/hooks/block-git-commands',
)

function runHook(stdin) {
  return spawnSync(HOOK_PATH, [], { input: stdin, encoding: 'utf8', timeout: 5000 })
}

function runBash(command) {
  return runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }))
}

const blockedCommands = [
  'git push',
  'git push origin main',
  'git push --force',
  'git push -f origin HEAD',
  'git -C . push',
  'git -C /some/dir push origin HEAD',
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
  'eval "git push"',
  'eval git push',
  'echo $(git push)',
  'echo `git push`',
  '(git push)',
  '(cd . && git push)',
  'FOO=bar git push',
  'FOO=bar BAZ=qux git push',
  'env git push',
  'env FOO=bar git push',
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
  './git push',
  "git 'push'",
  'git "push"',
  'git pu""sh',
  'git -c alias.x=push x',
  'git -c user.name=a push',
  'git --git-dir=.git push',
  'git --git-dir .git push',
  'git --work-tree=. push',
  'git --namespace=a push',
  'git --exec-path=/x push',
  'git -p push',
  'git --no-pager push',
  'git --paginate push',
  'git --bare push',
  'git --no-replace-objects push',
  'git --literal-pathspecs push',
  'git reset --hard',
  'git reset --hard HEAD~1',
  'git reset HEAD~1 --hard',
  'git clean -f',
  'git clean -fd',
  'git clean -xfd',
  'git clean -df',
  'git clean --force',
  'git checkout .',
  'git -C . checkout .',
  'git restore .',
  'git branch -D feature',
  'git rebase',
  'git rebase -i HEAD~3',
  'git rebase main',
  'sh <<EOF\ngit push\nEOF',
  'bash <<EOF\ngit push\nEOF',
  'cat <<EOF | sh\ngit push\nEOF',
  'echo ok && sh -c "git push"',
  '>/dev/null git push',
  '2>/dev/null git push',
  '</dev/null git push',
  '2>&1 git push',
  '> out.log git push',
  'git branch --delete --force x',
  'git branch -d -f x',
  'git branch -fd x',
  'git branch -df x',
  "x=$(cat <<'EOF'\n(\nEOF\n); git push",
]

const allowedCommands = [
  'git commit -m "fix git push"',
  'git commit -m \'git push\'',
  'echo "git push"',
  "echo 'git push'",
  'echo git push',
  'grep "git push" README.md',
  'grep -r "git push" .',
  'git log --grep=push',
  'git status',
  'git stash push',
  'git stash push -m "git push"',
  'git fetch',
  'git fetch origin',
  'git reset --soft HEAD~1',
  'git reset',
  'git checkout main',
  'git checkout -b feature',
  'git checkout file.txt',
  'git restore file.txt',
  'git branch -d x',
  'git branch',
  'git clean -n',
  'git clean -nd',
  'git remote -v',
  'git add .',
  'git diff',
  'ls -la',
  'true',
  "cat <<'EOF'\ngit push origin main\nEOF",
  'cat <<EOF\ngit push\nEOF',
  'cat <<"EOF" > notes.md\nRun git push now.\nEOF',
  'cat <<-EOF\n\tgit push\n\tEOF',
  'echo "$(date)"',
  'echo "a && git push"',
  'git -C . status',
  'git -c user.name=a status',
  '/usr/bin/git status',
  'sh -c "echo git push"',
  'bash -c \'git status\'',
  'FOO=bar git status',
  'env FOO=bar git status',
  'env -i ls',
  'timeout 5 git status',
  'sudo ls',
  'xargs echo',
  'git -c alias.x=status x',
  'echo done # git push',
  'python3 -c "print(1)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: don\'t crash\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: unbalanced ( paren\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nfix: unbalanced \" quote\nEOF\n)"',
  'gh pr create --body "$(cat <<\'EOF\'\n## Summary\n- it\'s (done)\nEOF\n)"',
  'git branch -d x',
  'git branch -f x main',
  "echo $'it\\'s'",
  'echo hi >/dev/null',
  'echo hi 2>&1',
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
  ['git branch --delete --force x', /git branch -D/],
  ['git push origin main', /git push/],
  ['git -C . push', /git push/],
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

test('a push after a heredoc substitution is reported as a block, not as an analysis failure', () => {
  const result = runBash("x=$(cat <<'EOF'\n(\nEOF\n); git push")
  assert.doesNotMatch(result.stderr, /could not be analysed/)
})

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

test('a Grep tool call is allowed', () => {
  const payload = { tool_name: 'Grep', tool_input: { pattern: 'git push' } }
  assert.equal(runHook(JSON.stringify(payload)).status, 0)
})

const failClosedCases = [
  ['stdin is not valid JSON', 'not json'],
  ['stdin is empty', ''],
  ['the Bash command is missing', JSON.stringify({ tool_name: 'Bash', tool_input: {} })],
  ['the Bash command is not a string', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } })],
  ['the Bash tool_input is missing', JSON.stringify({ tool_name: 'Bash' })],
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
