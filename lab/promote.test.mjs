import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { classifyEntryChanges, claudeCanary, failingTestNames, formatPreview, formatPromotionFailure, formatStamp, opencodeCanary, parseClaudeCanaryOutput, previewTarget, promote, runPreflight } from './promote.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'promote-test-'))
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

test('formatStamp formats a fixed date as YYYYMMDD-HHMMSS', () => {
  assert.equal(formatStamp(new Date(2026, 10, 5, 9, 4, 7)), '20261105-090407')
})

test('failingTestNames extracts the names of not ok lines and ignores ok lines', () => {
  const tapText = [
    'ok 1 - passes',
    'not ok 2 - second failure',
    '    not ok 1 - nested failure',
    'not ok 3 - second failure',
    '    ok 2 - nested pass',
  ].join('\n')
  assert.deepEqual(failingTestNames(tapText), ['nested failure', 'second failure'])
})

const gitGuardPath = '/home/x/.claude/mods/git-guard'
const skipRouterSentence = 'You can skip the router when all three criteria hold.'

function streamJson({ plugins, resultText }) {
  return [
    { type: 'system', subtype: 'init', plugins },
    { type: 'assistant', message: {} },
    { type: 'result', subtype: 'success', result: resultText },
  ].map((event) => JSON.stringify(event)).join('\n')
}

const gitGuardPlugin = { name: 'git-guard', path: gitGuardPath, source: 'git-guard@inline' }

test('parseClaudeCanaryOutput passes when the git-guard plugin is loaded and both lines match', () => {
  const output = streamJson({ plugins: [gitGuardPlugin], resultText: `\n${skipRouterSentence}\n\nNO\n` })
  assert.equal(parseClaudeCanaryOutput(output, gitGuardPath).ok, true)
})

test('parseClaudeCanaryOutput fails when the git-guard plugin is missing from init', () => {
  const output = streamJson({ plugins: [], resultText: `${skipRouterSentence}\nNO` })
  const outcome = parseClaudeCanaryOutput(output, gitGuardPath)
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /git-guard/)
})

test('parseClaudeCanaryOutput fails when the second line is YES', () => {
  const output = streamJson({ plugins: [gitGuardPlugin], resultText: `${skipRouterSentence}\nYES` })
  const outcome = parseClaudeCanaryOutput(output, gitGuardPath)
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /YES/)
})

test('parseClaudeCanaryOutput passes when the first line is wrapped in double quotes', () => {
  const output = streamJson({ plugins: [gitGuardPlugin], resultText: `"${skipRouterSentence}"\nNO` })
  assert.equal(parseClaudeCanaryOutput(output, gitGuardPath).ok, true)
})

function readTree(rootDir) {
  const files = {}
  const walk = (directory) => {
    for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, dirent.name)
      if (dirent.isDirectory()) walk(entryPath)
      else files[path.relative(rootDir, entryPath)] = fs.readFileSync(entryPath, 'utf8')
    }
  }
  walk(rootDir)
  return files
}

function makeTarget() {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'rules/common/kept.md'), 'repo kept')
  writeFile(path.join(sourceDir, 'skills/demo/SKILL.md'), 'repo skill')
  writeFile(path.join(sourceDir, 'mods/sample/index.ts'), 'mod code')
  writeFile(path.join(sourceDir, 'mods/sample/tsconfig.json'), '{}')
  writeFile(path.join(sourceDir, 'settings.json'), JSON.stringify({ shared: 'repo', scalar: 'repo' }))
  writeFile(path.join(targetDir, 'rules/common/kept.md'), 'old kept')
  writeFile(path.join(targetDir, 'rules/common/deleted-in-source.md'), 'stale rule')
  writeFile(path.join(targetDir, 'skills/teach/SKILL.md'), 'local skill')
  writeFile(path.join(targetDir, 'runtime/session.log'), 'runtime data')
  writeFile(path.join(targetDir, 'settings.json'), JSON.stringify({ autoMode: true, scalar: 'local' }))
  return { name: 'claude', flavour: 'claude', sourceDir, targetDir }
}

