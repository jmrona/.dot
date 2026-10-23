import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSlotSemaphore } from './semaphore.ts'
import { createSlotTracker, type SubagentCall } from './slot-tracker.ts'

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function createFixture(limit: number, hardAgents: string[] = ['hard-agent']) {
  const semaphore = createSlotSemaphore(limit, async () => true)
  const tracker = createSlotTracker({
    semaphore,
    isHardAgent: async (agentID) => hardAgents.includes(agentID),
  })
  return { semaphore, tracker }
}

function call(id: string, options: Partial<SubagentCall> = {}): SubagentCall {
  return {
    tool: 'subagent',
    sessionID: 'parent',
    id,
    input: { agent: 'hard-agent' },
    ...options,
  }
}

function backgroundCall(id: string): SubagentCall {
  return call(id, { input: { agent: 'hard-agent', background: true } })
}

function track(promise: Promise<void>): { done: boolean } {
  const state = { done: false }
  void promise.then(() => {
    state.done = true
  })
  return state
}

function startedResult(childID: string, status = 'running'): SubagentCall {
  return { ...call('x'), result: { output: { sessionID: childID, status } } }
}

test('the third hard call waits while two hard calls are running', async () => {
  const { tracker } = createFixture(2)
  await tracker.beforeExecute(call('c1'))
  await tracker.beforeExecute(call('c2'))
  const third = track(tracker.beforeExecute(call('c3')))
  await settle()
  assert.equal(third.done, false)
})

test('a foreground slot is released when its execute.after arrives', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...call('c1'), result: { output: { sessionID: 'child-1' } } })
  await settle()
  assert.equal(second.done, true)
})

test('a call to an agent that is not hard is never gated', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const easy = track(tracker.beforeExecute(call('c2', { input: { agent: 'easy-agent' } })))
  await settle()
  assert.equal(easy.done, true)
})

test('a tool that is not subagent is never gated', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const other = track(tracker.beforeExecute(call('c2', { tool: 'bash' })))
  await settle()
  assert.equal(other.done, true)
})

test('a background slot stays held after execute.after reports it running', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  await settle()
  assert.equal(second.done, false)
})

test('a background slot is released when the child execution succeeds', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  tracker.handleEvent({ type: 'session.execution.succeeded', data: { sessionID: 'child-1' } })
  await settle()
  assert.equal(second.done, true)
})

test('a background slot is released when the child execution fails', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  tracker.handleEvent({ type: 'session.execution.failed', data: { sessionID: 'child-1' } })
  await settle()
  assert.equal(second.done, true)
})

test('a background slot is released when the child execution is interrupted', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'child-1' } })
  await settle()
  assert.equal(second.done, true)
})

test('a child end event releases a background slot only once', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  tracker.handleEvent({ type: 'session.execution.succeeded', data: { sessionID: 'child-1' } })
  tracker.handleEvent({ type: 'session.execution.succeeded', data: { sessionID: 'child-1' } })
  await tracker.beforeExecute(call('c2'))
  const third = track(tracker.beforeExecute(call('c3')))
  await settle()
  assert.equal(third.done, false)
})

test('an interrupted parent session drops its queued caller without a slot', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1', { sessionID: 'other' }))
  const queued = track(tracker.beforeExecute(call('c2')))
  await settle()
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  await settle()
  await tracker.afterExecute(call('c1', { sessionID: 'other' }))
  const next = track(tracker.beforeExecute(call('c3', { sessionID: 'other' })))
  await settle()
  assert.deepEqual([queued.done, next.done], [true, true])
})

test('a failed tool call drops that queued caller', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const queued = track(tracker.beforeExecute(call('c2')))
  await settle()
  tracker.handleEvent({ type: 'session.tool.failed', data: { sessionID: 'parent', id: 'c2' } })
  await settle()
  assert.equal(queued.done, true)
})

