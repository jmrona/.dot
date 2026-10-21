import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { createAutoCompact, type AutoCompactSession } from './index.ts'
import {
  startThresholdWatcher,
  type ThresholdApi,
  type ThresholdEvent,
  type ThresholdWatcher,
} from './threshold.ts'

type StreamBehaviour = 'events' | 'throws' | 'ends'

interface ModelEntry {
  readonly id: string
  readonly providerID: string
  readonly limit: { readonly context: number; readonly input?: number; readonly output: number }
}

interface RecordedCall {
  readonly method: string
  readonly args?: unknown
}

interface Subscriber {
  readonly signal: AbortSignal
  emit(event: ThresholdEvent): void
}

interface FakeApi {
  readonly api: ThresholdApi
  readonly calls: RecordedCall[]
  readonly subscribers: Subscriber[]
  models: ModelEntry[]
  beforeModelList?: () => Promise<void>
}

interface Harness {
  readonly fake: FakeApi
  readonly autoCompact: ReturnType<typeof createAutoCompact>
  readonly watcher: ThresholdWatcher
  readonly logs: string[]
  readonly planPath: string
  readonly giveUpCalls: { count: number }
}

interface HarnessOptions {
  readonly sessions?: Record<string, AutoCompactSession>
  readonly streams?: readonly StreamBehaviour[]
  readonly models?: ModelEntry[]
  readonly percent?: number | null
  readonly onGiveUp?: () => Promise<void>
}

const PERCENT = 80
const SESSION = 'session-1'
const KNOWN_SESSIONS = [SESSION, 'child-1']
const MODEL_A: ModelEntry = {
  id: 'model-a',
  providerID: 'provider-a',
  limit: { context: 2000, input: 1000, output: 100 },
}
const MODEL_B: ModelEntry = {
  id: 'model-b',
  providerID: 'provider-a',
  limit: { context: 20000, input: 10000, output: 100 },
}

function createEventStream(signal: AbortSignal) {
  const queued: ThresholdEvent[] = []
  let wakeConsumer: (() => void) | undefined
  const wake = (): void => {
    wakeConsumer?.()
    wakeConsumer = undefined
  }
  signal.addEventListener('abort', wake)
  const nextEvent = async (): Promise<IteratorResult<ThresholdEvent>> => {
    while (queued.length === 0 && !signal.aborted) {
      await new Promise<void>((resolve) => {
        wakeConsumer = resolve
      })
    }
    const event = queued.shift()
    if (signal.aborted || event === undefined) {
      return { done: true, value: undefined }
    }
    return { done: false, value: event }
  }
  return {
    iterable: {
      [Symbol.asyncIterator]: () => ({
        next: nextEvent,
        return: async () => ({ done: true as const, value: undefined }),
      }),
    },
    emit(event: ThresholdEvent): void {
      queued.push(event)
      wake()
    },
  }
}

function createAbnormalIterable(behaviour: 'throws' | 'ends') {
  return {
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<ThresholdEvent>> =>
        behaviour === 'throws'
          ? Promise.reject(new Error('stream broke'))
          : Promise.resolve({ done: true, value: undefined }),
      return: async () => ({ done: true as const, value: undefined }),
    }),
  }
}

function createFakeApi(options: HarnessOptions): FakeApi {
  const calls: RecordedCall[] = []
  const subscribers: Subscriber[] = []
  const streams = [...(options.streams ?? [])]
  const record = async (method: string, args?: unknown): Promise<void> => {
    calls.push({ method, args })
  }
  const fake: FakeApi = {
    calls,
    subscribers,
    models: options.models ?? [MODEL_A],
    api: {
      session: {
        get: async (input) => {
          await record('session.get', input)
          return options.sessions?.[input.sessionID] ?? { id: input.sessionID }
        },
        compact: (input) => record('session.compact', input),
        synthetic: (input) => record('session.synthetic', input),
        hook: (name) => record('session.hook', { name }),
      },
      tool: { hook: (name) => record('tool.hook', { name }) },
      model: {
        list: async (input) => {
          await record('model.list', input)
          await fake.beforeModelList?.()
          return { data: fake.models }
        },
      },
      event: {
        subscribe: ({ signal }) => {
          const behaviour = streams.shift() ?? 'events'
          if (behaviour !== 'events') {
            subscribers.push({ signal, emit: () => undefined })
            return createAbnormalIterable(behaviour) as AsyncIterable<never>
          }
          const stream = createEventStream(signal)
          subscribers.push({ signal, emit: stream.emit })
          return stream.iterable as AsyncIterable<never>
        },
      },
    },
  }
  return fake
}

