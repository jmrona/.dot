import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

const planner = () => read('agents/stack-planner.md')
const fastPath = () => read('skills/fast-path-implementation/SKILL.md')
const dispatch = () => read('skills/_shared/subagent-dispatch.md')

test('stack-planner asks each task for its writes', () => {
  assert.match(planner(), /`writes`/, 'the planner output declares writes per task')
})

test('stack-planner asks each task for what it produces', () => {
  assert.match(planner(), /`produces`/, 'the planner output declares produces per task')
})

test('stack-planner asks each task for what it consumes', () => {
  assert.match(planner(), /`consumes`/, 'the planner output declares consumes per task')
})

test('stack-planner assigns a wave number to each task', () => {
  assert.match(planner(), /wave number/i, 'the planner assigns a wave number')
})

test('stack-planner sends a task it is unsure about to complex-worker', () => {
  assert.match(
    planner(),
    /unsure[^.]*`complex-worker`/i,
    'an unsure task goes to complex-worker',
  )
})

test('stack-planner puts tasks in separate waves when unsure', () => {
  assert.match(
    planner(),
    /unsure[^.]*separate waves/i,
    'unsure tasks go in separate waves',
  )
})

test('fast-path skill does not name a per-task pipeline', () => {
  assert.doesNotMatch(fastPath(), /per-task pipeline/i, 'the per-task pipeline wording is gone')
})

test('fast-path skill refers to the wave gate', () => {
  assert.match(fastPath(), /wave gate/i, 'the verification gate points to the wave gate')
})

test('fast-path skill names its gate step Wave Gate', () => {
  assert.match(fastPath(), /^### 3\. Wave Gate$/m, 'the gate step is headed Wave Gate')
})

test('fast-path skill no longer says verification gate', () => {
  assert.doesNotMatch(fastPath(), /verification gate/i, 'the verification gate wording is gone')
})

test('fast-path skill treats BLOCKED_BY_SIBLING as BLOCKED', () => {
  assert.match(
    fastPath(),
    /`BLOCKED_BY_SIBLING`[^.]*as `BLOCKED`/,
    'a wave of one treats BLOCKED_BY_SIBLING as BLOCKED',
  )
})

test('dispatch rules do not name a per-task pipeline', () => {
  assert.doesNotMatch(dispatch(), /per-task pipeline/i, 'the per-task pipeline wording is absent')
})

test('dispatch rules state that the tasks of one wave are independent work dispatched in background', () => {
  assert.match(
    dispatch(),
    /tasks of one wave[^.]*independent[^.]*`background: true`/i,
    'wave tasks are independent work dispatched with background: true',
  )
})

test('dispatch rules send an unsure subagent-driven-development task to complex-worker', () => {
  assert.match(
    dispatch(),
    /within `subagent-driven-development`[^.]*unsure[^.]*`complex-worker` on `openai\/hard`/i,
    'an unsure task in subagent-driven-development goes to complex-worker',
  )
})

test('fast path declares the batch paths as the implementer writes', () => {
  assert.match(
    fastPath(),
    /declares?[^.]*paths[^.]*as the implementer's `writes`/i,
    'the parent declares the batch paths as writes',
  )
})

test('fast path records the wave base before the dispatch', () => {
  assert.match(
    fastPath(),
    /records? the wave base[^.]*before (the|it) dispatch/i,
    'the wave base is recorded before the dispatch',
  )
})

test('fast path refers to the Wave Gate section of subagent-driven-development', () => {
  assert.match(fastPath(), /## Wave Gate/, 'the verification gate cites the Wave Gate section')
})

test('fast path continues the implementer through sessionID for fixes', () => {
  assert.match(
    fastPath(),
    /continue the same implementer through `sessionID`/i,
    'fixes continue the same implementer',
  )
})

test('dispatch rules do not say to proceed to the next task while a review has issues', () => {
  assert.doesNotMatch(
    dispatch(),
    /Proceed to the next task while/,
    'the unfixed-review rule also covers waves',
  )
})

test('dispatch rules state that reviewers and a wave of one use background true', () => {
  assert.match(
    dispatch(),
    /reviewers and a wave of one[^.]*`background: true`/i,
    'reviewers and a wave of one are dispatched in background',
  )
})

test('fast path points to the User Checkpoint section for commits', () => {
  assert.match(
    fastPath(),
    /## User Checkpoint/,
    'the fast path commit step cites the User Checkpoint section of subagent-driven-development',
  )
})

test('dispatch rules state that the fast-path reviewer stays in the foreground', () => {
  assert.match(
    dispatch(),
    /fast-path reviewer[^.]*foreground/i,
    'the fast-path reviewer is dispatched in the foreground',
  )
})
