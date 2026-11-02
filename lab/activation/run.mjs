import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createSandbox, runSandboxed } from '../sandbox.mjs'
import { assertComparable, findUncomparedCases } from '../evals/compare.mjs'
import { createLimiter, parseCliArguments } from '../evals/run.mjs'
import {
  findActivationRegressions,
  findInitEvent,
  firstInvokedSkill,
  summariseActivation,
} from './score.mjs'

const TOOLS = ['Skill', 'Read']
const MAX_TURNS = 2
const DEFAULT_TIMEOUT_MS = 120000

const SMALL_PROJECT = {
  'package.json': '{\n  "name": "slugs",\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n',
  'README.md': '# Slugs\n\nA tiny library that turns text into URL slugs.\n',
  'src/slug.mjs':
    "export function slugify(text) {\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-')\n}\n",
  'src/slug.test.mjs': [
    "import assert from 'node:assert/strict'",
    "import { test } from 'node:test'",
    "import { slugify } from './slug.mjs'",
    '',
    "test('slugify joins words with a hyphen', () => {",
    "  assert.equal(slugify('Hello World'), 'hello-world')",
    '})',
    '',
  ].join('\n'),
}

function writeSmallProject(dir) {
  for (const [relativePath, content] of Object.entries(SMALL_PROJECT)) {
    const filePath = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
}

function failedOutcome(reason) {
  return { environmentFailure: true, reason }
}

const TURN_LIMIT_SUBTYPE = 'error_max_turns'

function findResultEvent(events) {
  return events.find((event) => event.type === 'result')
}

function describeUnfinishedRun({ result, resultEvent }) {
  if (!resultEvent) return 'claude ended after init with no result event'
  if (resultEvent.subtype === TURN_LIMIT_SUBTYPE) return null
  if (resultEvent.is_error === true) return `claude reported ${resultEvent.subtype ?? 'an error'}`
  if (result.exitCode !== 0) return `claude exited with exit code ${result.exitCode}`
  return null
}

function assessRun({ result, timeoutMs }) {
  if (result.timedOut) return failedOutcome(`timed out after ${timeoutMs / 1000} s`)
  const initEvent = findInitEvent(result.events)
  if (!initEvent) return failedOutcome(`no init event (exit code ${result.exitCode})`)
  const activated = firstInvokedSkill(result.events)
  const problem =
    activated === null ? describeUnfinishedRun({ result, resultEvent: findResultEvent(result.events) }) : null
  if (problem) return failedOutcome(problem)
  return { environmentFailure: false, activated, claudeCodeVersion: initEvent.claude_code_version }
}

async function executeRun({ prompt, harnessDir, model, timeoutMs }) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'activation-'))
  try {
    createSandbox({ harnessDir, targetDir: dir })
    writeSmallProject(dir)
    const stopWhen = (events) => firstInvokedSkill(events) !== null
    const result = await runSandboxed({
      cwd: dir,
      prompt,
      model,
      tools: TOOLS,
      maxTurns: MAX_TURNS,
      timeoutMs,
      stopWhen,
    })
    return assessRun({ result, timeoutMs })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function tasksOf({ sets, runs }) {
  return sets.flatMap(({ skill, positives, nearMisses }) =>
    [
      ...positives.map((prompt) => ({ skill, kind: 'positive', prompt })),
      ...nearMisses.map((prompt) => ({ skill, kind: 'nearMiss', prompt })),
    ].flatMap((task) => Array.from({ length: runs }, () => task)),
  )
}

export async function runActivationSuite({ sets, harnessDir, model, runs, concurrency, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const limit = createLimiter(concurrency)
  const results = await Promise.all(
    tasksOf({ sets, runs }).map(async (task) => {
      const outcome = await limit(() => executeRun({ prompt: task.prompt, harnessDir, model, timeoutMs }))
      return { skill: task.skill, kind: task.kind, ...outcome }
    }),
  )
  const versioned = results.find((result) => result.claudeCodeVersion)
  return {
    claudeCodeVersion: versioned?.claudeCodeVersion ?? null,
    model,
    cases: summariseActivation(results),
  }
}

function selectSets({ sets, only }) {
  if (!only) return sets
  const unknown = only.filter((skill) => !sets.some((set) => set.skill === skill))
  if (unknown.length > 0) {
    throw new Error(`No activation set has the skill ${unknown.join(', ')}. Check the --only list.`)
  }
  return sets.filter((set) => only.includes(set.skill))
}

export function baselinePathFor({ baselinesDir, model }) {
  return path.join(baselinesDir, `activation-${model}.json`)
}

function partialPathFor({ baselinePath, model }) {
  return path.join(path.dirname(baselinePath), `.partial-activation-${model}.json`)
}

function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    const model = path.basename(baselinePath, '.json').replace(/^activation-/, '')
    throw new Error(`No baseline found at ${baselinePath}. Run capture --model ${model} to create it.`)
  }
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
}

