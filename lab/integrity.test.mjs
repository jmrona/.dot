import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  REQUIRED_DENY_ENTRIES,
  findBrokenHooks,
  findBrokenReferences,
  findMissingBashBlockHook,
  findInvalidRuleFrontmatter,
  findMissingDenyEntries,
} from './integrity.mjs'

function makeHarnessDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-test-'))
}

function writeFile(harnessDir, relativePath, content, mode = 0o644) {
  const filePath = path.join(harnessDir, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, { mode })
  fs.chmodSync(filePath, mode)
}

function writeSettings(harnessDir, settings) {
  writeFile(harnessDir, 'settings.json', JSON.stringify(settings))
}

function settingsWithHook(command) {
  return { hooks: { PreToolUse: [{ matcher: 'x', hooks: [{ type: 'command', command }] }] } }
}

test('a backticked reference to a missing file is reported with citing file and reference', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', 'See `../_shared/missing.md` now.')
  const failures = findBrokenReferences(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /skills\/demo\/SKILL\.md/)
  assert.match(failures[0], /\.\.\/_shared\/missing\.md/)
})

test('a backticked reference to an existing file is not reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/_shared/present.md', 'x')
  writeFile(harnessDir, 'skills/demo/SKILL.md', 'See `../_shared/present.md` now.')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a markdown link target to a missing file is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', 'See [prompt](./reviewer-prompt.md).')
  assert.equal(findBrokenReferences(harnessDir).length, 1)
})

test('a rules reference resolved from a skill directory is checked against the rules directory', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/common/workflow.md', 'x')
  writeFile(harnessDir, 'skills/demo/SKILL.md', '`../../rules/common/workflow.md`')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('common rules citing a sibling with dot-slash resolve against the rules directory', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/common/language.md', 'x')
  writeFile(harnessDir, 'rules/common/prose.md', 'See `./language.md` and `./absent.md`.')
  const failures = findBrokenReferences(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /absent\.md/)
})

test('a reference inside a fenced code block is ignored', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', '```\n`./missing.md`\n```\n')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a bare path outside backticks and links is ignored', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', 'Plain ./missing.md text.')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a language rule without frontmatter is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/go/style.md', '# Go')
  const failures = findInvalidRuleFrontmatter(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /rules\/go\/style\.md/)
})

test('a language rule with a paths list is accepted', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/go/style.md', '---\npaths:\n  - "**/*.go"\n---\n# Go')
  assert.deepEqual(findInvalidRuleFrontmatter(harnessDir), [])
})

test('a language rule with an empty paths list is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/go/style.md', '---\npaths:\n---\n# Go')
  assert.equal(findInvalidRuleFrontmatter(harnessDir).length, 1)
})

test('a rule using globs is reported even under common', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/common/style.md', '---\nglobs:\n  - "*.go"\n---\n# x')
  const failures = findInvalidRuleFrontmatter(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /globs/)
})

test('a common rule with paths is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/common/style.md', '---\npaths:\n  - "*.go"\n---\n# x')
  assert.equal(findInvalidRuleFrontmatter(harnessDir).length, 1)
})

test('a common rule without frontmatter is accepted', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/common/style.md', '# x')
  assert.deepEqual(findInvalidRuleFrontmatter(harnessDir), [])
})

test('a required deny entry absent from settings is reported by name', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, { permissions: { deny: ['Bash(a)'] } })
  const failures = findMissingDenyEntries(harnessDir, ['Bash(a)', 'Bash(b)'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /Bash\(b\)/)
})

test('settings holding every required deny entry produce no failure', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, { permissions: { deny: ['Bash(a)'] } })
  assert.deepEqual(findMissingDenyEntries(harnessDir, ['Bash(a)']), [])
})

test('settings without a deny list report every required entry', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, {})
  assert.equal(findMissingDenyEntries(harnessDir, ['Bash(a)', 'Bash(b)']).length, 2)
})

test('the required deny entries are exactly the eight destructive git commands and git push', () => {
  assert.deepEqual(REQUIRED_DENY_ENTRIES, [
    'Bash(git push --force:*)',
    'Bash(git push -f:*)',
    'Bash(git reset --hard:*)',
    'Bash(git clean -f:*)',
    'Bash(git checkout .:*)',
    'Bash(git restore .:*)',
    'Bash(git branch -D:*)',
    'Bash(git rebase:*)',
    'Bash(git push:*)',
  ])
})

test('a missing settings file yields a deny failure instead of throwing', () => {
  const failures = findMissingDenyEntries(makeHarnessDir(), ['Bash(a)'])
  assert.equal(failures.length, 1)
  assert.match(failures[0], /settings\.json/)
})

test('a missing settings file yields a hook failure instead of throwing', () => {
  const failures = findBrokenHooks(makeHarnessDir())
  assert.equal(failures.length, 1)
  assert.match(failures[0], /settings\.json/)
})

test('a hook command whose file is missing is reported', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/gone'))
  const failures = findBrokenHooks(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /gone/)
})

