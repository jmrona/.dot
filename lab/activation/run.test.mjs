import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { baselinePathFor, executeCommand, runActivationSuite } from './run.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'activation-test-'))
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
const args = process.argv.slice(2)
const prompt = args[1]
const state = ${JSON.stringify(stateDir)}
const emit = (event) => console.log(JSON.stringify(event))
const finish = () => emit({ type: 'result', subtype: 'success', is_error: false })
const skillCall = (name) =>
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'u', name: 'Skill', input: { skill: name } }] } })
function nextFlakyCount() {
  const file = state + '/flaky'
  const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0
  fs.writeFileSync(file, String(count + 1))
  return count
}
if (prompt === 'noinit') process.exit(0)
emit({ type: 'system', subtype: 'init', claude_code_version: '2.1.0', session_id: 's' })
if (prompt.startsWith('skill:')) {
  skillCall(prompt.slice('skill:'.length))
  setTimeout(() => {}, 60000)
} else if (prompt === 'hang') setTimeout(() => {}, 60000)
else if (prompt === 'error') {
  emit({ type: 'result', subtype: 'error_during_execution', is_error: true })
  process.exit(1)
} else if (prompt === 'crash') process.exit(1)
else if (prompt === 'maxturns') {
  emit({ type: 'result', subtype: 'error_max_turns', is_error: true, terminal_reason: 'max_turns' })
  process.exit(1)
} else if (prompt === 'badexit') {
  finish()
  process.exit(2)
} else if (prompt === 'flaky') {
  if (nextFlakyCount() < 3) finish()
  else skillCall('debugging')
} else {
  if (prompt === 'record') {
    const record = { args, hasSkillsDir: fs.existsSync('.claude/skills'), hasProject: fs.existsSync('src/slug.mjs') }
    fs.writeFileSync(state + '/record.json', JSON.stringify(record))
  }
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'plain' }] } })
  finish()
}
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

function setOf({ positives, nearMisses = ['plain'], skill = 'debugging' }) {
  return { skill, positives, nearMisses }
}

function suite(sets, overrides = {}) {
  return runActivationSuite({
    sets,
    harnessDir: makeHarness(),
    model: 'haiku',
    runs: 2,
    concurrency: 2,
    timeoutMs: 20000,
    ...overrides,
  })
}

test('runActivationSuite counts the positives that activate the expected skill', async () => {
  const sets = [setOf({ positives: ['skill:debugging', 'plain'] })]
  const { cases } = await withFakeClaude(() => suite(sets))
  assert.deepEqual([cases.debugging.positivePasses, cases.debugging.positiveRuns], [2, 4])
})

test('runActivationSuite counts a near miss that activates the skill as a false activation', async () => {
  const sets = [setOf({ positives: ['plain'], nearMisses: ['skill:debugging', 'plain'] })]
  const { cases } = await withFakeClaude(() => suite(sets))
  assert.deepEqual([cases.debugging.nearMissFalseActivations, cases.debugging.nearMissRuns], [2, 4])
})

test('runActivationSuite records the skill that won when the expected one did not activate', async () => {
  const sets = [setOf({ positives: ['skill:brainstorming', 'plain'] })]
  const { cases } = await withFakeClaude(() => suite(sets))
  assert.deepEqual(cases.debugging.winners, { brainstorming: 2, none: 2 })
})

test('runActivationSuite stops claude at the first Skill tool use instead of waiting for it to finish', async () => {
  const sets = [setOf({ positives: ['skill:debugging'] })]
  const { cases } = await withFakeClaude(() => suite(sets, { timeoutMs: 15000 }))
  assert.equal(cases.debugging.environmentFailures, 0)
})

test('runActivationSuite counts a run without an init event as an environment failure', async () => {
  const sets = [setOf({ positives: ['noinit'] })]
  const { cases } = await withFakeClaude(() => suite(sets))
  assert.equal(cases.debugging.environmentFailures, 2)
  assert.match(cases.debugging.environmentFailureReasons[0], /no init event/)
})

test('runActivationSuite counts a timed out run as an environment failure', async () => {
  const sets = [setOf({ positives: ['hang'] })]
  const { cases } = await withFakeClaude(() => suite(sets, { timeoutMs: 500 }))
  assert.match(cases.debugging.environmentFailureReasons[0], /timed out/)
})

test('runActivationSuite counts a run that claude reports as an error as an environment failure', async () => {
  const sets = [setOf({ positives: ['error'] })]
  const { cases } = await withFakeClaude(() => suite(sets))
  assert.match(cases.debugging.environmentFailureReasons[0], /error/)
})

