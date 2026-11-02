import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createSandbox, runSandboxed } from '../sandbox.mjs'
import { assertComparable, findRegressions, findUncomparedCases } from './compare.mjs'
import { loadTimeline } from './timeline.mjs'

const COMMANDS = ['capture', 'compare']
const DEFAULT_TIMEOUT_SECONDS = 300
const DEFAULT_OPTIONS = {
  model: 'sonnet',
  runs: 3,
  concurrency: 3,
  only: undefined,
  timeoutSeconds: undefined,
}

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

function defaultProjectsDir() {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
  return path.join(configDir, 'projects')
}

function describeEnvironmentFailure({ result, timeoutMs }) {
  if (result.timedOut) return `timed out after ${timeoutMs / 1000} s`
  return `no init event (exit code ${result.exitCode})`
}

function failedOutcome(reason) {
  return { environmentFailure: true, reason }
}

function scoreMember({ scenario, events, timeline, dir, claudeCodeVersion }) {
  const { passed, detail } = scenario.score({ events, timeline, dir })
  return { environmentFailure: false, passed, detail, claudeCodeVersion }
}

function assessRun({ members, result, dir, timeoutMs }) {
  const initEvent = findInitEvent(result.events)
  if (result.timedOut || !initEvent) {
    return members.map(() => failedOutcome(describeEnvironmentFailure({ result, timeoutMs })))
  }
  const timeline = loadTimeline({ projectsDir: defaultProjectsDir(), sessionId: initEvent.session_id })
  if (!timeline) return members.map(() => failedOutcome('session transcript not found'))
  const claudeCodeVersion = initEvent.claude_code_version
  return members.map((scenario) =>
    scoreMember({ scenario, events: result.events, timeline, dir, claudeCodeVersion }),
  )
}

async function executeRun({ members, harnessDir, model, timeoutMs }) {
  const [lead] = members
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eval-'))
  try {
    createSandbox({ harnessDir, targetDir: dir })
    lead.setup(dir)
    const { tools, maxTurns } = lead
    const result = await runSandboxed({ cwd: dir, prompt: lead.prompt(dir), model, tools, maxTurns, timeoutMs })
    return assessRun({ members, result, dir, timeoutMs })
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
    environmentFailureReasons: outcomes
      .filter((outcome) => outcome.environmentFailure)
      .map((outcome) => outcome.reason),
    details: scored.filter((outcome) => !outcome.passed).map((outcome) => outcome.detail),
    claudeCodeVersion: scored[0]?.claudeCodeVersion ?? null,
  }
}