test('a hook file that is not executable is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'hooks/plain', '#!/bin/sh\nexit 0\n', 0o644)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/plain'))
  const failures = findBrokenHooks(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /executable/)
})

test('an executable hook exiting zero is accepted', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'hooks/good', '#!/bin/sh\nexit 0\n', 0o755)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/good'))
  assert.deepEqual(findBrokenHooks(harnessDir), [])
})

test('a hook exiting non-zero is reported with its exit status', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'hooks/bad', '#!/bin/sh\nexit 3\n', 0o755)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/bad'))
  const failures = findBrokenHooks(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /3/)
})

test('a command outside the hooks directory is reported as unrecognised', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, settingsWithHook('bash ~/other.sh'))
  const failures = findBrokenHooks(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /unrecognised hook command/)
})

test('a hook command followed by arguments resolves the file without them', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'hooks/good', '#!/bin/sh\nexit 0\n', 0o755)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/good --flag value'))
  assert.deepEqual(findBrokenHooks(harnessDir), [])
})

test('a hook that outlives the timeout is reported as timed out', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'hooks/slow', '#!/bin/sh\nexec sleep 30\n', 0o755)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/slow'))
  const failures = findBrokenHooks(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /timed out/)
})

test('a reference containing a placeholder is not reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', '`./<name>.md` `./*.md` `./{a,b}.md`')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a reference inside an indented fence is ignored', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', '- item\n  ```\n  `./missing.md`\n  ```\n')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a reference inside a tilde fence is ignored', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/SKILL.md', '~~~\n`./missing.md`\n~~~\n')
  assert.deepEqual(findBrokenReferences(harnessDir), [])
})

test('a link target with a fragment is checked against its file part', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/demo/y.md', 'x')
  writeFile(harnessDir, 'skills/demo/SKILL.md', '[a](./y.md#frag) [b](./gone.md#frag)')
  const failures = findBrokenReferences(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /gone\.md/)
})

test('a link target with a title is checked against its file part', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'skills/SKILL.md', '[a](./gone.md "title")')
  assert.equal(findBrokenReferences(harnessDir).length, 1)
})

test('a language rule with an inline paths list is accepted', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/go/style.md', '---\npaths: ["**/*.go", "go.mod"]\n---\n# Go')
  assert.deepEqual(findInvalidRuleFrontmatter(harnessDir), [])
})

test('a language rule with an empty inline paths list is reported', () => {
  const harnessDir = makeHarnessDir()
  writeFile(harnessDir, 'rules/go/style.md', '---\npaths: []\n---\n# Go')
  assert.equal(findInvalidRuleFrontmatter(harnessDir).length, 1)
})

test('findBrokenHooks sends a benign Bash payload on stdin', () => {
  const harnessDir = makeHarnessDir()
  const script = '#!/usr/bin/env node\nconst input = require("node:fs").readFileSync(0, "utf8")\nprocess.exit(JSON.parse(input).tool_input.command === "true" ? 0 : 2)\n'
  writeFile(harnessDir, 'hooks/strict', script, 0o755)
  writeSettings(harnessDir, settingsWithHook('~/.claude/hooks/strict'))
  assert.deepEqual(findBrokenHooks(harnessDir), [])
})

function settingsWithBashHook(hook) {
  return { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '~/.claude/hooks/block-git-commands.mjs', ...hook }] }] } }
}

test('a PreToolUse Bash hook with onFailure block produces no failure', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, settingsWithBashHook({ onFailure: 'block' }))
  assert.deepEqual(findMissingBashBlockHook(harnessDir), [])
})

test('a PreToolUse Bash hook without onFailure block is reported by name', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, settingsWithBashHook({}))
  const failures = findMissingBashBlockHook(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /PreToolUse Bash hook with onFailure block/)
})

test('settings without any hooks report the missing PreToolUse Bash hook', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, {})
  assert.equal(findMissingBashBlockHook(harnessDir).length, 1)
})

test('a Grep matcher hook does not satisfy the PreToolUse Bash hook check', () => {
  const harnessDir = makeHarnessDir()
  const settings = settingsWithBashHook({ onFailure: 'block' })
  settings.hooks.PreToolUse[0].matcher = 'Grep|Glob'
  writeSettings(harnessDir, settings)
  assert.equal(findMissingBashBlockHook(harnessDir).length, 1)
})

test('a missing settings file yields a Bash hook failure instead of throwing', () => {
  const failures = findMissingBashBlockHook(makeHarnessDir())
  assert.equal(failures.length, 1)
  assert.match(failures[0], /settings\.json/)
})

test('a Bash hook with onFailure block that runs another script is reported', () => {
  const harnessDir = makeHarnessDir()
  writeSettings(harnessDir, settingsWithBashHook({ onFailure: 'block', command: '~/.claude/hooks/other-guard' }))
  const failures = findMissingBashBlockHook(harnessDir)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /block-git-commands/)
})