test('a dropped queued caller never holds a slot', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const queued = tracker.beforeExecute(call('c2'))
  await settle()
  tracker.handleEvent({ type: 'session.tool.failed', data: { sessionID: 'parent', id: 'c2' } })
  await queued
  await tracker.afterExecute(call('c2'))
  await tracker.afterExecute(call('c1'))
  const next = track(tracker.beforeExecute(call('c3')))
  await settle()
  assert.equal(next.done, true)
})

test('a lookup that fails lets the call through without a slot', async () => {
  const semaphore = createSlotSemaphore(1, async () => true)
  const tracker = createSlotTracker({
    semaphore,
    isHardAgent: async () => {
      throw new Error('lookup failed')
    },
  })
  const passed = track(tracker.beforeExecute(call('c1')))
  await settle()
  assert.equal(passed.done, true)
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('an interrupt during the agent lookup leaves the next caller unblocked', async () => {
  const lookup = deferred()
  let isFirstLookup = true
  const semaphore = createSlotSemaphore(1, async () => true)
  const tracker = createSlotTracker({
    semaphore,
    isHardAgent: async () => {
      if (isFirstLookup) {
        isFirstLookup = false
        await lookup.promise
      }
      return true
    },
  })
  const first = tracker.beforeExecute(call('c1'))
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  lookup.resolve()
  await first
  const next = track(tracker.beforeExecute(call('c2', { sessionID: 'resumed' })))
  await settle()
  assert.equal(next.done, true)
})

test('an interrupt while the session is being checked leaves the next caller unblocked', async () => {
  const sessionCheck = deferred()
  let isFirstCheck = true
  const semaphore = createSlotSemaphore(1, async () => {
    if (isFirstCheck) {
      isFirstCheck = false
      await sessionCheck.promise
    }
    return true
  })
  const tracker = createSlotTracker({ semaphore, isHardAgent: async () => true })
  const first = tracker.beforeExecute(call('c1'))
  await settle()
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  sessionCheck.resolve()
  await first
  const next = track(tracker.beforeExecute(call('c2', { sessionID: 'resumed' })))
  await settle()
  assert.equal(next.done, true)
})

test('a failed tool event for a call that holds a slot releases the slot', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const next = track(tracker.beforeExecute(call('c2')))
  tracker.handleEvent({ type: 'session.tool.failed', data: { sessionID: 'parent', id: 'c1' } })
  await settle()
  assert.equal(next.done, true)
})

test('a later call in a resumed session still takes a slot after an interrupt', async () => {
  const { tracker } = createFixture(1)
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  await tracker.beforeExecute(call('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await settle()
  assert.equal(second.done, false)
})

test('a deleted background child releases its slot', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  const second = track(tracker.beforeExecute(call('c2')))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  tracker.handleEvent({ type: 'session.deleted', data: { sessionID: 'child-1' } })
  await settle()
  assert.equal(second.done, true)
})

test('an interrupted parent releases its foreground slot', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  const second = track(tracker.beforeExecute(call('c2', { sessionID: 'other' })))
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  await settle()
  assert.equal(second.done, true)
})

test('a background slot survives a parent interrupt', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(backgroundCall('c1'))
  await tracker.afterExecute({ ...backgroundCall('c1'), result: startedResult('child-1').result })
  const second = track(tracker.beforeExecute(call('c2', { sessionID: 'other' })))
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  await settle()
  assert.equal(second.done, false)
})

test('a later execute.after after an interrupt does not release twice', async () => {
  const { tracker } = createFixture(1)
  await tracker.beforeExecute(call('c1'))
  tracker.handleEvent({ type: 'session.execution.interrupted', data: { sessionID: 'parent' } })
  await tracker.beforeExecute(call('c2', { sessionID: 'other' }))
  await tracker.afterExecute(call('c1'))
  const third = track(tracker.beforeExecute(call('c3', { sessionID: 'other' })))
  await settle()
  assert.equal(third.done, false)
})
