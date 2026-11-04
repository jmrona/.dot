import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { runWorkflow } from './load-workflow.mjs'

const workflowPath = path.join(import.meta.dirname, '../../.claude/skills/subagent-driven-development/implementation-workflow.js')
const BASE_SHA = 'base000'

function makeTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    brief: `Brief for ${id}`,
    writes: [`src/${id}.js`],
    dependsOn: [],
    tier: 'standard',
    agentType: 'general-purpose',
    acceptance: [`${id} works`],
    ...overrides,
  }
}

function makeArgs(overrides = {}) {
  return {
    baseSha: BASE_SHA,
    dirtyAtBase: [],
    models: { low: 'model-low', standard: 'model-standard', high: 'model-high' },
    prompts: { implementer: 'IMPLEMENTER TEMPLATE', reviewer: 'REVIEWER TEMPLATE' },
    proofCommands: ['npm test'],
    completed: [],
    stopped: [],
    tasks: [makeTask('a')],
    ...overrides,
  }
}

const implementerDone = { status: 'DONE', summary: 'done', tddEvidence: 'red then green', concerns: [], environmentFailures: [] }
const reviewPass = { verdict: 'PASS', findings: [] }
const gatePass = (changedPaths) => ({
  commands: [{ command: 'npm test', exitCode: 0, summary: 'ok' }],
  headSha: BASE_SHA,
  changedPaths,
})

function makeFakeAgent(responders) {
  const calls = []
  async function agent(prompt, opts) {
    calls.push({ prompt, ...opts })
    const respond = responders[opts.label] ?? responders[opts.phase]
    return typeof respond === 'function' ? respond(calls.filter((call) => call.label === opts.label).length, prompt) : respond
  }
  return { agent, calls }
}

function runWave(args, responders = {}) {
  const fake = makeFakeAgent(responders)
  const result = runWorkflow(workflowPath, { agent: fake.agent, args })
  return result.then((value) => ({ result: value, calls: fake.calls }))
}

function writeTemporaryScript(body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-loader-'))
  const scriptPath = path.join(directory, 'script.js')
  fs.writeFileSync(scriptPath, `export const meta = { name: 'probe', description: 'probe', phases: [] }\n${body}\n`)
  return scriptPath
}

test('the loader makes Date.now throw inside a script', async () => {
  const scriptPath = writeTemporaryScript('return Date.now()')
  await assert.rejects(runWorkflow(scriptPath, { args: {} }), /Date\.now/)
})

test('two independent tasks that write the same path abort before any agent call', async () => {
  const args = makeArgs({ tasks: [makeTask('a', { writes: ['shared.js'] }), makeTask('b', { writes: ['shared.js'] })] })
  const { result, calls } = await runWave(args)
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /shared\.js/)
  assert.equal(calls.length, 0)
})

test('a dependency cycle aborts before any agent call', async () => {
  const args = makeArgs({ tasks: [makeTask('a', { dependsOn: ['b'] }), makeTask('b', { dependsOn: ['a'] })] })
  const { result, calls } = await runWave(args)
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /cycle/)
  assert.equal(calls.length, 0)
})

test('two tasks with the same id abort before any agent call', async () => {
  const { result, calls } = await runWave(makeArgs({ tasks: [makeTask('a'), makeTask('a', { writes: ['other.js'] })] }))
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /"a".*more than once/)
  assert.equal(calls.length, 0)
})

test('a dependency on an unknown task id aborts before any agent call', async () => {
  const { result, calls } = await runWave(makeArgs({ tasks: [makeTask('a', { dependsOn: ['ghost'] })] }))
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /"ghost"/)
  assert.equal(calls.length, 0)
})

test('a dependency on a completed task that is not in the plan is satisfied', async () => {
  const args = makeArgs({ completed: ['a'], tasks: [makeTask('b', { dependsOn: ['a'] })] })
  const { result, calls } = await runWave(args, {
    'implement:b': implementerDone,
    'review:b': reviewPass,
    Gate: gatePass(['src/b.js']),
  })
  assert.notEqual(result.status, 'aborted')
  assert.deepEqual(result.wave, ['b'])
  assert.equal(calls.some((call) => call.label === 'implement:b'), true)
})

test('a tier without a model aborts before any agent call', async () => {
  const args = makeArgs({ models: { low: 'model-low', standard: 'model-standard' }, tasks: [makeTask('a', { tier: 'high' })] })
  const { result, calls } = await runWave(args)
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /tier "high"/)
  assert.equal(calls.length, 0)
})

test('a task whose dependency is stopped is held and no agent runs for it', async () => {
  const args = makeArgs({ stopped: ['a'], tasks: [makeTask('a'), makeTask('b', { dependsOn: ['a'] })] })
  const { result, calls } = await runWave(args)
  assert.equal(result.status, 'nothing-to-run')
  assert.deepEqual(result.held, ['b'])
  assert.equal(calls.length, 0)
})