function emitToAll(fake: FakeApi, event: ThresholdEvent): void {
  for (const subscriber of fake.subscribers) {
    subscriber.emit(event)
  }
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

async function settleUntil(condition: () => boolean): Promise<void> {
  for (let tick = 0; tick < 1000 && !condition(); tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.ok(condition(), 'condition not met within 1000 event loop turns')
}

async function createHarness(t: TestContext, options: HarnessOptions = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'auto-compact-threshold-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const planPath = join(root, 'design.md')
  await writeFile(planPath, 'plan')
  const fake = createFakeApi(options)
  const autoCompact = createAutoCompact({
    planDirectory: root,
    homeDirectory: root,
    confirmationTimeoutMs: 1000,
  })
  const logs: string[] = []
  const giveUpCalls = { count: 0 }
  const watcher = startThresholdWatcher({
    api: fake.api,
    autoCompact,
    percent: options.percent === undefined ? PERCENT : options.percent,
    log: (message) => logs.push(message),
    onGiveUp:
      options.onGiveUp ??
      (async () => {
        giveUpCalls.count += 1
      }),
  })
  t.after(() => {
    for (const sessionID of KNOWN_SESSIONS) {
      emitToAll(fake, compactionEnded(sessionID))
    }
    watcher.stop()
  })
  return { fake, autoCompact, watcher, logs, planPath, giveUpCalls }
}

function stepStarted(model: ModelEntry = MODEL_A, sessionID = SESSION): ThresholdEvent {
  return {
    type: 'session.step.started',
    data: {
      sessionID,
      assistantMessageID: 'message-1',
      agent: 'build',
      model: { id: model.id, providerID: model.providerID, variant: 'default' },
      started: 1,
    },
  }
}

function stepEnded(
  tokens: {
    input?: number
    output?: number
    reasoning?: number
    cacheRead?: number
    cacheWrite?: number
  },
  sessionID = SESSION,
): ThresholdEvent {
  return {
    type: 'session.step.ended',
    data: {
      sessionID,
      assistantMessageID: 'message-1',
      finish: 'stop',
      cost: 0,
      tokens: {
        input: tokens.input ?? 0,
        output: tokens.output ?? 0,
        reasoning: tokens.reasoning ?? 0,
        cache: { read: tokens.cacheRead ?? 0, write: tokens.cacheWrite ?? 0 },
      },
    },
  }
}

function compactionEnded(sessionID = SESSION): ThresholdEvent {
  return { type: 'session.compaction.ended', data: { sessionID } }
}

async function emitAndSettle(harness: Harness, ...events: ThresholdEvent[]): Promise<void> {
  for (const event of events) {
    emitToAll(harness.fake, event)
    await settle()
  }
}

async function startPlanCompaction(harness: Harness): Promise<void> {
  await harness.autoCompact.handleExecuteAfter(harness.fake.api, {
    tool: 'write',
    sessionID: SESSION,
    agent: 'plan',
    messageID: 'message-1',
    id: 'call-1',
    status: 'completed',
    input: { path: harness.planPath },
  })
}

function compactCalls(harness: Harness): RecordedCall[] {
  return harness.fake.calls.filter((call) => call.method === 'session.compact')
}

test('the watcher compacts a root session with steer delivery when context reaches the threshold', async (t) => {
  const harness = await createHarness(t)

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 800 }))

  assert.deepEqual(compactCalls(harness), [
    { method: 'session.compact', args: { sessionID: SESSION, delivery: 'steer' } },
  ])
})

