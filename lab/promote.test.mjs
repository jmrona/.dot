import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { claudeCanary, failingTestNames, findUncommittedHarnessChanges, formatPreview, formatStamp, opencodeCanary, parseClaudeCanaryOutput, previewTarget, promote, runPreflight } from './promote.mjs'

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

test('findUncommittedHarnessChanges reports an uncommitted file under .claude', () => {
  const repoDir = makeTempDir()
  spawnSync('git', ['init', '--quiet'], { cwd: repoDir })
  writeFile(path.join(repoDir, '.claude/rules/new-rule.md'), 'rule')
  const changes = findUncommittedHarnessChanges(repoDir)
  assert.ok(changes.some((line) => line.includes('.claude/')))
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

test('previewTarget reports local-only keys kept and scalar conflicts for a JSON entry', () => {
  const preview = previewTarget(makeTarget())
  const settings = preview.jsonEntries.find((entry) => entry.relativePath === 'settings.json')
  assert.equal(settings.changed, true)
  assert.deepEqual(settings.keptLocal, ['autoMode'])
  assert.deepEqual(settings.conflicts, [{ path: 'scalar', local: 'local', repo: 'repo' }])
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

test('formatPreview lists the rsync line of a rule that will be deleted', () => {
  const text = formatPreview([previewTarget(makeTarget())])
  assert.match(text, /deleting.*deleted-in-source\.md/)
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
  const binDir = makeFakeClaudeDir(`[ -z "$CLAUDE_CONFIG_DIR" ] || exit 9\nprintf '%s' '${passingStream}'`)
  const outcome = claudeCanary({ claudeDir, environment: { PATH: binDir, CLAUDE_CONFIG_DIR: '/elsewhere' } })
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
