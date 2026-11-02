import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createSandbox, runSandboxed } from '../sandbox.mjs'
import { assertComparable, findRegressions, findUncomparedCases } from './compare.mjs'

const COMMANDS = ['capture', 'compare']
const DEFAULT_OPTIONS = { model: 'sonnet', runs: 3, concurrency: 3, only: undefined }

const runImmediately = (task) => task()

export function createLimiter(concurrency) {
  let active = 0
  const waiting = []
  return async function limit(task) {
    if (active >= concurrency) await new Promise((resolve) => waiting.push(resolve))
    else active += 1
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

function findInitEvent(events) {
  return events.find((event) => event.type === 'system' && event.subtype === 'init')
}

function assessRun({ scenario, result, dir }) {
  const initEvent = findInitEvent(result.events)
  if (result.timedOut || !initEvent) return { environmentFailure: true }
  const { passed, detail } = scenario.score({ events: result.events, dir })
  return {
    environmentFailure: false,
    passed,
    detail,
    claudeCodeVersion: initEvent.claude_code_version,
  }
}

async function executeRun({ scenario, harnessDir, model, timeoutMs }) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eval-'))
  try {
    createSandbox({ harnessDir, targetDir: dir })
    scenario.setup(dir)
    const prompt = scenario.prompt(dir)
    const { tools, maxTurns } = scenario
    const result = await runSandboxed({ cwd: dir, prompt, model, tools, maxTurns, timeoutMs })
    return assessRun({ scenario, result, dir })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function summariseOutcomes({ scenario, outcomes }) {
  const scored = outcomes.filter((outcome) => !outcome.environmentFailure)
  return {
    safety: scenario.safety,
    passes: scored.filter((outcome) => outcome.passed).length,
    runs: scored.length,
    environmentFailures: outcomes.length - scored.length,
    details: scored.filter((outcome) => !outcome.passed).map((outcome) => outcome.detail),
    claudeCodeVersion: scored[0]?.claudeCodeVersion ?? null,
  }
}

export async function runCase({
  scenario,
  harnessDir,
  model,
  runs,
  limit = runImmediately,
  timeoutMs,
}) {
  const attempts = Array.from({ length: runs }, () =>
    limit(() => executeRun({ scenario, harnessDir, model, timeoutMs })),
  )
  return summariseOutcomes({ scenario, outcomes: await Promise.all(attempts) })
}

function withoutVersion({ claudeCodeVersion: _version, ...caseResult }) {
  return caseResult
}

export async function runSuite({ scenarios, harnessDir, model, runs, concurrency }) {
  const limit = createLimiter(concurrency)
  const results = await Promise.all(
    scenarios.map((scenario) => runCase({ scenario, harnessDir, model, runs, limit })),
  )
  return {
    claudeCodeVersion: results.find((result) => result.claudeCodeVersion)?.claudeCodeVersion ?? null,
    model,
    cases: Object.fromEntries(
      scenarios.map((scenario, index) => [scenario.id, withoutVersion(results[index])]),
    ),
  }
}

function readOptionValue({ argv, index }) {
  const value = argv[index + 1]
  if (value === undefined) {
    throw new Error(`The option ${argv[index]} needs a value. Add one after it.`)
  }
  return value
}

function parsePositiveInteger(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`The --concurrency value ${value} is not a positive integer. Use 1 or more.`)
  }
  return number
}

function applyOption({ options, name, value }) {
  if (name === '--model') return { ...options, model: value }
  if (name === '--runs') return { ...options, runs: Number(value) }
  if (name === '--concurrency') return { ...options, concurrency: parsePositiveInteger(value) }
  if (name === '--only') return { ...options, only: value.split(',') }
  throw new Error(`Unknown option ${name}. Use --model, --runs, --concurrency or --only.`)
}

export function parseCliArguments(argv) {
  const [command, ...rest] = argv
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command ${command}. Use ${COMMANDS.join(' or ')}.`)
  }
  let options = { ...DEFAULT_OPTIONS }
  for (let index = 0; index < rest.length; index += 2) {
    const value = readOptionValue({ argv: rest, index })
    options = applyOption({ options, name: rest[index], value })
  }
  return { command, options }
}

function selectScenarios({ scenarios, only }) {
  if (!only) return scenarios
  const unknown = only.filter((id) => !scenarios.some((scenario) => scenario.id === id))
  if (unknown.length > 0) {
    throw new Error(`No scenario has the id ${unknown.join(', ')}. Check the --only list.`)
  }
  return scenarios.filter((scenario) => only.includes(scenario.id))
}

function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`No baseline found at ${baselinePath}. Run the capture command first.`)
  }
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
}

function writeBaseline({ baselinePath, summary }) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, `${JSON.stringify(summary, null, 2)}\n`)
}

function mergeIntoExisting({ baselinePath, summary }) {
  const existing = readBaseline(baselinePath)
  assertComparable({ baseline: existing, current: summary })
  return { ...summary, cases: { ...existing.cases, ...summary.cases } }
}

function countEnvironmentFailures(summary) {
  return Object.values(summary.cases).reduce((sum, entry) => sum + entry.environmentFailures, 0)
}

async function executeCapture({ suiteInput, only, baselinePath, log }) {
  const summary = await runSuite(suiteInput)
  const failures = countEnvironmentFailures(summary)
  if (failures > 0) {
    log(`Not writing the baseline: ${failures} environment failure(s). Fix the environment and rerun.`)
    return 1
  }
  const toWrite = only ? mergeIntoExisting({ baselinePath, summary }) : summary
  writeBaseline({ baselinePath, summary: toWrite })
  log(`Captured ${Object.keys(summary.cases).length} case(s) to ${baselinePath}`)
  return 0
}

function formatPasses(entry) {
  return entry ? `${entry.passes}/${entry.runs}` : '-'
}

function renderTable({ baseline, current }) {
  return Object.entries(current.cases).map(
    ([id, entry]) =>
      `${id.padEnd(40)} ${formatPasses(entry).padEnd(6)} baseline ${formatPasses(baseline.cases[id])}`,
  )
}

function restrictBaseline({ baseline, only }) {
  if (!only) return baseline
  const kept = Object.entries(baseline.cases).filter(([id]) => only.includes(id))
  return { ...baseline, cases: Object.fromEntries(kept) }
}

async function confirmRegressions({ candidates, baseline, suiteInput }) {
  if (candidates.length === 0) return { confirmed: [], rerun: null }
  const rerun = await runSuite({
    ...suiteInput,
    scenarios: suiteInput.scenarios.filter((scenario) => candidates.includes(scenario.id)),
  })
  return { confirmed: findRegressions({ baseline, current: rerun }), rerun }
}

function reportUncompared({ uncompared, log }) {
  if (uncompared.missing.length > 0) log(`Missing from this run: ${uncompared.missing.join(', ')}`)
  if (uncompared.added.length > 0) log(`Not in the baseline: ${uncompared.added.join(', ')}`)
}

function reportFailures({ confirmed, rerun, log }) {
  log(`[FAIL] regressions: ${confirmed.join(', ')}`)
  for (const id of confirmed) {
    log(`${id}:`)
    for (const detail of rerun.cases[id].details) log(`  ${detail}`)
  }
}

function reportUnassessable({ failures, log }) {
  log(`Cannot assess this run: ${failures} environment failure(s).`)
  return 1
}

async function executeCompare({ suiteInput, only, baselinePath, log }) {
  const baseline = restrictBaseline({ baseline: readBaseline(baselinePath), only })
  const current = await runSuite(suiteInput)
  renderTable({ baseline, current }).forEach((line) => log(line))
  const firstFailures = countEnvironmentFailures(current)
  if (firstFailures > 0) return reportUnassessable({ failures: firstFailures, log })
  assertComparable({ baseline, current })
  const candidates = findRegressions({ baseline, current })
  const { confirmed, rerun } = await confirmRegressions({ candidates, baseline, suiteInput })
  const rerunFailures = rerun ? countEnvironmentFailures(rerun) : 0
  if (rerunFailures > 0) return reportUnassessable({ failures: rerunFailures, log })
  const uncompared = findUncomparedCases({ baseline, current })
  reportUncompared({ uncompared, log })
  return concludeComparison({ confirmed, rerun, uncompared, only, log })
}

function concludeComparison({ confirmed, rerun, uncompared, only, log }) {
  const hasUncompared = uncompared.missing.length > 0 || uncompared.added.length > 0
  const fails = confirmed.length > 0 || (!only && hasUncompared)
  if (confirmed.length > 0) reportFailures({ confirmed, rerun, log })
  else if (!fails) log('[PASS] no regressions')
  return fails ? 1 : 0
}

export async function executeCommand({
  command,
  options,
  scenarios,
  harnessDir,
  baselinePath,
  log = console.log,
}) {
  const { model, runs, concurrency, only } = options
  const suiteInput = { scenarios: selectScenarios({ scenarios, only }), harnessDir, model, runs, concurrency }
  const execute = command === 'capture' ? executeCapture : executeCompare
  return execute({ suiteInput, only, baselinePath, log })
}

async function main() {
  const labDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { scenarios } = await import('./scenarios.mjs')
  const { command, options } = parseCliArguments(process.argv.slice(2))
  process.exitCode = await executeCommand({
    command,
    options,
    scenarios,
    harnessDir: path.resolve(labDir, '..', '.claude'),
    baselinePath: path.join(labDir, 'baselines', 'compliance.json'),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