test('the watcher does not compact below the threshold', async (t) => {
  const harness = await createHarness(t)

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 799 }))

  assert.deepEqual(compactCalls(harness), [])
})

test('the watcher counts cached tokens towards the context', async (t) => {
  const harness = await createHarness(t)

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 400, cacheRead: 400 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher ignores child sessions', async (t) => {
  const harness = await createHarness(t, {
    sessions: { 'child-1': { id: 'child-1', parentID: SESSION } },
  })

  await emitAndSettle(harness, stepStarted(MODEL_A, 'child-1'), stepEnded({ input: 900 }, 'child-1'))

  assert.deepEqual(compactCalls(harness), [])
})

test('the watcher ignores a session with no known model', async (t) => {
  const harness = await createHarness(t)

  await emitAndSettle(harness, stepEnded({ input: 900 }))

  assert.deepEqual(compactCalls(harness), [])
})

test('the watcher ignores a model with no input or context limit', async (t) => {
  const harness = await createHarness(t, {
    models: [{ ...MODEL_A, limit: { context: 0, input: 0, output: 0 } }],
  })

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }))

  assert.deepEqual(compactCalls(harness), [])
})

test('the watcher falls back to the context limit when the input limit is absent', async (t) => {
  const harness = await createHarness(t, {
    models: [{ ...MODEL_A, limit: { context: 1000, output: 100 } }],
  })

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 800 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher uses the limit of the model the session switched to', async (t) => {
  const harness = await createHarness(t, { models: [MODEL_A, MODEL_B] })

  await emitAndSettle(harness, stepStarted(MODEL_A), stepStarted(MODEL_B), stepEnded({ input: 900 }))

  assert.deepEqual(compactCalls(harness), [])
})

test('the watcher does not compact again until context drops below the threshold', async (t) => {
  const harness = await createHarness(t)
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }), compactionEnded())

  await emitAndSettle(harness, stepEnded({ input: 900 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher compacts again after context drops below the threshold', async (t) => {
  const harness = await createHarness(t)
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }), compactionEnded())

  await emitAndSettle(harness, stepEnded({ input: 100 }), stepEnded({ input: 900 }))

  assert.equal(compactCalls(harness).length, 2)
})

test('the watcher ignores step ends while a compaction is in flight', async (t) => {
  const harness = await createHarness(t)
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }), stepEnded({ input: 100 }))
  await emitAndSettle(harness, compactionEnded())

  await emitAndSettle(harness, stepEnded({ input: 900 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher forgets a deleted session', async (t) => {
  const harness = await createHarness(t)
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }), compactionEnded())

  await emitAndSettle(
    harness,
    { type: 'session.deleted', data: { sessionID: SESSION } },
    stepStarted(),
    stepEnded({ input: 900 }),
  )

  assert.equal(compactCalls(harness).length, 2)
})

test('the watcher resubscribes once when the stream fails', async (t) => {
  const harness = await createHarness(t, { streams: ['throws', 'events'] })

  await settle()

  assert.equal(harness.fake.subscribers.length, 2)
  assert.deepEqual(harness.logs, [
    'auto-compact: the threshold watcher stream failed (stream broke). Resubscribing once.',
  ])
})

test('the watcher stops after the stream fails twice', async (t) => {
  const harness = await createHarness(t, { streams: ['throws', 'ends', 'events'] })

  await settle()

  assert.equal(harness.fake.subscribers.length, 2)
  assert.equal(
    harness.logs[1],
    'auto-compact: the threshold watcher stream ended again. The token threshold is inactive until opencode restarts or /auto-compact sets it again.',
  )
})

test('the watcher calls onGiveUp once when the stream fails twice', async (t) => {
  const harness = await createHarness(t, { streams: ['throws', 'throws'] })

  await settle()

  assert.equal(harness.giveUpCalls.count, 1)
})