function resolveTimeoutMs({ timeoutMs, lead }) {
  return timeoutMs ?? (lead.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
}

async function runGroup({ members, harnessDir, model, runs, limit, timeoutMs }) {
  const resolvedTimeoutMs = resolveTimeoutMs({ timeoutMs, lead: members[0] })
  const attempts = Array.from({ length: runs }, () =>
    limit(() => executeRun({ members, harnessDir, model, timeoutMs: resolvedTimeoutMs })),
  )
  const outcomesPerRun = await Promise.all(attempts)
  return members.map((scenario, index) =>
    summariseOutcomes({ scenario, outcomes: outcomesPerRun.map((outcomes) => outcomes[index]) }),
  )
}

export async function runCase({ scenario, limit = runImmediately, ...rest }) {
  const [summary] = await runGroup({ members: [scenario], limit, ...rest })
  return summary
}

function groupScenarios(scenarios) {
  const byGroup = new Map()
  const units = []
  for (const scenario of scenarios) {
    const unit = scenario.group ? byGroup.get(scenario.group) : undefined
    if (unit) unit.push(scenario)
    else {
      const created = [scenario]
      units.push(created)
      if (scenario.group) byGroup.set(scenario.group, created)
    }
  }
  return units
}

function withoutVersion({ claudeCodeVersion: _version, ...caseResult }) {
  return caseResult
}

export async function runSuite({ scenarios, harnessDir, model, runs, concurrency, timeoutMs }) {
  const limit = createLimiter(concurrency)
  const units = groupScenarios(scenarios)
  const summaries = await Promise.all(
    units.map((members) => runGroup({ members, harnessDir, model, runs, limit, timeoutMs })),
  )
  const summaryById = new Map(
    units.flatMap((members, index) => members.map((member, at) => [member.id, summaries[index][at]])),
  )
  return {
    claudeCodeVersion: summaries.flat().find((summary) => summary.claudeCodeVersion)?.claudeCodeVersion ?? null,
    model,
    cases: Object.fromEntries(
      scenarios.map((scenario) => [scenario.id, withoutVersion(summaryById.get(scenario.id))]),
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

function parsePositiveInteger({ name, value }) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`The ${name} value ${value} is not a positive integer. Use 1 or more.`)
  }
  return number
}

function applyOption({ options, name, value }) {
  if (name === '--model') return { ...options, model: value }
  if (name === '--runs') return { ...options, runs: Number(value) }
  if (name === '--concurrency') return { ...options, concurrency: parsePositiveInteger({ name, value }) }
  if (name === '--timeout-seconds') {
    return { ...options, timeoutSeconds: parsePositiveInteger({ name, value }) }
  }
  if (name === '--only') return { ...options, only: value.split(',') }
  throw new Error(`Unknown option ${name}. Use --model, --runs, --concurrency, --timeout-seconds or --only.`)
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
    const model = path.basename(baselinePath, '.json').replace(/^compliance-/, '')
    throw new Error(
      `No baseline found at ${baselinePath}. Run capture --model ${model} to create it.`,
    )
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

function reportEnvironmentFailures({ summary, log }) {
  for (const [id, entry] of Object.entries(summary.cases)) {
    for (const reason of entry.environmentFailureReasons) log(`Environment failure in ${id}: ${reason}`)
  }
}

function countEnvironmentFailures(summary) {
  return Object.values(summary.cases).reduce((sum, entry) => sum + entry.environmentFailures, 0)
}

function partialPathFor({ baselinePath, model }) {
  return path.join(path.dirname(baselinePath), `.partial-${model}.json`)
}

function refuseToWriteBaseline({ summary, baselinePath, failures, log }) {
  reportEnvironmentFailures({ summary, log })
  const partialPath = partialPathFor({ baselinePath, model: summary.model })
  writeBaseline({ baselinePath: partialPath, summary })
  log(`Not writing the baseline: ${failures} environment failure(s). Partial results are in ${partialPath}.`)
  return 1
}

async function executeCapture({ suiteInput, only, baselinePath, log }) {
  const summary = await runSuite(suiteInput)
  const failures = countEnvironmentFailures(summary)
  if (failures > 0) return refuseToWriteBaseline({ summary, baselinePath, failures, log })
  const toWrite = only ? mergeIntoExisting({ baselinePath, summary }) : summary
  writeBaseline({ baselinePath, summary: toWrite })
  fs.rmSync(partialPathFor({ baselinePath, model: summary.model }), { force: true })
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
  reportEnvironmentFailures({ summary: current, log })
  const firstFailures = countEnvironmentFailures(current)
  if (firstFailures > 0) return reportUnassessable({ failures: firstFailures, log })
  assertComparable({ baseline, current })
  const candidates = findRegressions({ baseline, current })
  const { confirmed, rerun } = await confirmRegressions({ candidates, baseline, suiteInput })
  if (rerun) reportEnvironmentFailures({ summary: rerun, log })
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

export function baselinePathFor({ baselinesDir, model }) {
  return path.join(baselinesDir, `compliance-${model}.json`)
}

export async function executeCommand({
  command,
  options,
  scenarios,
  harnessDir,
  baselinesDir,
  log = console.log,
}) {
  const { model, runs, concurrency, only, timeoutSeconds } = options
  const baselinePath = baselinePathFor({ baselinesDir, model })
  const suiteInput = {
    scenarios: selectScenarios({ scenarios, only }),
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
  const { scenarios } = await import('./scenarios.mjs')
  const { command, options } = parseCliArguments(process.argv.slice(2))
  process.exitCode = await executeCommand({
    command,
    options,
    scenarios,
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
