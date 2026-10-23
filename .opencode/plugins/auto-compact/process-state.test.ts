import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createProcessState, replaceActiveWatcher, sharedProcessState } from './process-state.ts'
import type { ThresholdWatcher } from './threshold.ts'

function recordingWatcher(): ThresholdWatcher & { readonly stops: { count: number } } {
  const stops = { count: 0 }
  return {
    stops,
    stop: () => {
      stops.count += 1
    },
    setPercent: () => undefined,
    isRunning: () => stops.count === 0,
  }
}

test('the shared process state is the same object on every call', () => {
  assert.equal(sharedProcessState(), sharedProcessState())
})

test('a fresh process state starts with no active watcher and empty maps', () => {
  const state = createProcessState()

  assert.equal(state.activeWatcher, undefined)
  assert.equal(state.inFlightBySession.size, 0)
  assert.equal(state.hashesBySession.size, 0)
  assert.equal(state.handledPlanWriteIds.size, 0)
})

test('replacing the active watcher stops the previous watcher', () => {
  const state = createProcessState()
  const previous = recordingWatcher()
  replaceActiveWatcher(state, previous)

  replaceActiveWatcher(state, recordingWatcher())

  assert.equal(previous.stops.count, 1)
})

test('replacing the active watcher stores the new watcher without stopping it', () => {
  const state = createProcessState()
  const next = recordingWatcher()

  replaceActiveWatcher(state, next)

  assert.equal(state.activeWatcher, next)
  assert.equal(next.stops.count, 0)
})

test('replacing the active watcher with none stops the previous watcher and stores none', () => {
  const state = createProcessState()
  const previous = recordingWatcher()
  replaceActiveWatcher(state, previous)

  replaceActiveWatcher(state, undefined)

  assert.equal(previous.stops.count, 1)
  assert.equal(state.activeWatcher, undefined)
})
