import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
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

test('a pre-aborted acquire never joins the queue', async () => {
  const checkedSessions: string[] = []
  const semaphore = createSlotSemaphore(1, async (sessionID) => {
    checkedSessions.push(sessionID)
    return true
  })
  await semaphore.acquire('holder', 'holder-call')

  const aborted = track(semaphore.acquire('aborted', 'aborted-call', AbortSignal.abort()))
  await settle()
  assert.equal(aborted.outcome, false, 'a pre-aborted acquire must settle before release')

  semaphore.release()
  await settle()
  assert.deepEqual(checkedSessions, ['holder'])
})

test('queued abort settles only its waiter before release and keeps the remaining FIFO order', async () => {
  const semaphore = createSlotSemaphore(1, alwaysAlive)
  const controller = new AbortController()
  await semaphore.acquire('holder', 'holder-call')
  const first = track(semaphore.acquire('root', 'shared-call'))
  const aborted = track(semaphore.acquire('root', 'shared-call', controller.signal))
  const last = track(semaphore.acquire('root', 'shared-call'))

  controller.abort()
  await settle()
  assert.deepEqual([first.outcome, aborted.outcome, last.outcome], [undefined, false, undefined],
    'only the aborted waiter must settle before release')
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)

  semaphore.release()
  await settle()
  assert.deepEqual([first.outcome, last.outcome], [true, undefined])
  semaphore.release()
  await settle()
  assert.equal(last.outcome, true)
})

for (const lateCheck of ['success', 'rejection'] as const) {
  test(`abort reclaims a reservation without a second release on late liveness ${lateCheck}`, async () => {
    const liveness = Promise.withResolvers<boolean>()
    const semaphore = createSlotSemaphore(1, (sessionID) => sessionID === 'first-root' ? liveness.promise : alwaysAlive())
    const controller = new AbortController()
    const aborted = track(semaphore.acquire('first-root', 'shared-call', controller.signal))
    const successor = track(semaphore.acquire('second-root', 'shared-call'))
    const third = track(semaphore.acquire('third-root', 'third-call'))
    await settle()
    assert.deepEqual([aborted.outcome, successor.outcome, third.outcome], [undefined, undefined, undefined])

    controller.abort()
    await settle()
    assert.deepEqual([aborted.outcome, successor.outcome, third.outcome], [false, true, undefined],
      'abort must admit the successor before the old liveness check settles')
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)

    if (lateCheck === 'success') liveness.resolve(true)
    else liveness.reject(new Error('session unavailable'))
    await settle()
    assert.deepEqual([aborted.outcome, third.outcome], [false, undefined],
      'a late liveness result must leave the successor holding the slot')

    semaphore.release()
    await settle()
    assert.equal(third.outcome, true)
  })
}

test('abort hands off a reserved slot despite an earlier listener stopping propagation', async () => {
  const liveness = Promise.withResolvers<boolean>()
  const semaphore = createSlotSemaphore(1, (sessionID) => sessionID === 'first-root' ? liveness.promise : alwaysAlive())
  const controller = new AbortController()
  let propagationStopped = false
  controller.signal.addEventListener('abort', (event) => {
    event.stopImmediatePropagation()
    propagationStopped = true
  }, { once: true })
  const aborted = track(semaphore.acquire('first-root', 'first-call', controller.signal))
  const successor = track(semaphore.acquire('second-root', 'second-call'))

  controller.abort()
  await settle()

  assert.equal(propagationStopped, true)
  assert.deepEqual(
    [aborted.outcome, successor.outcome],
    [false, true],
    'abort must settle the reserved waiter and admit the successor before the liveness check finishes',
  )
})

for (const method of ['cancelSession', 'cancelCall'] as const) {
  test(`${method} drops only the queued waiter when both waiters match`, async () => {
    const liveness = Promise.withResolvers<boolean>()
    const semaphore = createSlotSemaphore(1, () => liveness.promise)
    const reserved = track(semaphore.acquire('reserved-root', 'reserved-call'))
    const bySession = method === 'cancelSession'
    const queued = track(semaphore.acquire(
      bySession ? 'reserved-root' : 'queued-root',
      bySession ? 'queued-call' : 'reserved-call',
    ))

    semaphore[method](bySession ? 'reserved-root' : 'reserved-call')
    await settle()
    assert.deepEqual([reserved.outcome, queued.outcome], [undefined, false])

    liveness.resolve(true)
    await settle()
    assert.equal(reserved.outcome, true)
  })

  test(`${method} detaches the abort listener of a queued waiter`, async () => {
    const semaphore = createSlotSemaphore(0, alwaysAlive)
    const { signal } = new AbortController()
    const waiting = track(semaphore.acquire('root', 'call', signal))
    const attached = getEventListeners(signal, 'abort').length

    semaphore[method](method === 'cancelSession' ? 'root' : 'call')
    await settle()
    assert.equal(waiting.outcome, false)
    assert.deepEqual([attached, getEventListeners(signal, 'abort').length], [1, 0],
      'the abort listener must exist only while queued')
  })
}

for (const outcome of ['grant', 'denial', 'rejection'] as const) {
  test(`a liveness ${outcome} detaches the abort listener`, async () => {
    const liveness = Promise.withResolvers<boolean>()
    const semaphore = createSlotSemaphore(1, () => liveness.promise)
    const { signal } = new AbortController()
    const waiting = track(semaphore.acquire('root', 'call', signal))
    const attached = getEventListeners(signal, 'abort').length

    if (outcome === 'rejection') liveness.reject(new Error('session unavailable'))
    else liveness.resolve(outcome === 'grant')
    await settle()
    assert.equal(waiting.outcome, outcome === 'grant')
    assert.deepEqual([attached, getEventListeners(signal, 'abort').length], [1, 0],
      'the abort listener must exist only while the slot is reserved')
  })
}

test('the current limit can be read back', () => {
  const semaphore = createSlotSemaphore(2, alwaysAlive)
  semaphore.setLimit(5)
  assert.equal(semaphore.limit(), 5)
})
