import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { diffSurface, readSurface } from './surface.mjs'

const surfaceScript = path.join(import.meta.dirname, 'surface.mjs')

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function makeHarness() {
  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-test-'))
  writeFile(path.join(harnessDir, 'rules/common/style.md'), '# Style\n\nwrite plain code\n')
  writeFile(path.join(harnessDir, 'rules/go/style.md'), '---\npaths:\n  - "**/*.go"\n---\nGo rules here\n')
  writeFile(
    path.join(harnessDir, 'skills/demo/SKILL.md'),
    '---\nname: demo\ndescription: "Does a demo thing."\n---\nBody text\n',
  )
  writeFile(path.join(harnessDir, 'hooks/guard.sh'), 'echo guard\n')
  writeFile(path.join(harnessDir, 'settings.json'), '{}\n')
  return harnessDir
}

function makeProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-cli-'))
  fs.mkdirSync(path.join(projectDir, 'lab'))
  fs.copyFileSync(surfaceScript, path.join(projectDir, 'lab/surface.mjs'))
  fs.cpSync(makeHarness(), path.join(projectDir, '.claude'), { recursive: true })
  return projectDir
}

function runCli(projectDir, command) {
  return spawnSync('node', [path.join(projectDir, 'lab/surface.mjs'), command], { encoding: 'utf8' })
}

function surfaceOf(entries) {
  const alwaysLoadedWords = Object.values(entries)
    .filter((entry) => entry.alwaysLoaded)
    .reduce((total, entry) => total + entry.words, 0)
  return { entries, alwaysLoadedWords }
}

function entry(overrides = {}) {
  return { sha256: 'aaa', words: 10, alwaysLoaded: true, ...overrides }
}

test('readSurface keys entries by sorted relative path', () => {
  const { entries } = readSurface(makeHarness())
  assert.deepEqual(Object.keys(entries), [
    'hooks/guard.sh',
    'rules/common/style.md',
    'rules/go/style.md',
    'settings.json',
    'skills/demo/SKILL.md',
  ])
})

test('readSurface records the sha256 of the file content', () => {
  const harnessDir = makeHarness()
  const expected = crypto.createHash('sha256').update('echo guard\n').digest('hex')
  assert.equal(readSurface(harnessDir).entries['hooks/guard.sh'].sha256, expected)
})

test('readSurface counts whitespace-separated words', () => {
  assert.equal(readSurface(makeHarness()).entries['rules/common/style.md'].words, 5)
})

test('readSurface marks a rule without paths frontmatter as always loaded', () => {
  assert.equal(readSurface(makeHarness()).entries['rules/common/style.md'].alwaysLoaded, true)
})

test('readSurface marks a rule with paths frontmatter as not always loaded', () => {
  assert.equal(readSurface(makeHarness()).entries['rules/go/style.md'].alwaysLoaded, false)
})

test('readSurface marks files outside rules as not always loaded', () => {
  assert.equal(readSurface(makeHarness()).entries['hooks/guard.sh'].alwaysLoaded, false)
})

test('readSurface strips quotes from a skill description', () => {
  assert.equal(readSurface(makeHarness()).entries['skills/demo/SKILL.md'].description, 'Does a demo thing.')
})

test('readSurface gives no description to files other than SKILL.md', () => {
  assert.equal('description' in readSurface(makeHarness()).entries['hooks/guard.sh'], false)
})

test('readSurface skips .DS_Store files', () => {
  const harnessDir = makeHarness()
  writeFile(path.join(harnessDir, 'skills/demo/.DS_Store'), 'junk')
  assert.equal('skills/demo/.DS_Store' in readSurface(harnessDir).entries, false)
})

test('readSurface sums the words of always-loaded entries only', () => {
  assert.equal(readSurface(makeHarness()).alwaysLoadedWords, 5)
})

test('diffSurface lists a path present only in the current surface as added', () => {
  const diff = diffSurface(surfaceOf({}), surfaceOf({ 'rules/b.md': entry(), 'rules/a.md': entry() }))
  assert.deepEqual(diff.added, ['rules/a.md', 'rules/b.md'])
})

test('diffSurface lists a path present only in the locked surface as removed', () => {
  const diff = diffSurface(surfaceOf({ 'rules/a.md': entry() }), surfaceOf({}))
  assert.deepEqual(diff.removed, ['rules/a.md'])
})

test('diffSurface lists a path whose sha256 differs as changed', () => {
  const diff = diffSurface(
    surfaceOf({ 'rules/a.md': entry() }),
    surfaceOf({ 'rules/a.md': entry({ sha256: 'bbb' }) }),
  )
  assert.deepEqual(diff.changed, ['rules/a.md'])
})

test('diffSurface does not list a path with the same sha256 as changed', () => {
  const surface = surfaceOf({ 'rules/a.md': entry() })
  assert.deepEqual(diffSurface(surface, surface).changed, [])
})

