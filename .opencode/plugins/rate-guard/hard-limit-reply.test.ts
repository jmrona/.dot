import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hardLimitReplyOf } from './hard-limit-reply.ts'

const SESSION = 'ses_current'

function enqueued(text: unknown, sessionID = SESSION, itemType = 'synthetic'): unknown {
  return {
    type: 'session.inbox.enqueued',
    data: { sessionID, item: { type: itemType, payload: { text } } },
  }
}

test('show reply is classified as info', () => {
  const text = 'At most 3 openai/hard subagents run at once.'
  assert.deepEqual(hardLimitReplyOf(enqueued(text), SESSION), { message: text, variant: 'info' })
})

test('set reply is classified as info', () => {
  const text = 'At most 5 openai/hard subagents now run at once.'
  assert.deepEqual(hardLimitReplyOf(enqueued(text), SESSION), { message: text, variant: 'info' })
})

test('save failure is classified as error', () => {
  const text = 'Could not save the hard subagent limit: disk full. The limit is unchanged.'
  assert.deepEqual(hardLimitReplyOf(enqueued(text), SESSION), { message: text, variant: 'error' })
})

test('usage text is classified as error', () => {
  const text = 'Use /hard-limit to show the limit or /hard-limit <1-10> to set it.'
  assert.deepEqual(hardLimitReplyOf(enqueued(text), SESSION), { message: text, variant: 'error' })
})

test('reply for another session gives undefined', () => {
  const event = enqueued('At most 3 openai/hard subagents run at once.', 'ses_other')
  assert.equal(hardLimitReplyOf(event, SESSION), undefined)
})

test('undefined current session gives undefined', () => {
  const event = enqueued('At most 3 openai/hard subagents run at once.')
  assert.equal(hardLimitReplyOf(event, undefined), undefined)
})

test('non-synthetic item gives undefined', () => {
  const event = enqueued('At most 3 openai/hard subagents run at once.', SESSION, 'user')
  assert.equal(hardLimitReplyOf(event, SESSION), undefined)
})

test('unrelated synthetic text gives undefined', () => {
  assert.equal(hardLimitReplyOf(enqueued('Compaction finished.'), SESSION), undefined)
})

test('null event gives undefined', () => {
  assert.equal(hardLimitReplyOf(null, SESSION), undefined)
})

test('non-string text gives undefined', () => {
  assert.equal(hardLimitReplyOf(enqueued(42), SESSION), undefined)
})

test('auto-compact reply text gives undefined', () => {
  assert.equal(hardLimitReplyOf(enqueued('Auto-compact threshold set to 80%.'), SESSION), undefined)
})