test('runActivationSuite reports the Claude Code version from the init event', async () => {
  const sets = [setOf({ positives: ['plain'] })]
  const result = await withFakeClaude(() => suite(sets))
  assert.deepEqual([result.claudeCodeVersion, result.model], ['2.1.0', 'haiku'])
})

test('runActivationSuite runs claude with the Skill and Read tools, two turns and a small project', async () => {
  const sets = [setOf({ positives: ['record'], nearMisses: ['plain'] })]
  const record = await withFakeClaude(async ({ stateDir }) => {
    await suite(sets, { runs: 1 })
    return JSON.parse(fs.readFileSync(path.join(stateDir, 'record.json'), 'utf8'))
  })
  const { args } = record
  assert.deepEqual(
    [args[args.indexOf('--allowedTools') + 1], args[args.indexOf('--max-turns') + 1], record.hasProject],
    ['Skill,Read', '2', true],
  )
})

test('runActivationSuite runs claude in a sandbox that holds the harness skills', async () => {
  const sets = [setOf({ positives: ['record'], nearMisses: ['plain'] })]
  const record = await withFakeClaude(async ({ stateDir }) => {
    await suite(sets, { runs: 1 })
    return JSON.parse(fs.readFileSync(path.join(stateDir, 'record.json'), 'utf8'))
  })
  assert.equal(record.hasSkillsDir, true)
})

test('runActivationSuite counts a crash after init with no result event as an environment failure', async () => {
  const { cases } = await withFakeClaude(() => suite([setOf({ positives: ['crash'] })]))
  assert.equal(cases.debugging.environmentFailures, 2)
  assert.match(cases.debugging.environmentFailureReasons[0], /result event/)
})

test('runActivationSuite does not score a near miss pass for a crashed run', async () => {
  const { cases } = await withFakeClaude(() => suite([setOf({ positives: ['plain'], nearMisses: ['crash'] })]))
  assert.deepEqual([cases.debugging.nearMissPasses, cases.debugging.nearMissRuns], [0, 0])
})

test('runActivationSuite counts a successful result with a non-zero exit code as an environment failure', async () => {
  const { cases } = await withFakeClaude(() => suite([setOf({ positives: ['badexit'] })]))
  assert.match(cases.debugging.environmentFailureReasons[0], /exit code 2/)
})

test('runActivationSuite scores a run that ends on the turn limit with no Skill as no activation', async () => {
  const { cases } = await withFakeClaude(() => suite([setOf({ positives: ['maxturns'] })]))
  assert.deepEqual(
    [cases.debugging.environmentFailures, cases.debugging.positivePasses, cases.debugging.winners],
    [0, 0, { none: 2 }],
  )
})

test('runActivationSuite reports a prefixed skill name as the winner without normalising it', async () => {
  const { cases } = await withFakeClaude(() => suite([setOf({ positives: ['skill:foo:debugging'] })]))
  assert.deepEqual(cases.debugging.winners, { 'foo:debugging': 2 })
})

function commandInput(overrides = {}) {
  const logged = []
  return {
    logged,
    input: {
      command: 'capture',
      options: { model: 'haiku', runs: 2, concurrency: 2, only: undefined, timeoutSeconds: 20 },
      sets: [setOf({ positives: ['skill:debugging', 'plain'] })],
      harnessDir: makeHarness(),
      baselinesDir: makeTempDir(),
      log: (line) => logged.push(line),
      ...overrides,
    },
  }
}

function readBaselineFile(baselinesDir) {
  return JSON.parse(fs.readFileSync(baselinePathFor({ baselinesDir, model: 'haiku' }), 'utf8'))
}

test('baselinePathFor names the file activation-<model>.json', () => {
  assert.equal(path.basename(baselinePathFor({ baselinesDir: 'b', model: 'opus' })), 'activation-opus.json')
})

test('capture writes the per skill summary to the baseline', async () => {
  const { input } = commandInput()
  const code = await withFakeClaude(() => executeCommand(input))
  const baseline = readBaselineFile(input.baselinesDir)
  assert.deepEqual(
    [code, baseline.model, baseline.claudeCodeVersion, baseline.cases.debugging.positivePasses],
    [0, 'haiku', '2.1.0', 2],
  )
})

test('capture refuses to write the baseline on an environment failure and writes a partial file', async () => {
  const { input, logged } = commandInput({ sets: [setOf({ positives: ['noinit', 'plain'] })] })
  const code = await withFakeClaude(() => executeCommand(input))
  assert.deepEqual(
    [code, fs.existsSync(baselinePathFor({ baselinesDir: input.baselinesDir, model: 'haiku' })),
      fs.existsSync(path.join(input.baselinesDir, '.partial-activation-haiku.json'))],
    [1, false, true],
  )
  assert.ok(logged.some((line) => /Not writing the baseline/.test(line)))
})