test('previewTarget leaves the target unchanged', () => {
  const target = makeTarget()
  const before = readTree(target.targetDir)
  const preview = previewTarget(target)
  assert.deepEqual(readTree(target.targetDir), before)
  const rulesEntry = preview.entries.find((entry) => entry.relativePath === 'rules')
  assert.ok(rulesEntry.lines.some((line) => line.includes('deleted-in-source.md')))
})

test('previewTarget lists a skill that exists only in the target', () => {
  assert.deepEqual(previewTarget(makeTarget()).targetOnly, ['skills/teach'])
})

const passingCanary = async () => ({ ok: true, detail: 'stub canary passed' })
const failingCanary = async () => ({ ok: false, detail: 'stub canary failed' })

function promoteTarget(target, canaries = [passingCanary]) {
  return promote({
    targets: [target],
    backupRoot: path.join(makeTempDir(), 'backups'),
    stamp: '20261105-090407',
    canaries,
    log: () => {},
  })
}

test('promote removes a rule that was deleted in the source', async () => {
  const target = makeTarget()
  await promoteTarget(target)
  assert.equal(fs.existsSync(path.join(target.targetDir, 'rules/common/deleted-in-source.md')), false)
})

test('promote keeps a skill that exists only in the target', async () => {
  const target = makeTarget()
  await promoteTarget(target)
  assert.equal(fs.readFileSync(path.join(target.targetDir, 'skills/teach/SKILL.md'), 'utf8'), 'local skill')
})

test('promote does not copy the tsconfig.json of a mod', async () => {
  const target = makeTarget()
  await promoteTarget(target)
  assert.equal(fs.existsSync(path.join(target.targetDir, 'mods/sample/index.ts')), true)
  assert.equal(fs.existsSync(path.join(target.targetDir, 'mods/sample/tsconfig.json')), false)
})

test('promote keeps a local-only key in settings.json', async () => {
  const target = makeTarget()
  await promoteTarget(target)
  const settings = JSON.parse(fs.readFileSync(path.join(target.targetDir, 'settings.json'), 'utf8'))
  assert.equal(settings.autoMode, true)
})

test('promote gives a conflicting scalar in settings.json the repository value', async () => {
  const target = makeTarget()
  await promoteTarget(target)
  const settings = JSON.parse(fs.readFileSync(path.join(target.targetDir, 'settings.json'), 'utf8'))
  assert.equal(settings.scalar, 'repo')
})

test('a failing canary restores the target including the removal of an added file', async () => {
  const target = makeTarget()
  const before = readTree(target.targetDir)
  const outcome = await promoteTarget(target, [failingCanary])
  assert.equal(outcome.ok, false)
  assert.equal(outcome.restored, true)
  assert.deepEqual(readTree(target.targetDir), before)
})

test('a backup failure leaves the target untouched', async () => {
  const target = makeTarget()
  const before = readTree(target.targetDir)
  const backupRoot = path.join(makeTempDir(), 'not-a-directory')
  writeFile(backupRoot, 'regular file')
  const outcome = await promote({ targets: [target], backupRoot, stamp: '20261105-090407', canaries: [], log: () => {} })
  assert.equal(outcome.ok, false)
  assert.deepEqual(readTree(target.targetDir), before)
})

test('runPreflight tells the user to commit or stash uncommitted harness changes', () => {
  const repoDir = makeTempDir()
  spawnSync('git', ['init', '--quiet'], { cwd: repoDir })
  writeFile(path.join(repoDir, '.claude/rules/new-rule.md'), 'rule')
  const problems = runPreflight(repoDir)
  assert.ok(problems.some((problem) => problem.includes('.claude/') && /commit or stash/.test(problem)))
})

