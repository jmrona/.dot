import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

const fastPath = () => read('skills/fast-path-implementation/SKILL.md')
const dispatch = () => read('skills/_shared/subagent-dispatch.md')

test('fast-path skill does not name a per-task pipeline', () => {
  assert.doesNotMatch(fastPath(), /per-task pipeline/i)
})

test('dispatch rules do not name a per-task pipeline', () => {
  assert.doesNotMatch(dispatch(), /per-task pipeline/i)
})

test('fast-path skill refers to the wave gate', () => {
  assert.match(fastPath(), /wave gate/i)
})

test('fast-path skill names its gate step Wave Gate', () => {
  assert.match(fastPath(), /### 3\. Wave Gate/)
})

test('fast-path skill does not name a verification gate', () => {
  assert.doesNotMatch(fastPath(), /verification gate/i)
})

test('fast-path skill does not name a parent', () => {
  assert.doesNotMatch(fastPath(), /parent/i)
})

test('fast-path worked example reports that the wave gate passes', () => {
  assert.match(fastPath(), /\[Wave gate PASSES\]/)
})

test('fast-path skill treats BLOCKED_BY_SIBLING as BLOCKED', () => {
  assert.match(fastPath(), /`BLOCKED_BY_SIBLING`[^.]*as `BLOCKED`/)
})

test('fast path declares the batch paths as the implementer writes', () => {
  assert.match(fastPath(), /declares?[^.]*paths[^.]*as the implementer's `writes`/i)
})

test('fast path records the wave base before the dispatch', () => {
  assert.match(fastPath(), /records? the wave base[^.]*before (the|it) dispatch/i)
})

test('fast path refers to the Wave Gate section of subagent-driven-development', () => {
  assert.match(fastPath(), /## Wave Gate/)
})

test('fast path continues the implementer through SendMessage for fixes', () => {
  assert.match(fastPath(), /continue the same implementer through `SendMessage`/i)
})

test('fast path points to the User Checkpoint section for commits', () => {
  assert.match(fastPath(), /## User Checkpoint/)
})

test('fast path offers the wave checkpoint options', () => {
  assert.match(fastPath(), /"Commit all tasks", "Adjust first" and "Skip commit"/)
})

test('dispatch rules state that the tasks of one wave are independent work dispatched in the background', () => {
  assert.match(dispatch(), /tasks of one wave[^.]*independent[^.]*background/i)
})

test('dispatch rules send an unsure subagent-driven-development task to the Standard escalation tier', () => {
  assert.match(
    dispatch(),
    /within `subagent-driven-development`[^.]*unsure[^.]*Standard escalation tier/i,
  )
})

test('dispatch rules scope the unsure-task exception next to the pre-escalation ban', () => {
  assert.match(dispatch(), /MUST NOT\*\* pre-escalate[\s\S]{0,900}within `subagent-driven-development`/i)
})

test('dispatch rules give a harder-than-expected task a new Agent one tier up', () => {
  assert.match(
    dispatch(),
    /`BLOCKED` with a reasoning-capacity cause[^.]*new `Agent`[^.]*one tier up[^.]*same wave/i,
  )
})

test('dispatch rules put subagent-driven-development reviewers and a wave of one in the background', () => {
  assert.match(dispatch(), /reviewer[^.]*background[^.]*\. [^.]*wave of one[^.]*implementer[^.]*background/i)
})

test('dispatch rules name the fast-path reviewer as the one foreground exception', () => {
  assert.match(dispatch(), /fast-path reviewer is the one exception[^.]*foreground/i)
})

test('dispatch rules qualify the session model rationalisation with the unsure-task exception', () => {
  assert.match(dispatch(), /session model to be safe[^\n]*except[^\n]*unsure/i)
})

test('fast path runs the wave gate before the BLOCKED_BY_SIBLING sentence', () => {
  const text = fastPath()
  const gateIndex = text.indexOf('Run the wave gate')
  assert.ok(gateIndex >= 0 && gateIndex < text.indexOf('A wave of one treats'))
})

test('dispatch rules do not say to proceed to the next task while a review has issues', () => {
  assert.doesNotMatch(dispatch(), /Proceed to the next task while/)
})

test('dispatch rules forbid closing a task or starting the next wave with unfixed review issues', () => {
  assert.match(dispatch(), /Close a task or start the next wave while a review has unfixed issues/)
})

test('dispatch rules state that the fast-path reviewer stays in the foreground', () => {
  assert.match(dispatch(), /fast-path reviewer[^.]*foreground/i)
})

test('dispatch rules contain no opencode-only text', () => {
  assert.doesNotMatch(dispatch(), /sessionID|openai\/|stack-specialist|complex-worker|subagent\(\{/)
})

test('fast-path skill contains no opencode-only text', () => {
  assert.doesNotMatch(fastPath(), /sessionID|openai\/|stack-specialist|complex-worker|subagent\(\{/)
})
