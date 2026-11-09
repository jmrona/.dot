import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChildRunResult, ChildRunSpec } from './child-session.ts'
import type { GateInput, GateResult } from './gate.ts'
import type { WavePlan } from './wave-plan.ts'
import { runWave, SUBAGENT_PREAMBLE } from './wave-runner.ts'

type WaveKind = Extract<WavePlan, { kind: 'wave' }>

const BASE_SHA = 'base000'

function buildPlan(taskIds: readonly string[] = ['T1']): WaveKind {
  const wave = taskIds.map((id) => ({
    id, title: `Title ${id}`, brief: `Brief ${id}`, writes: [`src/${id}.ts`], dependsOn: [],
    acceptance: ['works'], tier: 'standard', agentType: 'implementer',
  }))
  const args = {
    baseSha: BASE_SHA, dirtyAtBase: ['notes.md'], models: { standard: 'model-a' },
    proofCommands: ['npm test'], completed: [], stopped: [], tasks: wave,
  }
  return { kind: 'wave', args, wave, held: ['H1'], remaining: ['R1'] }
}

const DONE: ChildRunResult = { ok: true, sessionID: 's', value: { status: 'DONE', summary: 'ok', tddEvidence: 'e', concerns: [], environmentFailures: [] } }
const PASS: ChildRunResult = { ok: true, sessionID: 's', value: { verdict: 'PASS', findings: [] } }
const failVerdict = (...findings: string[]): ChildRunResult => ({ ok: true, sessionID: 's', value: { verdict: 'FAIL', findings } })
const childFailure = (reason: string): ChildRunResult => ({ ok: false, reason })
const implementerStatus = (status: string): ChildRunResult => ({ ok: true, sessionID: 's', value: { status, summary: '', tddEvidence: '', concerns: [], environmentFailures: [] } })

const PASSING_GATE: GateResult = { passed: true, headMoved: false, headSha: BASE_SHA, commands: [], changedPaths: [], unattributed: [] }

function scriptedRunner(script: readonly ChildRunResult[]) {
  const specs: ChildRunSpec[] = []
  const queue = [...script]
  const runChild = async (spec: ChildRunSpec): Promise<ChildRunResult> => {
    specs.push(spec)
    return queue.shift() ?? childFailure('script exhausted')
  }
  return { specs, runChild }
}

function gateRecorder(result: GateResult = PASSING_GATE) {
  const inputs: GateInput[] = []
  const runGate = async (input: GateInput): Promise<GateResult> => {
    inputs.push(input)
    return result
  }
  return { inputs, runGate }
}

function dependenciesFor(script: readonly ChildRunResult[], gateResult?: GateResult, signal?: AbortSignal) {
  const runner = scriptedRunner(script)
  const gate = gateRecorder(gateResult)
  const prompts = { implementer: 'TEMPLATE IMPLEMENTER', reviewer: 'TEMPLATE REVIEWER' }
  const dependencies = { runChild: runner.runChild, runGate: gate.runGate, directory: '/repo', rootSessionID: 'root', signal, prompts }
  return { dependencies, runner, gate }
}