test('diffSurface lists a changed skill with a new description as descriptionsChanged', () => {
  const skillPath = 'skills/x/SKILL.md'
  const diff = diffSurface(
    surfaceOf({ [skillPath]: entry({ alwaysLoaded: false, description: 'old' }) }),
    surfaceOf({ [skillPath]: entry({ alwaysLoaded: false, sha256: 'bbb', description: 'new' }) }),
  )
  assert.deepEqual(diff.descriptionsChanged, [skillPath])
})

test('diffSurface leaves descriptionsChanged empty when only the body changed', () => {
  const skillPath = 'skills/x/SKILL.md'
  const diff = diffSurface(
    surfaceOf({ [skillPath]: entry({ alwaysLoaded: false, description: 'same' }) }),
    surfaceOf({ [skillPath]: entry({ alwaysLoaded: false, sha256: 'bbb', description: 'same' }) }),
  )
  assert.deepEqual(diff.descriptionsChanged, [])
})

test('diffSurface reports the change in always-loaded words', () => {
  const diff = diffSurface(
    surfaceOf({ 'rules/a.md': entry({ words: 10 }) }),
    surfaceOf({ 'rules/a.md': entry({ sha256: 'bbb', words: 25 }) }),
  )
  assert.equal(diff.alwaysLoadedWordsDelta, 15)
})

test('update writes a lock that ends with a newline', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  assert.ok(fs.readFileSync(path.join(projectDir, 'lab/surface.lock.json'), 'utf8').endsWith('}\n'))
})

test('update twice writes identical lock content', () => {
  const projectDir = makeProject()
  const lockPath = path.join(projectDir, 'lab/surface.lock.json')
  runCli(projectDir, 'update')
  const first = fs.readFileSync(lockPath, 'utf8')
  runCli(projectDir, 'update')
  assert.equal(fs.readFileSync(lockPath, 'utf8'), first)
})

test('check passes with exit code 0 when the surface matches the lock', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  const result = runCli(projectDir, 'check')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /\[PASS\] surface matches the lock/)
})

test('check fails with exit code 1 and names a changed path', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  writeFile(path.join(projectDir, '.claude/hooks/guard.sh'), 'echo changed\n')
  const result = runCli(projectDir, 'check')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /\[FAIL\]/)
  assert.match(result.stdout, /hooks\/guard\.sh/)
})

test('check names an added path', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  writeFile(path.join(projectDir, '.claude/hooks/new.sh'), 'echo new\n')
  assert.match(runCli(projectDir, 'check').stdout, /hooks\/new\.sh/)
})

test('check prints the changed skill description', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  writeFile(
    path.join(projectDir, '.claude/skills/demo/SKILL.md'),
    '---\nname: demo\ndescription: "Brand new wording."\n---\nBody text\n',
  )
  assert.match(runCli(projectDir, 'check').stdout, /Brand new wording\./)
})

test('check tells the reader to run update when the surface differs', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  writeFile(path.join(projectDir, '.claude/hooks/guard.sh'), 'echo changed\n')
  assert.match(runCli(projectDir, 'check').stdout, /node lab\/surface\.mjs update/)
})

test('check fails with the update message when the lock is missing', () => {
  const result = runCli(makeProject(), 'check')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /node lab\/surface\.mjs update/)
})

test('readSurface includes files at the root of the harness directory', () => {
  const harnessDir = makeHarness()
  writeFile(path.join(harnessDir, '.mcp.json'), '{}\n')
  writeFile(path.join(harnessDir, 'statusline-command.sh'), 'echo line\n')
  const paths = Object.keys(readSurface(harnessDir).entries)
  assert.ok(paths.includes('.mcp.json'))
  assert.ok(paths.includes('statusline-command.sh'))
})

test('readSurface includes files in directories other than rules, skills and hooks', () => {
  const harnessDir = makeHarness()
  writeFile(path.join(harnessDir, 'agents/helper.md'), 'agent\n')
  assert.ok('agents/helper.md' in readSurface(harnessDir).entries)
})

test('readSurface excludes the tests directory', () => {
  const harnessDir = makeHarness()
  writeFile(path.join(harnessDir, 'tests/check.sh'), 'echo test\n')
  const paths = Object.keys(readSurface(harnessDir).entries)
  assert.equal(paths.some((entryPath) => entryPath.startsWith('tests/')), false)
})

test('readSurface records an executable file as executable', () => {
  const harnessDir = makeHarness()
  fs.chmodSync(path.join(harnessDir, 'hooks/guard.sh'), 0o755)
  assert.equal(readSurface(harnessDir).entries['hooks/guard.sh'].executable, true)
})

test('readSurface records a non-executable file as not executable', () => {
  const harnessDir = makeHarness()
  fs.chmodSync(path.join(harnessDir, 'hooks/guard.sh'), 0o644)
  assert.equal(readSurface(harnessDir).entries['hooks/guard.sh'].executable, false)
})