test('capture with only keeps the skills that were not recaptured', async () => {
  const { input } = commandInput({
    sets: [setOf({ positives: ['plain'] }), setOf({ skill: 'commit-msg', positives: ['plain'] })],
  })
  await withFakeClaude(() => executeCommand(input))
  await withFakeClaude(() =>
    executeCommand({ ...input, options: { ...input.options, only: ['commit-msg'] } }),
  )
  assert.deepEqual(Object.keys(readBaselineFile(input.baselinesDir).cases).sort(), ['commit-msg', 'debugging'])
})

test('capture with an unknown skill in only fails with an actionable message', async () => {
  const { input } = commandInput()
  const options = { ...input.options, only: ['nonsense'] }
  await assert.rejects(withFakeClaude(() => executeCommand({ ...input, options })), /nonsense.*--only/s)
})

test('compare passes when the skills activate as often as in the baseline', async () => {
  const { input, logged } = commandInput()
  await withFakeClaude(() => executeCommand(input))
  const code = await withFakeClaude(() => executeCommand({ ...input, command: 'compare' }))
  assert.equal(code, 0)
  assert.ok(logged.some((line) => /no regressions/.test(line)))
})

test('compare fails when a skill stops activating and a rerun confirms it', async () => {
  const { input, logged } = commandInput()
  await withFakeClaude(() => executeCommand(input))
  const broken = { ...input, command: 'compare', sets: [setOf({ positives: ['plain', 'plain'] })] }
  const code = await withFakeClaude(() => executeCommand(broken))
  assert.equal(code, 1)
  assert.ok(logged.some((line) => /regressions: debugging/.test(line)))
})

test('compare does not fail when the rerun of a regressed skill recovers', async () => {
  const { input } = commandInput({
    options: { model: 'haiku', runs: 3, concurrency: 1, only: undefined, timeoutSeconds: 20 },
    sets: [setOf({ positives: ['skill:debugging'] })],
  })
  await withFakeClaude(() => executeCommand(input))
  const flaky = { ...input, command: 'compare', sets: [setOf({ positives: ['flaky'] })] }
  const code = await withFakeClaude(() => executeCommand(flaky))
  assert.equal(code, 0)
})

test('compare refuses to assess a run with environment failures', async () => {
  const { input, logged } = commandInput()
  await withFakeClaude(() => executeCommand(input))
  const broken = { ...input, command: 'compare', sets: [setOf({ positives: ['noinit', 'plain'] })] }
  const code = await withFakeClaude(() => executeCommand(broken))
  assert.equal(code, 1)
  assert.ok(logged.some((line) => /Cannot assess this run/.test(line)))
})

test('compare rejects a baseline captured with another model', async () => {
  const { input } = commandInput()
  await withFakeClaude(() => executeCommand(input))
  const baselinePath = baselinePathFor({ baselinesDir: input.baselinesDir, model: 'haiku' })
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  fs.writeFileSync(baselinePath, JSON.stringify({ ...baseline, claudeCodeVersion: '1.0.0' }))
  await assert.rejects(
    withFakeClaude(() => executeCommand({ ...input, command: 'compare' })),
    /claudeCodeVersion 1\.0\.0/,
  )
})

test('compare without a baseline tells the user how to capture one', async () => {
  const { input } = commandInput({ command: 'compare' })
  await assert.rejects(executeCommand(input), /Run capture --model haiku/)
})

test('the report table shows the positive rate, the false activations and the winner of a miss', async () => {
  const { input, logged } = commandInput({ sets: [setOf({ positives: ['skill:brainstorming', 'plain'] })] })
  await withFakeClaude(() => executeCommand(input))
  const line = logged.find((entry) => entry.startsWith('debugging'))
  assert.match(line, /positive 0\/4.*false activations 0\/2.*brainstorming x2, none x2/)
})

test('capture with only and no baseline fails before any model run', async () => {
  const { input } = commandInput({ sets: [setOf({ positives: ['record'] })] })
  const options = { ...input.options, only: ['debugging'] }
  const stateDir = await withFakeClaude(async ({ stateDir: dir }) => {
    await assert.rejects(executeCommand({ ...input, options }), /No baseline found/)
    return dir
  })
  assert.equal(fs.existsSync(path.join(stateDir, 'record.json')), false)
})