function writeBaseline({ baselinePath, summary }) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, `${JSON.stringify(summary, null, 2)}\n`)
}

function mergeIntoExisting({ existing, summary }) {
  assertComparable({ baseline: existing, current: summary })
  return { ...summary, cases: { ...existing.cases, ...summary.cases } }
}

function reportEnvironmentFailures({ summary, log }) {
  for (const [skill, entry] of Object.entries(summary.cases)) {
    for (const reason of entry.environmentFailureReasons) log(`Environment failure in ${skill}: ${reason}`)
  }
}

function countEnvironmentFailures(summary) {
  return Object.values(summary.cases).reduce((sum, entry) => sum + entry.environmentFailures, 0)
}

function formatFraction(passes, runs) {
  return `${passes}/${runs}`
}

function formatWinners(winners) {
  const entries = Object.entries(winners).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  return entries.length === 0 ? '' : `  missed to: ${entries.map(([name, count]) => `${name} x${count}`).join(', ')}`
}

function formatEntry(entry) {
  const positive = formatFraction(entry.positivePasses, entry.positiveRuns)
  const falseActivations = formatFraction(entry.nearMissFalseActivations, entry.nearMissRuns)
  return `positive ${positive}  false activations ${falseActivations}`
}

function formatBaseline(entry) {
  return entry ? `  baseline ${formatEntry(entry)}` : '  baseline -'
}

function renderTable({ baseline, current }) {
  return Object.entries(current.cases).map(
    ([skill, entry]) =>
      `${skill.padEnd(32)} ${formatEntry(entry)}${formatWinners(entry.winners)}${
        baseline ? formatBaseline(baseline.cases[skill]) : ''
      }`,
  )
}

function refuseToWriteBaseline({ summary, baselinePath, failures, log }) {
  reportEnvironmentFailures({ summary, log })
  const partialPath = partialPathFor({ baselinePath, model: summary.model })
  writeBaseline({ baselinePath: partialPath, summary })
  log(`Not writing the baseline: ${failures} environment failure(s). Partial results are in ${partialPath}.`)
  return 1
}

async function executeCapture({ suiteInput, only, baselinePath, log }) {
  const existing = only ? readBaseline(baselinePath) : null
  const summary = await runActivationSuite(suiteInput)
  renderTable({ current: summary }).forEach((line) => log(line))
  const failures = countEnvironmentFailures(summary)
  if (failures > 0) return refuseToWriteBaseline({ summary, baselinePath, failures, log })
  writeBaseline({ baselinePath, summary: existing ? mergeIntoExisting({ existing, summary }) : summary })
  fs.rmSync(partialPathFor({ baselinePath, model: summary.model }), { force: true })
  log(`Captured ${Object.keys(summary.cases).length} skill(s) to ${baselinePath}`)
  return 0
}