test('runPreflight names the integrity command when it exits non-zero', () => {
  const repoDir = makeTempDir()
  spawnSync('git', ['init', '--quiet'], { cwd: repoDir })
  writeFile(path.join(repoDir, 'lab/integrity.mjs'), 'console.error("tampered"); process.exit(1)')
  writeFile(path.join(repoDir, 'lab/surface.mjs'), 'process.exit(0)')
  const problems = runPreflight(repoDir)
  const integrityProblem = problems.find((problem) => problem.includes('node lab/integrity.mjs'))
  assert.match(integrityProblem, /tampered/)
  assert.match(integrityProblem, /fix it in the repository first/)
})

test('runPreflight reports no problems for a clean repository whose checks pass', () => {
  const repoDir = makeTempDir()
  spawnSync('git', ['init', '--quiet'], { cwd: repoDir })
  writeFile(path.join(repoDir, 'lab/integrity.mjs'), 'process.exit(0)')
  writeFile(path.join(repoDir, 'lab/surface.mjs'), 'process.exit(0)')
  assert.deepEqual(runPreflight(repoDir), [])
})

test('formatPreview shows each conflict as path: local -> repo', () => {
  const text = formatPreview([previewTarget(makeTarget())])
  assert.match(text, /scalar: "local" -> "repo"/)
})

test('formatPreview lists a rule that will be deleted under Deleted', () => {
  const text = formatPreview([previewTarget(makeTarget())])
  assert.match(text, /Deleted \(1\)\n {4}rules\/common\/deleted-in-source\.md/)
  assert.doesNotMatch(text, />f\+|\*deleting/)
})

const emptyChanges = { added: [], changed: [], deleted: [] }

test('formatPreview shows the groups with their counts in order and omits empty groups', () => {
  const allGroups = { added: ['a.md'], changed: ['b.md', 'c.md'], deleted: ['d.md'] }
  const text = formatPreview([{ name: 'x', changes: allGroups, jsonEntries: [], targetOnly: [] }])
  assert.equal(text, 'Harness x\n  Added (1)\n    a.md\n  Changed (2)\n    b.md\n    c.md\n  Deleted (1)\n    d.md')
  const onlyAdded = formatPreview([{ name: 'x', changes: { ...emptyChanges, added: ['a.md'] }, jsonEntries: [], targetOnly: [] }])
  assert.equal(onlyAdded, 'Harness x\n  Added (1)\n    a.md')
})

test('formatPreview says no changes for a target with nothing to change', () => {
  const text = formatPreview([{ name: 'x', changes: emptyChanges, jsonEntries: [], targetOnly: [] }])
  assert.equal(text, 'Harness x\n  no changes')
})

test('a JSON entry that differs from the target appears in changed with a merged suffix', () => {
  assert.ok(previewTarget(makeTarget()).changes.changed.includes('settings.json (merged)'))
})

test('a JSON entry whose target file is missing appears in added', () => {
  const target = makeTarget()
  fs.rmSync(path.join(target.targetDir, 'settings.json'))
  assert.ok(previewTarget(target).changes.added.includes('settings.json (merged)'))
})

test('a JSON entry equal to the target adds nothing', () => {
  const target = makeTarget()
  writeFile(path.join(target.targetDir, 'settings.json'), JSON.stringify({ shared: 'repo', scalar: 'repo' }))
  const { added, changed } = previewTarget(target).changes
  assert.equal([...added, ...changed].some((displayPath) => displayPath.includes('settings.json')), false)
})

const directoryEntry = { relativePath: 'rules', kind: 'directory' }

test('classifyEntryChanges puts new, modified and removed files in their groups prefixed with the entry path', () => {
  const lines = ['>f+++++++++ new.md', '>f.st....... edited.md', '*deleting   gone.md']
  assert.deepEqual(classifyEntryChanges(directoryEntry, lines), { added: ['rules/new.md'], changed: ['rules/edited.md'], deleted: ['rules/gone.md'] })
})

