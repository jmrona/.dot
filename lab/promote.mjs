import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBackup, restoreBackup } from './promote/backup.mjs'
import { mergeJson, writeJsonAtomically } from './promote/json-merge.mjs'
import { listManagedEntries, listTargetOnlyEntries, mirrorEntry } from './promote/managed-paths.mjs'

function padTwoDigits(value) {
  return String(value).padStart(2, '0')
}

export function formatStamp(date) {
  const day = `${date.getFullYear()}${padTwoDigits(date.getMonth() + 1)}${padTwoDigits(date.getDate())}`
  const time = `${padTwoDigits(date.getHours())}${padTwoDigits(date.getMinutes())}${padTwoDigits(date.getSeconds())}`
  return `${day}-${time}`
}

export function failingTestNames(tapText) {
  const names = [...tapText.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim())
  return [...new Set(names)].sort()
}

function parseEvents(streamJsonText) {
  return streamJsonText.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

function hasGitGuardPlugin(events, expectedGitGuardPath) {
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init')
  return Array.isArray(init?.plugins) && init.plugins.some((plugin) => plugin.path === expectedGitGuardPath)
}

const EXPECTED_FIRST_LINE = 'You can skip the router when all three criteria hold.'
const EXPECTED_SECOND_LINE = 'NO'

function resultLines(events) {
  const resultEvent = events.find((event) => event.type === 'result')
  if (typeof resultEvent?.result !== 'string') return []
  return resultEvent.result.split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

function describeLineMismatch([firstLine, secondLine]) {
  if (firstLine !== EXPECTED_FIRST_LINE) {
    return `line 1 of the answer is "${firstLine}" instead of the router sentence, so the rules were not loaded`
  }
  if (secondLine !== EXPECTED_SECOND_LINE) {
    return `line 2 of the answer is "${secondLine}" instead of "${EXPECTED_SECOND_LINE}", so consistency.md was loaded`
  }
  return null
}

export function parseClaudeCanaryOutput(streamJsonText, expectedGitGuardPath) {
  const events = parseEvents(streamJsonText)
  if (!hasGitGuardPlugin(events, expectedGitGuardPath)) {
    return { ok: false, detail: `the init event does not list the git-guard plugin at ${expectedGitGuardPath}` }
  }
  const mismatch = describeLineMismatch(resultLines(events))
  if (mismatch) return { ok: false, detail: mismatch }
  return { ok: true, detail: 'the git-guard plugin is loaded and both answer lines match' }
}

export function findUncommittedHarnessChanges(repoDir) {
  const result = spawnSync('git', ['status', '--porcelain', '--', '.claude', '.opencode'], { cwd: repoDir, encoding: 'utf8' })
  return result.stdout.split('\n').filter((line) => line.trim() !== '')
}

function displayPathFor(entry, itemPath) {
  return entry.kind === 'directory' ? `${entry.relativePath}/${itemPath}` : entry.relativePath
}

function itemPathOf(line) {
  return line.slice(line.indexOf(' ') + 1).trim()
}

function classifyLine(line) {
  if (line.startsWith('*deleting')) return itemPathOf(line).endsWith('/') ? null : 'deleted'
  if (line.startsWith('>f+++++++')) return 'added'
  return line.startsWith('>f') ? 'changed' : null
}

export function classifyEntryChanges(entry, lines) {
  const changes = { added: [], changed: [], deleted: [] }
  for (const line of lines) {
    const group = classifyLine(line)
    if (group) changes[group].push(displayPathFor(entry, itemPathOf(line)))
  }
  return changes
}

function jsonEntryChanges(entry) {
  const displayPath = `${entry.relativePath} (merged)`
  if (!entry.changed) return { added: [], changed: [], deleted: [] }
  return entry.targetExisted ? { added: [], changed: [displayPath], deleted: [] } : { added: [displayPath], changed: [], deleted: [] }
}

function combineChanges(changesList) {
  return {
    added: changesList.flatMap((changes) => changes.added),
    changed: changesList.flatMap((changes) => changes.changed),
    deleted: changesList.flatMap((changes) => changes.deleted),
  }
}

function compareSingleFileEntry({ sourceDir, targetDir }, entry) {
  const targetPath = path.join(targetDir, entry.relativePath)
  if (!fs.existsSync(targetPath)) return { added: [entry.relativePath], changed: [], deleted: [] }
  const isSame = fs.readFileSync(targetPath).equals(fs.readFileSync(path.join(sourceDir, entry.relativePath)))
  return { added: [], changed: isSame ? [] : [entry.relativePath], deleted: [] }
}

function entryChanges(target, entry) {
  return entry.kind === 'file' ? compareSingleFileEntry(target, entry) : classifyEntryChanges(entry, entry.lines)
}

function previewMirroredEntry({ sourceDir, targetDir }, entry) {
  return { relativePath: entry.relativePath, kind: entry.kind, lines: mirrorEntry(sourceDir, targetDir, entry, { dryRun: true }) }
}

function readJsonOrEmpty(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {}
}

function previewJsonEntry({ sourceDir, targetDir }, entry) {
  const targetExisted = fs.existsSync(path.join(targetDir, entry.relativePath))
  const localValue = readJsonOrEmpty(path.join(targetDir, entry.relativePath))
  const repoValue = readJsonOrEmpty(path.join(sourceDir, entry.relativePath))
  const { merged, conflicts, keptLocal } = mergeJson(localValue, repoValue)
  const changed = JSON.stringify(merged) !== JSON.stringify(localValue)
  return { relativePath: entry.relativePath, changed: changed || !targetExisted, targetExisted, keptLocal, conflicts }
}

export function previewTarget(target) {
  const managedEntries = listManagedEntries(target.sourceDir, target.flavour)
  const jsonEntries = managedEntries.filter((entry) => entry.kind === 'json')
  const mirroredEntries = managedEntries.filter((entry) => entry.kind !== 'json')
  const entries = mirroredEntries.map((entry) => previewMirroredEntry(target, entry))
  const previewedJsonEntries = jsonEntries.map((entry) => previewJsonEntry(target, entry))
  return {
    name: target.name,
    entries,
    jsonEntries: previewedJsonEntries,
    changes: combineChanges([...entries.map((entry) => entryChanges(target, entry)), ...previewedJsonEntries.map(jsonEntryChanges)]),
    targetOnly: listTargetOnlyEntries(target.sourceDir, target.targetDir, target.flavour),
  }
}

function mergeJsonEntry({ sourceDir, targetDir }, entry) {
  const targetPath = path.join(targetDir, entry.relativePath)
  const { merged } = mergeJson(readJsonOrEmpty(targetPath), readJsonOrEmpty(path.join(sourceDir, entry.relativePath)))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  writeJsonAtomically(targetPath, merged)
}

export function applyTarget(target) {
  for (const entry of listManagedEntries(target.sourceDir, target.flavour)) {
    if (entry.kind === 'json') mergeJsonEntry(target, entry)
    else mirrorEntry(target.sourceDir, target.targetDir, entry, { dryRun: false })
  }
}

function managedRelativePaths(target) {
  return listManagedEntries(target.sourceDir, target.flavour).map((entry) => entry.relativePath)
}

function tryCreateBackup({ targets, backupRoot, stamp }) {
  try {
    const backupTargets = targets.map((target) => ({ name: target.name, targetDir: target.targetDir, relativePaths: managedRelativePaths(target) }))
    return { backupDir: createBackup({ backupRoot, stamp, targets: backupTargets }) }
  } catch (error) {
    return { failure: `Could not back up the live harness, so nothing was changed: ${error.message}` }
  }
}

async function applyAndCheck(targets, canaries, log) {
  try {
    targets.forEach(applyTarget)
    for (const canary of canaries) {
      const outcome = await canary()
      log(`canary: ${outcome.detail}`)
      if (!outcome.ok) return outcome.detail
    }
  } catch (error) {
    return error.message
  }
  return null
}

export async function promote({ targets, backupRoot, stamp, canaries, log }) {
  const { backupDir, failure } = tryCreateBackup({ targets, backupRoot, stamp })
  if (failure) return { ok: false, reason: failure }
  log(`backup written to ${backupDir}`)
  const reason = await applyAndCheck(targets, canaries, log)
  if (reason === null) return { ok: true, backupDir }
  return restoreAfterFailure({ backupRoot, stamp, backupDir, reason, log })
}

function restoreAfterFailure({ backupRoot, stamp, backupDir, reason, log }) {
  try {
    restoreBackup({ backupRoot, stamp })
  } catch (error) {
    return { ok: false, restored: false, reason: `${reason}; restore also failed: ${error.message}`, backupDir }
  }
  log(`restored the live harness from ${backupDir}`)
  return { ok: false, restored: true, reason, backupDir }
}

const PREFLIGHT_COMMANDS = [
  ['lab/integrity.mjs'],
  ['lab/surface.mjs', 'check'],
]
const OUTPUT_TAIL_LINES = 15

function outputTail(result) {
  const lines = `${result.stdout}${result.stderr}`.split('\n').filter((line) => line.trim() !== '')
  return lines.slice(-OUTPUT_TAIL_LINES).join('\n')
}

function describeFailedCommand(commandArguments, result) {
  const commandText = `node ${commandArguments.join(' ')}`
  return `${commandText} failed (exit ${result.status}). You must fix it in the repository first. Output:\n${outputTail(result)}`
}

function runPreflightCommands(repoDir) {
  return PREFLIGHT_COMMANDS.flatMap((commandArguments) => {
    const result = spawnSync('node', commandArguments, { cwd: repoDir, encoding: 'utf8' })
    return result.status === 0 ? [] : [describeFailedCommand(commandArguments, result)]
  })
}

export function runPreflight(repoDir) {
  const uncommitted = findUncommittedHarnessChanges(repoDir)
  const uncommittedProblems = uncommitted.length === 0
    ? []
    : [`The harness has uncommitted changes. You must commit or stash them first:\n${uncommitted.join('\n')}`]
  return [...uncommittedProblems, ...runPreflightCommands(repoDir)]
}

const CHANGE_GROUPS = [['added', 'Added'], ['changed', 'Changed'], ['deleted', 'Deleted']]

function formatChanges(changes) {
  const groups = CHANGE_GROUPS.filter(([key]) => changes[key].length > 0)
  if (groups.length === 0) return ['  no changes']
  return groups.flatMap(([key, title]) => [`  ${title} (${changes[key].length})`, ...changes[key].map((displayPath) => `    ${displayPath}`)])
}

function formatConflict({ path: keyPath, local, repo }) {
  return `      ${keyPath}: ${JSON.stringify(local)} -> ${JSON.stringify(repo)}`
}

function formatJsonEntry(entry) {
  if (!entry.changed) return []
  const keptLine = entry.keptLocal.length > 0 ? [`    kept local keys: ${entry.keptLocal.join(', ')}`] : []
  const conflictLines = entry.conflicts.length > 0 ? ['    conflicts (the repository wins):', ...entry.conflicts.map(formatConflict)] : []
  return [`  ${entry.relativePath} (merged)`, ...keptLine, ...conflictLines]
}

function formatTargetOnly(targetOnly) {
  if (targetOnly.length === 0) return []
  return ['  solo en destino (only in target), never deleted:', ...targetOnly.map((relativePath) => `    ${relativePath}`)]
}

function formatTargetPreview(preview) {
  return [
    `Harness ${preview.name}`,
    ...formatChanges(preview.changes),
    ...preview.jsonEntries.flatMap(formatJsonEntry),
    ...formatTargetOnly(preview.targetOnly),
  ].join('\n')
}

export function formatPreview(previews) {
  return previews.map(formatTargetPreview).join('\n\n')
}

function listTestFiles(testsDir) {
  if (!fs.existsSync(testsDir)) return []
  return fs.readdirSync(testsDir).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => path.join(testsDir, name))
}

function collectFailingTestNames(testsDir) {
  const testFiles = listTestFiles(testsDir)
  if (testFiles.length === 0) return { problem: `${testsDir} has no *.test.mjs files to run` }
  const { NODE_TEST_CONTEXT: _outerTestRun, ...environment } = process.env
  const result = spawnSync('node', ['--test', '--test-reporter=tap', ...testFiles], { encoding: 'utf8', env: environment })
  if (result.error) return { problem: `the tests in ${testsDir} could not run: ${result.error.message}` }
  if (!/^1\.\.\d+$/m.test(result.stdout)) return { problem: `the tests in ${testsDir} produced no TAP plan line (exit ${result.status})` }
  return { names: failingTestNames(result.stdout) }
}

function namesMissingFrom(names, referenceNames) {
  return names.filter((name) => !referenceNames.includes(name))
}

export function opencodeCanary({ repoTestsDir, targetTestsDir }) {
  const runs = [collectFailingTestNames(repoTestsDir), collectFailingTestNames(targetTestsDir)]
  const problem = runs.find((run) => run.problem)
  if (problem) return { ok: false, detail: problem.problem }
  const newFailures = namesMissingFrom(runs[1].names, runs[0].names)
  if (newFailures.length === 0) return { ok: true, detail: 'every test that fails in the live opencode directory also fails in the repository' }
  return { ok: false, detail: `these tests fail in the live opencode directory but not in the repository: ${newFailures.join(', ')}` }
}

const CLAUDE_CANARY_QUESTION = "Answer in two lines. Line 1: quote the first sentence under the heading 'The Short Path for Small Changes' in your instructions, or write NONE. Line 2: write YES if your instructions contain a file named consistency.md, otherwise NO."
const CLAUDE_CANARY_TIMEOUT_MS = 180_000

function describeSpawnFailure(result) {
  if (result.error?.code === 'ENOENT') return 'claude is not on the PATH. Install Claude Code or add it to the PATH.'
  if (result.error?.code === 'ETIMEDOUT') return 'claude did not answer within 180 seconds. Check the network and try again.'
  if (result.error) return `claude could not start: ${result.error.message}`
  if (result.status !== 0) return `claude failed (exit ${result.status}). If it is not logged in, run claude and use /login. Output: ${result.stderr.trim() || result.stdout.trim()}`
  return null
}

export function claudeCanary({ claudeDir, environment = process.env }) {
  const { CLAUDE_CONFIG_DIR: _configDirectory, CLAUDECODE: _nestingMarker, ...canaryEnvironment } = environment
  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-canary-'))
  const result = spawnSync(
    'claude',
    ['-p', CLAUDE_CANARY_QUESTION, '--model', 'haiku', '--output-format', 'stream-json', '--verbose'],
    { cwd: workingDirectory, env: canaryEnvironment, encoding: 'utf8', timeout: CLAUDE_CANARY_TIMEOUT_MS },
  )
  fs.rmSync(workingDirectory, { recursive: true, force: true })
  const failure = describeSpawnFailure(result)
  if (failure) return { ok: false, detail: failure }
  return parseClaudeCanaryOutput(result.stdout, path.join(claudeDir, 'mods', 'git-guard'))
}

const USAGE = 'Usage: node lab/promote.mjs [--apply | --restore <stamp>]'

function buildRealTargets(repoDir, homeDir) {
  return [
    { name: 'claude', flavour: 'claude', sourceDir: path.join(repoDir, '.claude'), targetDir: path.join(homeDir, '.claude') },
    { name: 'opencode', flavour: 'opencode', sourceDir: path.join(repoDir, '.opencode'), targetDir: path.join(homeDir, '.config', 'opencode') },
  ]
}

function buildRealCanaries(repoDir, homeDir) {
  return [
    async () => claudeCanary({ claudeDir: path.join(homeDir, '.claude') }),
    async () => opencodeCanary({
      repoTestsDir: path.join(repoDir, '.opencode', 'tests'),
      targetTestsDir: path.join(homeDir, '.config', 'opencode', 'tests'),
    }),
  ]
}

function printPreview(repoDir, homeDir) {
  console.log(formatPreview(buildRealTargets(repoDir, homeDir).map(previewTarget)))
}

function printProblems(problems) {
  console.error(problems.join('\n\n'))
  return 1
}

function runPreview(repoDir, homeDir) {
  const problems = runPreflight(repoDir)
  if (problems.length > 0) return printProblems(problems)
  printPreview(repoDir, homeDir)
  return 0
}

export function formatPromotionFailure(outcome, stamp) {
  const lines = [`Promotion failed: ${outcome.reason}`]
  if (outcome.backupDir) {
    lines.push(`Backup: ${outcome.backupDir}`, `To restore it by hand, run: node lab/promote.mjs --restore ${stamp}`)
  }
  return lines.join('\n')
}

async function runApply(repoDir, homeDir) {
  const problems = runPreflight(repoDir)
  if (problems.length > 0) return printProblems(problems)
  printPreview(repoDir, homeDir)
  const stamp = formatStamp(new Date())
  const outcome = await promote({
    targets: buildRealTargets(repoDir, homeDir),
    backupRoot: path.join(homeDir, '.harness-backups'),
    stamp,
    canaries: buildRealCanaries(repoDir, homeDir),
    log: console.log,
  })
  if (outcome.ok) console.log(`Promotion finished. Backup: ${outcome.backupDir}`)
  else console.error(formatPromotionFailure(outcome, stamp))
  return outcome.ok ? 0 : 1
}

function runRestore(homeDir, stamp) {
  try {
    restoreBackup({ backupRoot: path.join(homeDir, '.harness-backups'), stamp })
    console.log(`Restored the live harness from backup ${stamp}.`)
    return 0
  } catch (error) {
    console.error(error.message)
    return 1
  }
}

export async function runCli(args, { repoDir, homeDir }) {
  if (args.length === 0) return runPreview(repoDir, homeDir)
  if (args.length === 1 && args[0] === '--apply') return runApply(repoDir, homeDir)
  if (args.length === 2 && args[0] === '--restore') return runRestore(homeDir, args[1])
  console.error(USAGE)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2), { repoDir: path.resolve(import.meta.dirname, '..'), homeDir: os.homedir() })
}