test('the watcher does not call onGiveUp after stop', async (t) => {
  const harness = await createHarness(t, { streams: ['throws', 'events'] })
  await settleUntil(() => harness.fake.subscribers.length === 2)

  harness.watcher.stop()
  await settle()

  assert.equal(harness.giveUpCalls.count, 0)
})

test('the watcher reports running until onGiveUp resolves', async (t) => {
  let finishGiveUp: () => void = () => undefined
  const pendingGiveUp = new Promise<void>((resolve) => {
    finishGiveUp = resolve
  })
  const harness = await createHarness(t, {
    streams: ['throws', 'throws'],
    onGiveUp: () => pendingGiveUp,
  })
  await settle()
  const runningWhilePending = harness.watcher.isRunning()

  finishGiveUp()
  await settle()

  assert.deepEqual([runningWhilePending, harness.watcher.isRunning()], [true, false])
})

test('stop ends the subscription', async (t) => {
  const harness = await createHarness(t)

  harness.watcher.stop()

  assert.equal(harness.fake.subscribers[0]?.signal.aborted, true)
})

test('stop does not log the ended stream', async (t) => {
  const harness = await createHarness(t)

  harness.watcher.stop()
  await settle()

  assert.deepEqual(harness.logs, [])
})

test('the watcher logs the error when the stream fails twice', async (t) => {
  const harness = await createHarness(t, { streams: ['throws', 'throws'] })

  await settle()

  assert.equal(
    harness.logs[1],
    'auto-compact: the threshold watcher stream failed again (stream broke). The token threshold is inactive until opencode restarts or /auto-compact sets it again.',
  )
})

test('the watcher counts every token field towards the context', async (t) => {
  const harness = await createHarness(t)

  await emitAndSettle(
    harness,
    stepStarted(),
    stepEnded({ input: 200, output: 200, reasoning: 200, cacheWrite: 200 }),
  )

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher reads the model limit at the time of each step', async (t) => {
  const largeLimit: ModelEntry = { ...MODEL_A, limit: { context: 20000, input: 10000, output: 100 } }
  const harness = await createHarness(t, { models: [largeLimit] })
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }))
  harness.fake.models = [MODEL_A]

  await emitAndSettle(harness, stepEnded({ input: 900 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher stays armed when a plan compaction wins the race', async (t) => {
  const harness = await createHarness(t)
  harness.fake.beforeModelList = async () => {
    harness.fake.beforeModelList = undefined
    await startPlanCompaction(harness)
  }
  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 900 }))
  await settleUntil(() => harness.autoCompact.isCompactionInFlight(SESSION))
  await settleUntil(() => harness.fake.subscribers.length === 2)
  await emitAndSettle(harness, compactionEnded())
  await settleUntil(() => !harness.autoCompact.isCompactionInFlight(SESSION))

  await emitAndSettle(harness, stepEnded({ input: 900 }))

  assert.equal(compactCalls(harness).length, 2)
})

test('the watcher logs a skipped event with its type', async (t) => {
  const harness = await createHarness(t)
  const unreadableStepEnded: ThresholdEvent = {
    type: 'session.step.ended',
    data: {
      sessionID: SESSION,
      get tokens(): never {
        throw new Error('tokens unreadable')
      },
    },
  }

  await emitAndSettle(harness, unreadableStepEnded)

  assert.deepEqual(harness.logs, [
    'auto-compact: the threshold watcher skipped a session.step.ended event (tokens unreadable).',
  ])
})

test('setting a lower percentage compacts when the lowered threshold is reached', async (t) => {
  const harness = await createHarness(t, { percent: 80 })
  harness.watcher.setPercent(50)

  await emitAndSettle(harness, stepStarted(), stepEnded({ input: 600 }))

  assert.equal(compactCalls(harness).length, 1)
})

test('the watcher reports not running after stop', async (t) => {
  const harness = await createHarness(t)

  harness.watcher.stop()

  assert.equal(harness.watcher.isRunning(), false)
})
