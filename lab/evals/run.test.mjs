import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { baselinePathFor, executeCommand, parseCliArguments, runCase, runSuite } from './run.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-test-'))
}

function makeHarness() {
  const harnessDir = makeTempDir()
  fs.mkdirSync(path.join(harnessDir, 'rules'))
  fs.mkdirSync(path.join(harnessDir, 'skills'))
  return harnessDir
}

function fakeClaudeSource({ stateDir }) {
  return `#!/usr/bin/env node
const fs = require('node:fs')
const prompt = process.argv[3]
const state = ${JSON.stringify(stateDir)}
const init = { type: 'system', subtype: 'init', claude_code_version: '2.1.0' }
const say = (text) => console.log(JSON.stringify({ type: 'assistant', text }))
function nextFlakyCount() {
  const file = state + '/flaky'
  const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0
  fs.writeFileSync(file, String(count + 1))
  return count
}
if (prompt === 'noinit') process.exit(0)
console.log(JSON.stringify(init))
if (prompt === 'hang') setTimeout(() => {}, 60000)
else if (prompt === 'slow') {
  fs.appendFileSync(state + '/log', 'start\\n')
  setTimeout(() => { fs.appendFileSync(state + '/log', 'end\\n'); say('good') }, 200)
} else if (prompt === 'flaky') say(nextFlakyCount() < 3 ? 'bad' : 'good')
else say(prompt)
`
}

async function withFakeClaude(body) {
  const binDir = makeTempDir()
  const stateDir = makeTempDir()
  const executable = path.join(binDir, 'claude')
  fs.writeFileSync(executable, fakeClaudeSource({ stateDir }))
  fs.chmodSync(executable, 0o755)
  const originalPath = process.env.PATH
  process.env.PATH = `${binDir}${path.delimiter}${originalPath}`
  try {
    return await body({ stateDir })
  } finally {
    process.env.PATH = originalPath
  }
}

function scenarioPrompting(prompt, overrides = {}) {
  return {
    id: prompt,
    safety: false,
    tools: ['Read'],
    maxTurns: 2,
    setup: () => {},
    prompt: () => prompt,
    score: ({ events }) => {
      const passed = events.some((event) => event.text === 'good')
      return { passed, detail: passed ? 'said good' : 'did not say good' }
    },
    ...overrides,
  }
}

function runCaseFor(scenario, overrides = {}) {
  return runCase({ scenario, harnessDir: makeHarness(), model: 'haiku', runs: 2, ...overrides })
}

test('runCase counts the runs that the scenario scores as passed', async () => {
  const result = await withFakeClaude(() => runCaseFor(scenarioPrompting('good')))
  assert.equal(result.passes, 2)
  assert.equal(result.runs, 2)
})

test('runCase records the detail of each failed run', async () => {
  const result = await withFakeClaude(() => runCaseFor(scenarioPrompting('bad')))
  assert.deepEqual(result.details, ['did not say good', 'did not say good'])
})

test('runCase reports the safety flag of the scenario', async () => {
  const scenario = scenarioPrompting('good', { safety: true })
  const result = await withFakeClaude(() => runCaseFor(scenario))
  assert.equal(result.safety, true)
})

test('runCase reports the Claude Code version from the init event', async () => {
  const result = await withFakeClaude(() => runCaseFor(scenarioPrompting('good')))
  assert.equal(result.claudeCodeVersion, '2.1.0')
})

test('runCase removes the working directory after each run', async () => {
  const seen = []
  const scenario = scenarioPrompting('good', { setup: (dir) => seen.push(dir) })
  await withFakeClaude(() => runCaseFor(scenario))
  assert.deepEqual(seen.map((dir) => fs.existsSync(dir)), [false, false])
})

test('runCase gives the scenario a sandbox that holds the harness rules', async () => {
  let rulesFound = false
  const scenario = scenarioPrompting('good', {
    setup: (dir) => {
      rulesFound = fs.existsSync(path.join(dir, '.claude', 'rules'))
    },
  })
  await withFakeClaude(() => runCaseFor(scenario))
  assert.equal(rulesFound, true)
})