test('diffSurface lists a file whose only difference is the executable bit as changed', () => {
  const diff = diffSurface(
    surfaceOf({ 'hooks/a.sh': entry({ executable: false }) }),
    surfaceOf({ 'hooks/a.sh': entry({ executable: true }) }),
  )
  assert.deepEqual(diff.changed, ['hooks/a.sh'])
})

test('check fails when only the executable bit of a file changes', () => {
  const projectDir = makeProject()
  fs.chmodSync(path.join(projectDir, '.claude/hooks/guard.sh'), 0o644)
  runCli(projectDir, 'update')
  fs.chmodSync(path.join(projectDir, '.claude/hooks/guard.sh'), 0o755)
  const result = runCli(projectDir, 'check')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /changed: hooks\/guard\.sh/)
})

test('readSurface records the link target of a symlink', () => {
  const harnessDir = makeHarness()
  fs.symlinkSync('guard.sh', path.join(harnessDir, 'hooks/alias.sh'))
  assert.equal(readSurface(harnessDir).entries['hooks/alias.sh'].linkTarget, 'guard.sh')
})

test('readSurface does not hash the file a symlink points at', () => {
  const harnessDir = makeHarness()
  fs.symlinkSync('guard.sh', path.join(harnessDir, 'hooks/alias.sh'))
  assert.equal('sha256' in readSurface(harnessDir).entries['hooks/alias.sh'], false)
})

test('readSurface records a dangling symlink without throwing', () => {
  const harnessDir = makeHarness()
  fs.symlinkSync('missing.sh', path.join(harnessDir, 'hooks/dangling.sh'))
  assert.equal(readSurface(harnessDir).entries['hooks/dangling.sh'].linkTarget, 'missing.sh')
})

test('readSurface does not recurse into a symlink to a directory', () => {
  const harnessDir = makeHarness()
  fs.symlinkSync('../rules', path.join(harnessDir, 'hooks/rules-link'))
  const paths = Object.keys(readSurface(harnessDir).entries)
  assert.equal(readSurface(harnessDir).entries['hooks/rules-link'].linkTarget, '../rules')
  assert.equal(paths.some((entryPath) => entryPath.startsWith('hooks/rules-link/')), false)
})

test('diffSurface lists a retargeted symlink as changed', () => {
  const diff = diffSurface(
    surfaceOf({ 'hooks/a': { linkTarget: 'one', words: 0, alwaysLoaded: false, executable: false } }),
    surfaceOf({ 'hooks/a': { linkTarget: 'two', words: 0, alwaysLoaded: false, executable: false } }),
  )
  assert.deepEqual(diff.changed, ['hooks/a'])
})

function descriptionOf(frontmatterLines) {
  const harnessDir = makeHarness()
  writeFile(
    path.join(harnessDir, 'skills/demo/SKILL.md'),
    `---\nname: demo\n${frontmatterLines}\n---\nBody\n`,
  )
  return readSurface(harnessDir).entries['skills/demo/SKILL.md'].description
}

test('readSurface reads a folded description whole', () => {
  assert.equal(descriptionOf('description: >\n  First line.\n  Second line.'), 'First line. Second line.')
})

test('readSurface reads a literal description with its line breaks', () => {
  assert.equal(descriptionOf('description: |\n  First line.\n  Second line.'), 'First line.\nSecond line.')
})

test('readSurface reads a plain description with indented continuation lines whole', () => {
  assert.equal(descriptionOf('description: First part\n  second part'), 'First part second part')
})

test('readSurface stops a folded description at the next frontmatter key', () => {
  assert.equal(descriptionOf('description: >-\n  Only this.\nlicense: MIT'), 'Only this.')
})

test('check output includes the always-loaded word total with its delta', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  writeFile(path.join(projectDir, '.claude/rules/common/style.md'), '# Style\n\nwrite plain code now\n')
  assert.match(runCli(projectDir, 'check').stdout, /always-loaded words: 6 \(\+1\)/)
})

test('check output includes a removed line', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  fs.rmSync(path.join(projectDir, '.claude/hooks/guard.sh'))
  assert.match(runCli(projectDir, 'check').stdout, /^removed: hooks\/guard\.sh$/m)
})

test('check prints FAIL when the lock is missing', () => {
  assert.match(runCli(makeProject(), 'check').stdout, /\[FAIL\]/)
})

test('update writes entries in sorted path order', () => {
  const projectDir = makeProject()
  runCli(projectDir, 'update')
  const lock = JSON.parse(fs.readFileSync(path.join(projectDir, 'lab/surface.lock.json'), 'utf8'))
  const paths = Object.keys(lock.entries)
  assert.deepEqual(paths, [...paths].sort())
})

test('alwaysLoadedWordsDelta falls when a rule gains paths frontmatter', () => {
  const harnessDir = makeHarness()
  const before = readSurface(harnessDir)
  writeFile(
    path.join(harnessDir, 'rules/common/style.md'),
    '---\npaths:\n  - "**/*.ts"\n---\n# Style\n\nwrite plain code\n',
  )
  assert.equal(diffSurface(before, readSurface(harnessDir)).alwaysLoadedWordsDelta, -5)
})