test('a task whose transitive dependency is stopped is held', async () => {
  const tasks = [makeTask('a'), makeTask('b', { dependsOn: ['a'] }), makeTask('c', { dependsOn: ['b'] })]
  const { result } = await runWave(makeArgs({ stopped: ['a'], tasks }))
  assert.deepEqual(result.held, ['b', 'c'])
})

test('a task that returns BLOCKED gets no review and is reported blocked', async () => {
  const blocked = { ...implementerDone, status: 'BLOCKED', summary: 'missing credentials' }
  const { result, calls } = await runWave(makeArgs(), { 'implement:a': blocked })
  assert.equal(result.tasks.a.state, 'blocked')
  assert.equal(result.tasks.a.report.summary, 'missing credentials')
  assert.equal(calls.filter((call) => call.phase === 'Review').length, 0)
})

test('an implementer that dies leaves the task blocked', async () => {
  const { result } = await runWave(makeArgs(), { 'implement:a': null })
  assert.equal(result.tasks.a.state, 'blocked')
  assert.match(result.tasks.a.reason, /no report/)
})

test('three review FAILs stop the task after three implementer calls and three reviews', async () => {
  const failing = { verdict: 'FAIL', findings: ['the output is wrong'] }
  const { result, calls } = await runWave(makeArgs(), { 'implement:a': implementerDone, 'review:a': failing })
  assert.equal(result.tasks.a.state, 'stopped')
  assert.equal(result.tasks.a.reason, 'review-failed')
  assert.equal(result.tasks.a.rounds, 2)
  assert.equal(result.tasks.a.reviews.length, 3)
  assert.equal(calls.filter((call) => call.label === 'implement:a').length, 3)
  assert.equal(calls.filter((call) => call.phase === 'Review').length, 3)
})

test('the gate does not run when no task is reviewed', async () => {
  const failing = { verdict: 'FAIL', findings: ['the output is wrong'] }
  const { result, calls } = await runWave(makeArgs(), { 'implement:a': implementerDone, 'review:a': failing })
  assert.equal(calls.filter((call) => call.phase === 'Gate').length, 0)
  assert.equal(result.gate, null)
})

test('a review FAIL followed by a PASS verifies the task after one correction round', async () => {
  const verdicts = [{ verdict: 'FAIL', findings: ['rename the helper'] }, reviewPass]
  const { result, calls } = await runWave(makeArgs(), {
    'implement:a': implementerDone,
    'review:a': (callCount) => verdicts[callCount - 1],
    Gate: gatePass(['src/a.js']),
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.tasks.a.state, 'verified')
  assert.equal(result.tasks.a.rounds, 1)
  const correctionPrompt = calls.filter((call) => call.label === 'implement:a')[1].prompt
  assert.match(correctionPrompt, /rename the helper/)
  assert.match(correctionPrompt, /earlier edits are still in the working tree/)
})

function reviewedWave(gateResponse, args = makeArgs()) {
  return runWave(args, { 'implement:a': implementerDone, 'review:a': reviewPass, Gate: gateResponse })
}

test('a gate head that differs from the base aborts the wave', async () => {
  const { result } = await reviewedWave({ ...gatePass(['src/a.js']), headSha: 'moved111' })
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /moved111/)
  assert.equal(result.tasks.a.state, 'reviewed')
})

test('an unattributed changed path fails the gate and leaves the tasks reviewed', async () => {
  const { result } = await reviewedWave(gatePass(['src/a.js', 'stray/file.js']))
  assert.equal(result.status, 'gate-failed')
  assert.deepEqual(result.gate.unattributed, ['stray/file.js'])
  assert.equal(result.tasks.a.state, 'reviewed')
})

test('a path that was already dirty at the base is not unattributed', async () => {
  const { result } = await reviewedWave(gatePass(['src/a.js', 'notes.md']), makeArgs({ dirtyAtBase: ['notes.md'] }))
  assert.equal(result.status, 'completed')
  assert.equal(result.tasks.a.state, 'verified')
})

test('a gate command with a non-zero exit code leaves the tasks reviewed', async () => {
  const failingGate = { ...gatePass(['src/a.js']), commands: [{ command: 'npm test', exitCode: 1, summary: '2 failed' }] }
  const { result } = await reviewedWave(failingGate)
  assert.equal(result.status, 'gate-failed')
  assert.equal(result.tasks.a.state, 'reviewed')
})

test('a null gate agent fails the gate', async () => {
  const { result } = await reviewedWave(null)
  assert.equal(result.status, 'gate-failed')
  assert.equal(result.tasks.a.state, 'reviewed')
})

