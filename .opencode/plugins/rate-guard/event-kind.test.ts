import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyEvent } from './event-kind.ts'

test('an execution that succeeded ends the session it names', () => {
  const event = { type: 'session.execution.succeeded', data: { sessionID: 'child' } }
  assert.deepEqual(classifyEvent(event), { kind: 'executionEnded', sessionID: 'child', wasInterrupted: false })
})

test('an execution that failed ends the session it names', () => {
  const event = { type: 'session.execution.failed', data: { sessionID: 'child' } }
  assert.deepEqual(classifyEvent(event), { kind: 'executionEnded', sessionID: 'child', wasInterrupted: false })
})

test('an interrupted execution ends the session and is marked interrupted', () => {
  const event = { type: 'session.execution.interrupted', data: { sessionID: 'parent' } }
  assert.deepEqual(classifyEvent(event), { kind: 'executionEnded', sessionID: 'parent', wasInterrupted: true })
})

test('a failed tool event names the call that failed', () => {
  const event = { type: 'session.tool.failed', data: { sessionID: 'parent', id: 'call-1' } }
  assert.deepEqual(classifyEvent(event), { kind: 'toolFailed', callID: 'call-1' })
})

test('any other event is ignored', () => {
  const event = { type: 'session.compaction.ended', data: { sessionID: 'parent' } }
  assert.deepEqual(classifyEvent(event), { kind: 'ignored' })
})

test('an event without a session identifier is ignored', () => {
  const event = { type: 'session.execution.succeeded', data: {} }
  assert.deepEqual(classifyEvent(event), { kind: 'ignored' })
})

test('classifies a deleted session as sessionDeleted', () => {
  const event = { type: 'session.deleted', data: { sessionID: 'child' } }
  assert.deepEqual(classifyEvent(event), { kind: 'sessionDeleted', sessionID: 'child' })
})

test('a deleted session event without a session identifier is ignored', () => {
  const event = { type: 'session.deleted', data: {} }
  assert.deepEqual(classifyEvent(event), { kind: 'ignored' })
})