test('classifyEntryChanges ignores a deleted folder line and counts only its files', () => {
  const lines = ['*deleting   old/inner.md', '*deleting   old/', 'cd+++++++++ fresh/']
  assert.deepEqual(classifyEntryChanges(directoryEntry, lines), { added: [], changed: [], deleted: ['rules/old/inner.md'] })
})

test('classifyEntryChanges uses the entry path itself for a file entry', () => {
  const fileEntry = { relativePath: 'CLAUDE.md', kind: 'file' }
  assert.deepEqual(classifyEntryChanges(fileEntry, ['>f.st....... CLAUDE.md']).changed, ['CLAUDE.md'])
})

test('formatPreview lists skills that exist only in the target under an only in target heading', () => {
  const text = formatPreview([previewTarget(makeTarget())])
  assert.match(text, /solo en destino \(only in target\)[\s\S]*skills\/teach/)
})

test('formatPreview lists local keys that will be kept', () => {
  const text = formatPreview([previewTarget(makeTarget())])
  assert.match(text, /kept local keys: autoMode/)
})

function makeTestsDir(testBodies) {
  const testsDir = makeTempDir()
  for (const [fileName, body] of Object.entries(testBodies)) {
    writeFile(path.join(testsDir, fileName), `import { test } from 'node:test'\n${body}\n`)
  }
  return testsDir
}

const failingTestBody = "test('known failure', () => { throw new Error('boom') })"
const passingTestBody = "test('fine', () => {})"

test('opencodeCanary passes when both directories fail the same tests', () => {
  const repoTestsDir = makeTestsDir({ 'a.test.mjs': failingTestBody, 'b.test.mjs': passingTestBody })
  const targetTestsDir = makeTestsDir({ 'a.test.mjs': failingTestBody })
  assert.equal(opencodeCanary({ repoTestsDir, targetTestsDir }).ok, true)
})

test('opencodeCanary passes when the live directory fails a subset of the repository failures, including none', () => {
  const repoTestsDir = makeTestsDir({ 'a.test.mjs': failingTestBody })
  const targetTestsDir = makeTestsDir({ 'a.test.mjs': passingTestBody })
  assert.equal(opencodeCanary({ repoTestsDir, targetTestsDir }).ok, true)
})

test('opencodeCanary names the test that fails only in the target', () => {
  const repoTestsDir = makeTestsDir({ 'a.test.mjs': passingTestBody })
  const targetTestsDir = makeTestsDir({ 'a.test.mjs': failingTestBody })
  const outcome = opencodeCanary({ repoTestsDir, targetTestsDir })
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /known failure/)
})

function makeFakeClaudeDir(scriptBody) {
  const binDir = makeTempDir()
  const scriptPath = path.join(binDir, 'claude')
  writeFile(scriptPath, `#!/bin/sh\n${scriptBody}\n`)
  fs.chmodSync(scriptPath, 0o755)
  return binDir
}

const claudeDir = '/home/x/.claude'
const passingStream = streamJson({
  plugins: [{ name: 'git-guard', path: `${claudeDir}/mods/git-guard` }],
  resultText: `${skipRouterSentence}\nNO`,
}).replaceAll("'", "'\\''")

test('claudeCanary passes when claude reports the git-guard plugin and both lines', () => {
  const binDir = makeFakeClaudeDir(`[ -z "$CLAUDE_CONFIG_DIR" ] || exit 9\n[ -z "$CLAUDECODE" ] || exit 9\nprintf '%s' '${passingStream}'`)
  const outcome = claudeCanary({ claudeDir, environment: { PATH: binDir, CLAUDE_CONFIG_DIR: '/elsewhere', CLAUDECODE: '1' } })
  assert.equal(outcome.ok, true)
})

