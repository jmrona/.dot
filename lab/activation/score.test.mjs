import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findActivationRegressions,
  findFirstSkill,
  firstInvokedSkill,
  summariseActivation,
} from './score.mjs'

const INIT = { type: 'system', subtype: 'init', claude_code_version: '2.1.0' }

function toolUse(name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'u', name, input }] } }
}

function stream(...events) {
  return events.map((event) => JSON.stringify(event)).join('\n')
}

test('findFirstSkill returns the skill named by the first Skill tool use', () => {
  const text = stream(INIT, toolUse('Skill', { skill: 'debugging' }), toolUse('Skill', { skill: 'commit-msg' }))
  assert.equal(findFirstSkill(text), 'debugging')
})

test('findFirstSkill returns null when no Skill tool is used', () => {
  assert.equal(findFirstSkill(stream(INIT, toolUse('Read', { file_path: 'a' }))), null)
})

test('findFirstSkill ignores the tool uses of other tools before the Skill', () => {
  const text = stream(INIT, toolUse('Read', { skill: 'nope' }), toolUse('Skill', { skill: 'brainstorming' }))
  assert.equal(findFirstSkill(text), 'brainstorming')
})

test('findFirstSkill ignores malformed lines', () => {
  const text = `${JSON.stringify(INIT)}\n{not json\n${JSON.stringify(toolUse('Skill', { skill: 'debugging' }))}`
  assert.equal(findFirstSkill(text), 'debugging')
})

test('findFirstSkill ignores partial stream events whose input is still empty', () => {
  const partial = {
    type: 'stream_event',
    event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Skill', input: {} } },
  }
  assert.equal(findFirstSkill(stream(INIT, partial)), null)
})

test('findFirstSkill throws an environment failure when the init event is missing', () => {
  assert.throws(
    () => findFirstSkill(stream(toolUse('Skill', { skill: 'debugging' }))),
    { name: 'EnvironmentFailure', message: /init event/ },
  )
})

test('firstInvokedSkill does not need an init event', () => {
  assert.equal(firstInvokedSkill([toolUse('Skill', { skill: 'debugging' })]), 'debugging')
})

function positive(skill, activated) {
  return { skill, kind: 'positive', activated }
}

function nearMiss(skill, activated) {
  return { skill, kind: 'nearMiss', activated }
}

test('summariseActivation gives the positive rate of a skill', () => {
  const results = [positive('debugging', 'debugging'), positive('debugging', 'debugging'), positive('debugging', null)]
  const { debugging } = summariseActivation(results)
  assert.deepEqual([debugging.positivePasses, debugging.positiveRuns], [2, 3])
  assert.equal(debugging.positiveRate, 2 / 3)
})

test('summariseActivation gives the false activation rate of a near miss', () => {
  const results = [nearMiss('debugging', 'debugging'), nearMiss('debugging', null), nearMiss('debugging', 'commit-msg')]
  const { debugging } = summariseActivation(results)
  assert.deepEqual([debugging.nearMissFalseActivations, debugging.nearMissPasses, debugging.nearMissRuns], [1, 2, 3])
  assert.equal(debugging.falseActivationRate, 1 / 3)
})

test('summariseActivation counts the winners when the expected skill did not activate', () => {
  const results = [
    positive('debugging', 'brainstorming'),
    positive('debugging', 'brainstorming'),
    positive('debugging', null),
    positive('debugging', 'debugging'),
  ]
  assert.deepEqual(summariseActivation(results).debugging.winners, { brainstorming: 2, none: 1 })
})

test('summariseActivation does not count near miss activations as winners', () => {
  assert.deepEqual(summariseActivation([nearMiss('debugging', 'commit-msg')]).debugging.winners, {})
})

test('summariseActivation keeps skills apart', () => {
  const summary = summariseActivation([positive('debugging', 'debugging'), positive('commit-msg', null)])
  assert.deepEqual([summary.debugging.positivePasses, summary['commit-msg'].positivePasses], [1, 0])
})

test('summariseActivation gives a null rate when a kind has no runs', () => {
  const { debugging } = summariseActivation([positive('debugging', 'debugging')])
  assert.deepEqual([debugging.falseActivationRate, debugging.nearMissRuns], [null, 0])
})

test('summariseActivation leaves environment failures out of the rates and records their reasons', () => {
  const failure = { skill: 'debugging', kind: 'positive', environmentFailure: true, reason: 'timed out' }
  const { debugging } = summariseActivation([positive('debugging', 'debugging'), failure])
  assert.deepEqual(
    [debugging.positiveRuns, debugging.environmentFailures, debugging.environmentFailureReasons],
    [1, 1, ['timed out']],
  )
})

function baselineOf(skills) {
  return { cases: skills }
}

function counts({ positivePasses, positiveRuns = 9, nearMissPasses = 6, nearMissRuns = 6 }) {
  return { positivePasses, positiveRuns, nearMissPasses, nearMissRuns }
}

test('findActivationRegressions reports a skill whose positive passes fall by two', () => {
  const baseline = baselineOf({ debugging: counts({ positivePasses: 9 }) })
  const current = baselineOf({ debugging: counts({ positivePasses: 7 }) })
  assert.deepEqual(findActivationRegressions({ baseline, current }), ['debugging'])
})

test('findActivationRegressions tolerates a loss of one positive pass', () => {
  const baseline = baselineOf({ debugging: counts({ positivePasses: 9 }) })
  const current = baselineOf({ debugging: counts({ positivePasses: 8 }) })
  assert.deepEqual(findActivationRegressions({ baseline, current }), [])
})

test('findActivationRegressions reports a skill whose near miss passes fall by two', () => {
  const baseline = baselineOf({ debugging: counts({ positivePasses: 9 }) })
  const current = baselineOf({ debugging: counts({ positivePasses: 9, nearMissPasses: 4 }) })
  assert.deepEqual(findActivationRegressions({ baseline, current }), ['debugging'])
})

test('findActivationRegressions lists each regressed skill once, sorted', () => {
  const baseline = baselineOf({
    debugging: counts({ positivePasses: 9 }),
    'commit-msg': counts({ positivePasses: 9 }),
  })
  const current = baselineOf({
    debugging: counts({ positivePasses: 5, nearMissPasses: 1 }),
    'commit-msg': counts({ positivePasses: 5 }),
  })
  assert.deepEqual(findActivationRegressions({ baseline, current }), ['commit-msg', 'debugging'])
})

test('findActivationRegressions ignores skills that are not in the baseline', () => {
  const current = baselineOf({ debugging: counts({ positivePasses: 0 }) })
  assert.deepEqual(findActivationRegressions({ baseline: baselineOf({}), current }), [])
})
