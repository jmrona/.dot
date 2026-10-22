import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSlotSemaphore } from './semaphore.ts'

const alwaysAlive = async (): Promise<boolean> => true

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function track(promise: Promise<boolean>): { outcome: boolean | undefined } {
  const tracked: { outcome: boolean | undefined } = { outcome: undefined }
  void promise.then((outcome) => {
    tracked.outcome = outcome
  })
  return tracked
}

test('callers up to the limit receive a slot at once', async () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  const first = track(semaphore.acquire('s1', 'c1'))
  const second = track(semaphore.acquire('s1', 'c2'))
  await settle()
  assert.deepEqual([first.outcome, second.outcome], [true, true])
})

test('the third caller waits while two slots are held', async () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  semaphore.acquire('s1', 'c2')
  const third = track(semaphore.acquire('s1', 'c3'))
  await settle()
  assert.equal(third.outcome, undefined)
})

test('releasing a slot unblocks the waiting caller', async () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  semaphore.acquire('s1', 'c2')
  const third = track(semaphore.acquire('s1', 'c3'))
  await settle()
  semaphore.release()
  await settle()
  assert.equal(third.outcome, true)
})

test('raising the limit wakes a waiting caller', async () => {
  const semaphore = createSlotSemaphore(1, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  const second = track(semaphore.acquire('s1', 'c2'))
  await settle()
  semaphore.setLimit(2)
  await settle()
  assert.equal(second.outcome, true)
})

test('lowering the limit does not wake a waiting caller on release', async () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  semaphore.acquire('s1', 'c2')
  semaphore.setLimit(1)
  const third = track(semaphore.acquire('s1', 'c3'))
  await settle()
  semaphore.release()
  await settle()
  assert.equal(third.outcome, undefined)
})

test('cancelling a session drops its waiting callers without a slot', async () => {
  const semaphore = createSlotSemaphore(1, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  const waiting = track(semaphore.acquire('s2', 'c2'))
  semaphore.cancelSession('s2')
  await settle()
  assert.equal(waiting.outcome, false)
})

test('a dropped waiter does not consume the slot that is released next', async () => {
  const semaphore = createSlotSemaphore(1, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  semaphore.acquire('s2', 'c2')
  const survivor = track(semaphore.acquire('s3', 'c3'))
  semaphore.cancelSession('s2')
  semaphore.release()
  await settle()
  assert.equal(survivor.outcome, true)
})

test('cancelling a call drops that waiting call only', async () => {
  const semaphore = createSlotSemaphore(1, alwaysAlive)
  semaphore.acquire('s1', 'c1')
  const cancelled = track(semaphore.acquire('s1', 'c2'))
  const kept = track(semaphore.acquire('s1', 'c3'))
  semaphore.cancelCall('c2')
  await settle()
  assert.deepEqual([cancelled.outcome, kept.outcome], [false, undefined])
})

test('a waiter whose session has gone is dropped when its turn comes', async () => {
  const semaphore = createSlotSemaphore(1, async (sessionID) => sessionID !== 's2')
  semaphore.acquire('s1', 'c1')
  const gone = track(semaphore.acquire('s2', 'c2'))
  const alive = track(semaphore.acquire('s3', 'c3'))
  semaphore.release()
  await settle()
  assert.deepEqual([gone.outcome, alive.outcome], [false, true])
})

test('the current limit can be read back', () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  semaphore.setLimit(5)
  assert.equal(semaphore.limit(), 5)
})