test('claudeCanary says that claude is not on the PATH when it cannot be found', () => {
  const outcome = claudeCanary({ claudeDir, environment: { PATH: makeTempDir() } })
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /claude is not on the PATH/)
})

test('claudeCanary reports the exit code and error output when claude exits non-zero', () => {
  const binDir = makeFakeClaudeDir("echo 'Please run /login' >&2\nexit 1")
  const outcome = claudeCanary({ claudeDir, environment: { PATH: binDir } })
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /exit 1/)
  assert.match(outcome.detail, /Please run \/login/)
})

test('the command line exits with status 2 and a usage line for an unknown argument', () => {
  const result = spawnSync('node', [path.join(import.meta.dirname, 'promote.mjs'), '--bogus'], { encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage: node lab\/promote\.mjs/)
})

test('opencodeCanary fails and names the directory when the live tests directory has no test files', () => {
  const repoTestsDir = makeTestsDir({ 'a.test.mjs': passingTestBody })
  const targetTestsDir = makeTempDir()
  const outcome = opencodeCanary({ repoTestsDir, targetTestsDir })
  assert.equal(outcome.ok, false)
  assert.ok(outcome.detail.includes(targetTestsDir))
})

test('opencodeCanary fails when a test run ends without a TAP plan line', () => {
  const killedRunnerBody = "process.kill(process.ppid, 'SIGKILL')"
  const repoTestsDir = makeTestsDir({ 'a.test.mjs': killedRunnerBody })
  const targetTestsDir = makeTestsDir({ 'a.test.mjs': killedRunnerBody })
  const outcome = opencodeCanary({ repoTestsDir, targetTestsDir })
  assert.equal(outcome.ok, false)
  assert.match(outcome.detail, /no TAP plan/)
})

test('promote reports both reasons and the backup directory when the restore also fails', async () => {
  const target = makeTarget()
  const backupRoot = path.join(makeTempDir(), 'backups')
  const removeBackupThenFail = async () => {
    fs.rmSync(backupRoot, { recursive: true, force: true })
    return { ok: false, detail: 'stub canary failed' }
  }
  const outcome = await promote({ targets: [target], backupRoot, stamp: '20261105-090407', canaries: [removeBackupThenFail], log: () => {} })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.restored, false)
  assert.equal(outcome.backupDir, path.join(backupRoot, '20261105-090407'))
  assert.match(outcome.reason, /stub canary failed; restore also failed: No backup named/)
})

test('formatPromotionFailure gives the backup path and the manual restore command', () => {
  const text = formatPromotionFailure({ ok: false, restored: false, reason: 'boom', backupDir: '/b/20261105-090407' }, '20261105-090407')
  assert.match(text, /\/b\/20261105-090407/)
  assert.match(text, /node lab\/promote\.mjs --restore 20261105-090407/)
})

test('claudeCanary removes its temporary working directory after the run', () => {
  const recordFile = path.join(makeTempDir(), 'cwd.txt')
  const binDir = makeFakeClaudeDir(`pwd > '${recordFile}'\nexit 1`)
  claudeCanary({ claudeDir, environment: { PATH: binDir } })
  assert.equal(fs.existsSync(fs.readFileSync(recordFile, 'utf8').trim()), false)
})

test('previewTarget does not list an identical single-file entry as changed', () => {
  const target = makeTarget()
  writeFile(path.join(target.sourceDir, 'statusline-command.sh'), 'same script')
  writeFile(path.join(target.targetDir, 'statusline-command.sh'), 'same script')
  assert.equal(previewTarget(target).changes.changed.includes('statusline-command.sh'), false)
})

test('previewTarget lists a single-file entry whose content differs as changed', () => {
  const target = makeTarget()
  writeFile(path.join(target.sourceDir, 'statusline-command.sh'), 'new script')
  writeFile(path.join(target.targetDir, 'statusline-command.sh'), 'old script')
  assert.equal(previewTarget(target).changes.changed.includes('statusline-command.sh'), true)
})