describe('runWave', () => {
  it('verifies a task whose implementer reports DONE and whose reviewer passes first time', async () => {
    const { dependencies, gate } = dependenciesFor([DONE, PASS])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.status, 'completed')
    assert.equal(result.tasks.T1.state, 'verified')
    assert.equal(result.tasks.T1.rounds, 0)
    assert.equal(gate.inputs.length, 1)
  })

  it('carries the wave, held and remaining ids from the plan', async () => {
    const { dependencies } = dependenciesFor([DONE, PASS])
    const result = await runWave(buildPlan(), dependencies)
    assert.deepEqual(result.wave, ['T1'])
    assert.deepEqual(result.held, ['H1'])
    assert.deepEqual(result.remaining, ['R1'])
  })

  it('starts a correction implementer carrying the findings after a reviewer FAIL and ends with rounds 1 on a later PASS', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, failVerdict('rename the helper'), DONE, PASS])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'verified')
    assert.equal(result.tasks.T1.rounds, 1)
    assert.match(runner.specs[2].text, /rename the helper/)
    assert.equal(runner.specs[2].slotKey, 'T1:implement:1')
  })

  it('stops a task with review-failed after two correction rounds', async () => {
    const { dependencies, gate } = dependenciesFor([DONE, failVerdict('a'), DONE, failVerdict('b'), DONE, failVerdict('c')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'stopped')
    assert.equal(result.tasks.T1.reason, 'review-failed')
    assert.equal(result.tasks.T1.rounds, 2)
    assert.equal(gate.inputs.length, 0)
  })

  it('blocks a task when its implementer returns NEEDS_CONTEXT', async () => {
    const { dependencies } = dependenciesFor([implementerStatus('NEEDS_CONTEXT')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'blocked')
    assert.equal(result.tasks.T1.reason, 'implementer returned NEEDS_CONTEXT')
  })

  it('blocks a task when its implementer child run fails', async () => {
    const { dependencies } = dependenciesFor([childFailure('child-timeout')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'blocked')
    assert.equal(result.tasks.T1.reason, 'child-timeout')
  })

  it('blocks a task when a correction implementer returns BLOCKED', async () => {
    const { dependencies } = dependenciesFor([DONE, failVerdict('x'), implementerStatus('BLOCKED')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'blocked')
    assert.equal(result.tasks.T1.reason, 'implementer returned BLOCKED')
    assert.equal(result.tasks.T1.rounds, 1)
  })

  it('blocks a task when the reviewer child times out', async () => {
    const { dependencies } = dependenciesFor([DONE, childFailure('child-timeout')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.state, 'blocked')
    assert.equal(result.tasks.T1.reason, 'child-timeout')
  })

  it('counts a reviewer invalid-report as a FAIL and corrects the task', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, childFailure('invalid-report'), DONE, PASS])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.tasks.T1.rounds, 1)
    assert.match(runner.specs[2].text, /The reviewer returned no valid verdict\./)
  })

  it('sends the JSON reply instruction to implementer and reviewer children', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, PASS])
    await runWave(buildPlan(), dependencies)
    assert.match(runner.specs[0].text, /fenced json block/)
    assert.match(runner.specs[1].text, /fenced json block/)
    assert.equal(runner.specs[0].model, 'model-a')
    assert.equal(runner.specs[1].slotKey, 'T1:review:0')
  })

  it('skips the gate and completes with a null gate when no task reaches review', async () => {
    const { dependencies, gate } = dependenciesFor([childFailure('session-error: boom')])
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.status, 'completed')
    assert.equal(result.gate, null)
    assert.equal(gate.inputs.length, 0)
  })

  it('passes the base SHA, proof commands and attributable paths to the gate', async () => {
    const { dependencies, gate } = dependenciesFor([DONE, PASS])
    await runWave(buildPlan(), dependencies)
    assert.deepEqual(gate.inputs[0], {
      directory: '/repo', baseSha: BASE_SHA, proofCommands: ['npm test'], proofTimeoutSeconds: 1200,
      attributablePaths: ['notes.md', 'src/T1.ts'],
    })
  })

  it('aborts with the commit reason when HEAD moved', async () => {
    const moved = { ...PASSING_GATE, headMoved: true, headSha: 'new111' }
    const { dependencies } = dependenciesFor([DONE, PASS], moved)
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.status, 'aborted')
    assert.match(result.reason ?? '', /HEAD moved from base000 to new111, so a subagent committed/)
    assert.equal(result.tasks.T1.state, 'reviewed')
  })

  it('reports gate-failed and keeps tasks reviewed when the gate does not pass', async () => {
    const { dependencies } = dependenciesFor([DONE, PASS], { ...PASSING_GATE, passed: false })
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.status, 'gate-failed')
    assert.equal(result.tasks.T1.state, 'reviewed')
  })

  it('aborts with reason cancelled and runs no gate when the signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { dependencies, gate } = dependenciesFor([DONE, PASS], undefined, controller.signal)
    const result = await runWave(buildPlan(), dependencies)
    assert.equal(result.status, 'aborted')
    assert.equal(result.reason, 'cancelled')
    assert.equal(result.gate, null)
    assert.equal(gate.inputs.length, 0)
  })
})

describe('child prompts', () => {
  it('starts each implementer text with the subagent preamble and then the implementer template from the dependencies', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, PASS])

    await runWave(buildPlan(), dependencies)

    assert.ok(runner.specs[0].text.startsWith(`${SUBAGENT_PREAMBLE}\n\nTEMPLATE IMPLEMENTER`))
  })

  it('starts each reviewer text with the subagent preamble and then the reviewer template from the dependencies', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, PASS])

    await runWave(buildPlan(), dependencies)

    assert.ok(runner.specs[1].text.startsWith(`${SUBAGENT_PREAMBLE}\n\nTEMPLATE REVIEWER`))
  })

  it('tells the reviewer to read every written path in full because git diff omits new untracked files', async () => {
    const { dependencies, runner } = dependenciesFor([DONE, PASS])

    await runWave(buildPlan(), dependencies)

    assert.match(runner.specs[1].text, /Read every path in writes in full, because git diff omits new untracked files\./)
  })

  it('the subagent preamble invokes the Subagent Exemption and forbids brainstorming and questions to the user', () => {
    assert.match(SUBAGENT_PREAMBLE, /Subagent Exemption/)
    assert.match(SUBAGENT_PREAMBLE, /brainstorming/)
    assert.match(SUBAGENT_PREAMBLE, /ask the user/)
    assert.match(SUBAGENT_PREAMBLE, /Task section below gives the value of every bracketed placeholder/)
  })
})