function restrictBaseline({ baseline, only }) {
  if (!only) return baseline
  const kept = Object.entries(baseline.cases).filter(([skill]) => only.includes(skill))
  return { ...baseline, cases: Object.fromEntries(kept) }
}

async function confirmRegressions({ candidates, baseline, suiteInput }) {
  if (candidates.length === 0) return { confirmed: [], rerun: null }
  const sets = suiteInput.sets.filter((set) => candidates.includes(set.skill))
  const rerun = await runActivationSuite({ ...suiteInput, sets })
  return { confirmed: findActivationRegressions({ baseline, current: rerun }), rerun }
}

function reportUncompared({ uncompared, log }) {
  if (uncompared.missing.length > 0) log(`Missing from this run: ${uncompared.missing.join(', ')}`)
  if (uncompared.added.length > 0) log(`Not in the baseline: ${uncompared.added.join(', ')}`)
}

function reportFailures({ confirmed, rerun, log }) {
  log(`[FAIL] regressions: ${confirmed.join(', ')}`)
  for (const skill of confirmed) {
    log(`${skill}:`)
    log(`  ${formatEntry(rerun.cases[skill])}${formatWinners(rerun.cases[skill].winners)}`)
  }
}

function reportUnassessable({ failures, log }) {
  log(`Cannot assess this run: ${failures} environment failure(s).`)
  return 1
}

function failuresIn(summary) {
  return summary ? countEnvironmentFailures(summary) : 0
}

function concludeComparison({ confirmed, rerun, uncompared, only, log }) {
  const hasUncompared = uncompared.missing.length > 0 || uncompared.added.length > 0
  if (confirmed.length > 0) reportFailures({ confirmed, rerun, log })
  const fails = confirmed.length > 0 || (!only && hasUncompared)
  if (!fails) log('[PASS] no regressions')
  return fails ? 1 : 0
}

async function confirmedAfterRerun({ current, baseline, suiteInput, log }) {
  const candidates = findActivationRegressions({ baseline, current })
  const { confirmed, rerun } = await confirmRegressions({ candidates, baseline, suiteInput })
  if (rerun) reportEnvironmentFailures({ summary: rerun, log })
  return { confirmed, rerun }
}

async function executeCompare({ suiteInput, only, baselinePath, log }) {
  const baseline = restrictBaseline({ baseline: readBaseline(baselinePath), only })
  const current = await runActivationSuite(suiteInput)
  renderTable({ baseline, current }).forEach((line) => log(line))
  reportEnvironmentFailures({ summary: current, log })
  if (failuresIn(current) > 0) return reportUnassessable({ failures: failuresIn(current), log })
  assertComparable({ baseline, current })
  const { confirmed, rerun } = await confirmedAfterRerun({ current, baseline, suiteInput, log })
  if (failuresIn(rerun) > 0) return reportUnassessable({ failures: failuresIn(rerun), log })
  const uncompared = findUncomparedCases({ baseline, current })
  reportUncompared({ uncompared, log })
  return concludeComparison({ confirmed, rerun, uncompared, only, log })
}

export async function executeCommand({
  command,
  options,
  sets,
  harnessDir,
  baselinesDir,
  log = console.log,
}) {
  const { model, runs, concurrency, only, timeoutSeconds } = options
  const baselinePath = baselinePathFor({ baselinesDir, model })
  const suiteInput = {
    sets: selectSets({ sets, only }),
    harnessDir,
    model,
    runs,
    concurrency,
    timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
  }
  const execute = command === 'capture' ? executeCapture : executeCompare
  return execute({ suiteInput, only, baselinePath, log })
}

async function main() {
  const labDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { activationSets } = await import('./sets.mjs')
  const { command, options } = parseCliArguments(process.argv.slice(2))
  process.exitCode = await executeCommand({
    command,
    options,
    sets: activationSets,
    harnessDir: path.resolve(labDir, '..', '.claude'),
    baselinesDir: path.join(labDir, 'baselines'),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