test('runCase counts a run without an init event as an environment failure', async () => {
  const result = await withFakeClaude(() => runCaseFor(scenarioPrompting('noinit')))
  assert.equal(result.environmentFailures, 2)
  assert.equal(result.runs, 0)
})

test('runCase does not score a run without an init event', async () => {
  let scoreCalls = 0
  const scenario = scenarioPrompting('noinit', {
    score: () => {
      scoreCalls += 1
      return { passed: true, detail: '' }
    },
  })
  await withFakeClaude(() => runCaseFor(scenario))
  assert.equal(scoreCalls, 0)
})

test('runCase counts a timed-out run as an environment failure', async () => {
  const result = await withFakeClaude(() =>
    runCaseFor(scenarioPrompting('hang'), { runs: 1, timeoutMs: 400 }),
  )
  assert.deepEqual([result.environmentFailures, result.runs], [1, 0])
})

test('runCase rejects when the scenario score throws', async () => {
  const scenario = scenarioPrompting('good', {
    score: () => {
      throw new Error('scorer defect')
    },
  })
  await assert.rejects(withFakeClaude(() => runCaseFor(scenario)), /scorer defect/)
})

test('runCase still removes the working directory when the score throws', async () => {
  const seen = []
  const scenario = scenarioPrompting('good', {
    setup: (dir) => seen.push(dir),
    score: () => {
      throw new Error('scorer defect')
    },
  })
  await withFakeClaude(() => runCaseFor(scenario, { runs: 1 })).catch(() => {})
  assert.equal(fs.existsSync(seen[0]), false)
})

function maxInFlight(logText) {
  let current = 0
  let peak = 0
  for (const line of logText.trim().split('\n')) {
    current += line === 'start' ? 1 : -1
    peak = Math.max(peak, current)
  }
  return peak
}

test('runSuite never runs more claude processes than the concurrency allows', async () => {
  const peak = await withFakeClaude(async ({ stateDir }) => {
    const scenarios = ['a', 'b', 'c'].map((id) => scenarioPrompting('slow', { id }))
    await runSuite({ scenarios, harnessDir: makeHarness(), model: 'haiku', runs: 2, concurrency: 2 })
    return maxInFlight(fs.readFileSync(path.join(stateDir, 'log'), 'utf8'))
  })
  assert.equal(peak, 2)
})

test('runSuite summarises the version, model and cases by id', async () => {
  const scenarios = [scenarioPrompting('good', { id: 'alpha', safety: true })]
  const summary = await withFakeClaude(() =>
    runSuite({ scenarios, harnessDir: makeHarness(), model: 'haiku', runs: 1, concurrency: 1 }),
  )
  assert.deepEqual(summary, {
    claudeCodeVersion: '2.1.0',
    model: 'haiku',
    cases: {
      alpha: { safety: true, passes: 1, runs: 1, environmentFailures: 0, details: [] },
    },
  })
})

test('parseCliArguments defaults to sonnet, three runs and concurrency three', () => {
  const { command, options } = parseCliArguments(['capture'])
  assert.deepEqual(
    [command, options.model, options.runs, options.concurrency, options.only],
    ['capture', 'sonnet', 3, 3, undefined],
  )
})

test('parseCliArguments reads overrides and splits the only list', () => {
  const { options } = parseCliArguments([
    'compare', '--model', 'opus', '--runs', '5', '--concurrency', '2', '--only', 'a,b',
  ])
  assert.deepEqual(options, { model: 'opus', runs: 5, concurrency: 2, only: ['a', 'b'] })
})

test('parseCliArguments rejects an unknown command with the valid commands', () => {
  assert.throws(() => parseCliArguments(['explode']), /capture.*compare/s)
})

function commandOptions(overrides = {}) {
  return { model: 'haiku', runs: 3, concurrency: 3, only: undefined, ...overrides }
}

