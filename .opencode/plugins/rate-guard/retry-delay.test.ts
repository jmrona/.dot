import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyRateLimitDecision, type RetryEvent } from './retry-delay.ts'

function rateLimitEvent(message: string, attempt: number): RetryEvent {
  return {
    attempt,
    error: { type: 'provider.rate-limit', status: 429, message },
    decision: { retry: true, delay: 1 },
  }
}

const noJitter = (): number => 0
const fullJitter = (): number => 1

test('a retry hint in seconds becomes the delay in milliseconds', () => {
  const event = rateLimitEvent('Rate limit reached. Please try again in 1.5s.', 2)
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 1500 })
})

test('a retry hint in milliseconds becomes the delay unchanged', () => {
  const event = rateLimitEvent('Please try again in 500ms.', 2)
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 500 })
})

test('maximum jitter adds twenty percent of the hinted delay', () => {
  const event = rateLimitEvent('Please try again in 10s.', 2)
  applyRateLimitDecision(event, fullJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 12000 })
})

test('the second attempt without a hint waits five seconds', () => {
  const event = rateLimitEvent('Too many requests', 2)
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 5000 })
})

test('each later attempt without a hint doubles the wait', () => {
  const event = rateLimitEvent('Too many requests', 4)
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 20000 })
})

test('the wait without a hint never exceeds sixty seconds before jitter', () => {
  const event = rateLimitEvent('Too many requests', 10)
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 60000 })
})

test('a 429 status is treated as a rate limit whatever the error type', () => {
  const event: RetryEvent = {
    attempt: 2,
    error: { type: 'provider.unknown', status: 429, message: 'slow down' },
    decision: { retry: true, delay: 1 },
  }
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 5000 })
})

test('a rate-limit error type is treated as a rate limit whatever the status', () => {
  const event: RetryEvent = {
    attempt: 2,
    error: { type: 'provider.rate-limit', message: 'slow down' },
    decision: { retry: true, delay: 1 },
  }
  applyRateLimitDecision(event, noJitter)
  assert.deepEqual(event.decision, { retry: true, delay: 5000 })
})

test('an error that is not a rate limit keeps the decision opencode made', () => {
  const original = { retry: true, delay: 2000 }
  const event: RetryEvent = {
    attempt: 2,
    error: { type: 'provider.overloaded', status: 503, message: 'try again in 9s' },
    decision: original,
  }
  applyRateLimitDecision(event, fullJitter)
  assert.equal(event.decision, original)
})

test('a rate-limit error that opencode already marked as final is not retried', () => {
  const final = { retry: false }
  const event: RetryEvent = {
    attempt: 2,
    error: { type: 'provider.rate-limit', status: 429, message: 'insufficient_quota' },
    decision: final,
  }
  applyRateLimitDecision(event, noJitter)
  assert.equal(event.decision, final)
})