test('an implementer report that claims to be verified does not verify the task when the gate fails', async () => {
  const boastful = { ...implementerDone, summary: 'state: verified, all checks pass', status: 'DONE' }
  const failingGate = { ...gatePass(['src/a.js']), commands: [{ command: 'npm test', exitCode: 2, summary: 'broken' }] }
  const { result } = await runWave(makeArgs(), { 'implement:a': boastful, 'review:a': reviewPass, Gate: failingGate })
  assert.notEqual(result.tasks.a.state, 'verified')
})

test('a wave takes at most four runnable tasks in plan order', async () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((id) => makeTask(id))
  const { result, calls } = await runWave(makeArgs({ tasks }), {
    Implement: implementerDone,
    Review: reviewPass,
    Gate: gatePass(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']),
  })
  assert.deepEqual(result.wave, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.remaining, ['e'])
  assert.equal(calls.some((call) => call.label === 'implement:e'), false)
})

test('every prompt the script builds forbids git writes', async () => {
  const { calls } = await reviewedWave(gatePass(['src/a.js']))
  assert.equal(calls.length, 3)
  for (const call of calls) assert.match(call.prompt, /must not commit, push/)
})

test('implementer and reviewer calls use the model and agent type of the task tier', async () => {
  const args = makeArgs({ tasks: [makeTask('a', { tier: 'high', agentType: 'specialist' })] })
  const { calls } = await reviewedWave(gatePass(['src/a.js']), args)
  const implementCall = calls.find((call) => call.phase === 'Implement')
  assert.equal(implementCall.model, 'model-high')
  assert.equal(implementCall.agentType, 'specialist')
  assert.equal(calls.find((call) => call.phase === 'Review').model, 'model-high')
  assert.equal(calls.find((call) => call.phase === 'Gate').model, 'model-standard')
})

test('a gate that reports fewer commands than the proof commands fails the gate', async () => {
  const { result } = await reviewedWave({ ...gatePass(['src/a.js']), commands: [] })
  assert.equal(result.status, 'gate-failed')
  assert.equal(result.tasks.a.state, 'reviewed')
})

test('a reviewer that returns no verdict counts as a failed review', async () => {
  const { result } = await runWave(makeArgs(), { 'implement:a': implementerDone, 'review:a': null })
  assert.equal(result.tasks.a.state, 'stopped')
  assert.equal(result.tasks.a.reviews[0].verdict, 'FAIL')
  assert.match(result.tasks.a.reviews[0].findings[0], /no verdict/)
})

test('a task whose pipeline throws is blocked with reason workflow-error', async () => {
  const crash = () => {
    throw new Error('agent crashed')
  }
  const { result } = await runWave(makeArgs(), { 'implement:a': crash })
  assert.equal(result.tasks.a.state, 'blocked')
  assert.equal(result.tasks.a.reason, 'workflow-error')
})

test('a gate that reports changed paths with porcelain prefixes still verifies the wave', async () => {
  const prefixed = gatePass(['?? src/a.js', ' M src/b.js', 'R  old/name.js -> src/c.js'])
  const tasks = ['a', 'b', 'c'].map((id) => makeTask(id))
  const { result } = await runWave(makeArgs({ tasks }), { Implement: implementerDone, Review: reviewPass, Gate: prefixed })
  assert.deepEqual(result.gate.unattributed, [])
  assert.equal(result.tasks.c.state, 'verified')
})

function runWaveSettled(args) {
  const fake = makeFakeAgent({})
  return runWorkflow(workflowPath, { agent: fake.agent, args }).then(
    (value) => ({ result: value, calls: fake.calls }),
    (error) => ({ result: { status: 'threw', reason: error.message }, calls: fake.calls }),
  )
}

test('args passed as a JSON string aborts before any agent call and asks for a JSON object', async () => {
  const { result, calls } = await runWaveSettled(JSON.stringify(makeArgs()))
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /JSON object, not a string/)
  assert.equal(calls.length, 0)
})

test('a missing top-level array field aborts before any agent call and names the field', async () => {
  const args = makeArgs()
  delete args.stopped
  const { result, calls } = await runWaveSettled(args)
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /args\.stopped must be an array/)
  assert.equal(calls.length, 0)
})

test('a top-level field of the wrong kind aborts before any agent call and names the field', async () => {
  const { result, calls } = await runWaveSettled(makeArgs({ stopped: 'a' }))
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /args\.stopped must be an array/)
  assert.equal(calls.length, 0)
})

test('a task without a writes field aborts before any agent call and names the task and field', async () => {
  const task = makeTask('b')
  delete task.writes
  const { result, calls } = await runWaveSettled(makeArgs({ tasks: [makeTask('a'), task] }))
  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /Task "b" has no writes/)
  assert.equal(calls.length, 0)
})