async function executeWithLog({ command, scenarios, baselinePath, options = commandOptions() }) {
  const lines = []
  const exitCode = await withFakeClaude(() =>
    executeCommand({
      command,
      options,
      scenarios,
      harnessDir: makeHarness(),
      baselinesDir: path.dirname(baselinePath),
      log: (line) => lines.push(line),
    }),
  )
  return { exitCode, output: lines.join('\n') }
}

function baselineFile(cases, overrides = {}) {
  const baselinePath = path.join(makeTempDir(), 'baselines', 'compliance-haiku.json')
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  const summary = { claudeCodeVersion: '2.1.0', model: 'haiku', cases, ...overrides }
  fs.writeFileSync(baselinePath, `${JSON.stringify(summary, null, 2)}\n`)
  return baselinePath
}

function baselineCase(passes, { safety = false, runs = 3 } = {}) {
  return { safety, passes, runs, environmentFailures: 0, details: [] }
}

test('capture writes the summary as pretty JSON with a trailing newline', async () => {
  const baselinePath = path.join(makeTempDir(), 'baselines', 'compliance-haiku.json')
  await executeWithLog({ command: 'capture', scenarios: [scenarioPrompting('good')], baselinePath })
  const text = fs.readFileSync(baselinePath, 'utf8')
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`)
})

test('capture with only merges the selected cases into the existing baseline', async () => {
  const baselinePath = baselineFile({ keep: baselineCase(3), good: baselineCase(0) })
  await executeWithLog({
    command: 'capture',
    scenarios: [scenarioPrompting('good'), scenarioPrompting('keep')],
    baselinePath,
    options: commandOptions({ only: ['good'] }),
  })
  const cases = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).cases
  assert.deepEqual([cases.keep.passes, cases.good.passes], [3, 3])
})

test('compare reports no regressions when the results match the baseline', async () => {
  const baselinePath = baselineFile({ good: baselineCase(3) })
  const { exitCode, output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('good')],
    baselinePath,
  })
  assert.equal(exitCode, 0)
  assert.match(output, /\[PASS\] no regressions/)
})

test('compare prints the passes and the baseline passes for each case', async () => {
  const baselinePath = baselineFile({ good: baselineCase(3) })
  const { output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('good')],
    baselinePath,
  })
  assert.match(output, /good\s+3\/3\s+baseline 3\/3/)
})

test('compare fails with the case id and detail when a regression repeats', async () => {
  const baselinePath = baselineFile({ bad: baselineCase(3, { safety: true }) })
  const { exitCode, output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('bad', { safety: true })],
    baselinePath,
  })
  assert.equal(exitCode, 1)
  assert.match(output, /\[FAIL\].*bad[\s\S]*did not say good/)
})

test('compare clears a regression that does not repeat on the second run', async () => {
  const baselinePath = baselineFile({ flaky: baselineCase(3, { safety: true }) })
  const { exitCode, output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('flaky', { safety: true })],
    baselinePath,
    options: commandOptions({ concurrency: 1 }),
  })
  assert.equal(exitCode, 0)
  assert.match(output, /\[PASS\] no regressions/)
})

test('compare fails when the baseline model differs and says to recapture', async () => {
  const baselinePath = baselineFile({ good: baselineCase(3) }, { model: 'opus' })
  await assert.rejects(
    executeWithLog({ command: 'compare', scenarios: [scenarioPrompting('good')], baselinePath }),
    /recapture/,
  )
})

test('compare exits 1 and reports environment failures when a run cannot be assessed', async () => {
  const baselinePath = baselineFile({ noinit: baselineCase(3) })
  const { exitCode, output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('noinit')],
    baselinePath,
  })
  assert.equal(exitCode, 1)
  assert.match(output, /environment failure/i)
})

test('compare fails when a baseline case is missing from the run', async () => {
  const baselinePath = baselineFile({ good: baselineCase(3), gone: baselineCase(3) })
  const { exitCode, output } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('good')],
    baselinePath,
  })
  assert.equal(exitCode, 1)
  assert.match(output, /missing.*gone/is)
})

test('compare with only does not fail on baseline cases that were not selected', async () => {
  const baselinePath = baselineFile({ good: baselineCase(3), other: baselineCase(3) })
  const { exitCode } = await executeWithLog({
    command: 'compare',
    scenarios: [scenarioPrompting('good'), scenarioPrompting('other')],
    baselinePath,
    options: commandOptions({ only: ['good'] }),
  })
  assert.equal(exitCode, 0)
})

test('capture with only throws and leaves the file untouched when the model differs', async () => {
  const baselinePath = baselineFile({ good: baselineCase(1) }, { model: 'opus' })
  const before = fs.readFileSync(baselinePath, 'utf8')
  await assert.rejects(
    executeWithLog({
      command: 'capture',
      scenarios: [scenarioPrompting('good')],
      baselinePath,
      options: commandOptions({ only: ['good'] }),
    }),
    /recapture/,
  )
  assert.equal(fs.readFileSync(baselinePath, 'utf8'), before)
})

test('capture with only keeps the baseline version and model on a clean merge', async () => {
  const baselinePath = baselineFile({ keep: baselineCase(3) })
  await executeWithLog({
    command: 'capture',
    scenarios: [scenarioPrompting('good'), scenarioPrompting('keep')],
    baselinePath,
    options: commandOptions({ only: ['good'] }),
  })
  const written = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  assert.deepEqual([written.claudeCodeVersion, written.model], ['2.1.0', 'haiku'])
})

test('capture exits 1 and writes nothing when a run has an environment failure', async () => {
  const baselinePath = path.join(makeTempDir(), 'baselines', 'compliance-haiku.json')
  const { exitCode } = await executeWithLog({
    command: 'capture',
    scenarios: [scenarioPrompting('noinit')],
    baselinePath,
  })
  assert.deepEqual([exitCode, fs.existsSync(baselinePath)], [1, false])
})

test('capture leaves an existing baseline untouched when a run has an environment failure', async () => {
  const baselinePath = baselineFile({ noinit: baselineCase(3) })
  const before = fs.readFileSync(baselinePath, 'utf8')
  await executeWithLog({
    command: 'capture',
    scenarios: [scenarioPrompting('noinit')],
    baselinePath,
  })
  assert.equal(fs.readFileSync(baselinePath, 'utf8'), before)
})

test('parseCliArguments rejects a concurrency of zero', () => {
  assert.throws(() => parseCliArguments(['capture', '--concurrency', '0']), /concurrency.*positive/is)
})

test('parseCliArguments rejects a concurrency that is not a number', () => {
  assert.throws(() => parseCliArguments(['capture', '--concurrency', 'many']), /concurrency.*positive/is)
})

test('parseCliArguments rejects a fractional concurrency', () => {
  assert.throws(() => parseCliArguments(['capture', '--concurrency', '1.5']), /concurrency.*positive/is)
})

test('baselinePathFor names the baseline file after the model', () => {
  assert.equal(
    baselinePathFor({ baselinesDir: '/lab/baselines', model: 'opus' }),
    path.join('/lab/baselines', 'compliance-opus.json'),
  )
})

test('compare without a baseline for the model tells the reader to capture that model', async () => {
  const baselinePath = path.join(makeTempDir(), 'compliance-haiku.json')
  await assert.rejects(
    executeWithLog({ command: 'compare', scenarios: [scenarioPrompting('good')], baselinePath }),
    /capture --model haiku/,
  )
})

test('capture writes to the baseline file of the selected model', async () => {
  const baselinesDir = makeTempDir()
  await executeWithLog({
    command: 'capture',
    scenarios: [scenarioPrompting('good')],
    baselinePath: path.join(baselinesDir, 'compliance-haiku.json'),
    options: commandOptions({ model: 'haiku' }),
  })
  assert.deepEqual(fs.readdirSync(baselinesDir), ['compliance-haiku.json'])
})
