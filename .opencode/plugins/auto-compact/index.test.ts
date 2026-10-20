import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test, type TestContext } from 'node:test'

import autoCompactPlugin, {
  createAutoCompact,
  type AutoCompactApi,
  type AutoCompactEvent,
  type AutoCompactSession,
  type CompactionInput,
  type CompactionMessage,
  type ExecuteAfterInput,
} from './index.ts'

interface RecordedCall {
  readonly method: string
  readonly args?: unknown
}

interface Subscription {
  readonly signal: AbortSignal
  emit(event: AutoCompactEvent): void
}

type StreamBehaviour = 'events' | 'throws' | 'endsEarly' | 'ignoresSignal'

interface FakeApiOptions {
  readonly session?: AutoCompactSession
  readonly stream?: StreamBehaviour
}

interface FakeApi {
  readonly api: AutoCompactApi
  readonly calls: RecordedCall[]
  readonly failures: Map<string, string>
  readonly hooks: Map<string, (input: unknown) => Promise<void>>
  readonly subscriptions: Subscription[]
}

interface Workspace {
  readonly planDirectory: string
  readonly homeDirectory: string
}

interface Harness {
  readonly workspace: Workspace
  readonly fake: FakeApi
  readonly autoCompact: ReturnType<typeof createAutoCompact>
}

interface HarnessOptions {
  readonly confirmationTimeoutMs?: number
  readonly session?: AutoCompactSession
  readonly stream?: StreamBehaviour
}

const ROOT_SESSION: AutoCompactSession = { id: 'session-1' }
const CONFIRMATION_TIMEOUT_MS = 20
const WAIT_LIMIT_MS = 1000
const SETUP_PLAN_DIRECTORY = '/Users/jose.romero/.opencode/plan'
const ENDED_EVENT: AutoCompactEvent = {
  type: 'session.compaction.ended',
  data: { sessionID: 'session-1' },
}

function createEventStream(signal: AbortSignal, onUnsubscribe: () => void) {
  const queued: AutoCompactEvent[] = []
  let wakeConsumer: (() => void) | undefined
  const wake = (): void => {
    wakeConsumer?.()
    wakeConsumer = undefined
  }
  signal.addEventListener('abort', wake)
  const nextEvent = async (): Promise<IteratorResult<AutoCompactEvent>> => {
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
  const iterable: AsyncIterable<AutoCompactEvent> = {
    [Symbol.asyncIterator]: () => ({
      next: nextEvent,
      return: async () => {
        onUnsubscribe()
        return { done: true, value: undefined }
      },
    }),
  }
  return {
    iterable,
    emit(event: AutoCompactEvent): void {
      queued.push(event)
      wake()
    },
  }
}

function createAbnormalIterable(behaviour: Exclude<StreamBehaviour, 'events'>): AsyncIterable<AutoCompactEvent> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<AutoCompactEvent>> => {
        if (behaviour === 'throws') {
          return Promise.reject(new Error('stream broke'))
        }
        if (behaviour === 'endsEarly') {
          return Promise.resolve({ done: true, value: undefined })
        }
        return new Promise(() => undefined)
      },
      return: async () => ({ done: true, value: undefined }),
    }),
  }
}

function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const calls: RecordedCall[] = []
  const failures = new Map<string, string>()
  const hooks = new Map<string, (input: unknown) => Promise<void>>()
  const subscriptions: Subscription[] = []

  const record = async (method: string, args?: unknown): Promise<void> => {
    calls.push({ method, args })
    const failureMessage = failures.get(method)
    if (failureMessage !== undefined) {
      throw new Error(failureMessage)
    }
  }

  const api: AutoCompactApi = {
    session: {
      get: async (input) => {
        await record('session.get', input)
        return options.session ?? ROOT_SESSION
      },
      compact: (input) => record('session.compact', input),
      synthetic: (input) => record('session.synthetic', input),
      hook: async (name, handler) => {
        await record('session.hook', { name })
        hooks.set(name, handler as (input: unknown) => Promise<void>)
      },
    },
    tool: {
      hook: async (name, handler) => {
        await record('tool.hook', { name })
        hooks.set(name, handler as (input: unknown) => Promise<void>)
      },
    },
    event: {
      subscribe: ({ signal }) => {
        if (options.stream !== undefined && options.stream !== 'events') {
          subscriptions.push({ signal, emit: () => undefined })
          return createAbnormalIterable(options.stream)
        }
        const stream = createEventStream(signal, () => {
          calls.push({ method: 'event.unsubscribe' })
        })
        subscriptions.push({ signal, emit: stream.emit })
        return stream.iterable
      },
    },
  }

  return { api, calls, failures, hooks, subscriptions }
}

function createWatchedFakeApi(t: TestContext, options: FakeApiOptions = {}): FakeApi {
  const fake = createFakeApi(options)
  t.after(() => {
    for (const subscription of fake.subscriptions) {
      subscription.emit(ENDED_EVENT)
    }
  })
  return fake
}

async function createWorkspace(t: TestContext): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), 'auto-compact-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const planDirectory = join(root, 'plan')
  const homeDirectory = join(root, 'home')
  await mkdir(planDirectory)
  await mkdir(homeDirectory)
  return { planDirectory, homeDirectory }
}

async function createHarness(t: TestContext, options: HarnessOptions = {}): Promise<Harness> {
  const workspace = await createWorkspace(t)
  const fake = createWatchedFakeApi(t, { session: options.session, stream: options.stream })
  const autoCompact = createAutoCompact({
    ...workspace,
    confirmationTimeoutMs: options.confirmationTimeoutMs ?? WAIT_LIMIT_MS,
  })
  return { workspace, fake, autoCompact }
}

async function writePlan(directory: string, name: string, content: string): Promise<string> {
  const filePath = join(directory, name)
  await writeFile(filePath, content)
  return filePath
}

function writeExecution(
  overrides: Partial<ExecuteAfterInput> & { readonly input: unknown },
): ExecuteAfterInput {
  return {
    tool: 'write',
    sessionID: 'session-1',
    agent: 'plan',
    messageID: 'message-1',
    id: 'call-1',
    status: 'completed',
    ...overrides,
  }
}

async function savePlan(harness: Harness, planPath: string): Promise<void> {
  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ input: { path: planPath } }),
  )
}

async function runCompactionHook(
  harness: Harness,
  messages: CompactionMessage[] = [],
): Promise<CompactionInput> {
  const input: CompactionInput = { sessionID: 'session-1', messages }
  await harness.autoCompact.handleCompaction(input)
  return input
}

function emitEvent(fake: FakeApi, event: AutoCompactEvent): void {
  fake.subscriptions[0]?.emit(event)
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${WAIT_LIMIT_MS} ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

async function waitForUnsubscribe(fake: FakeApi): Promise<void> {
  await waitFor(() => fake.calls.some((call) => call.method === 'event.unsubscribe'))
}

function unsubscribeCount(fake: FakeApi): number {
  return fake.calls.filter((call) => call.method === 'event.unsubscribe').length
}

function compactCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'session.compact')
}

function syntheticCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'session.synthetic')
}

function syntheticTexts(calls: readonly RecordedCall[]): string[] {
  return syntheticCalls(calls).map((call) => (call.args as { text: string }).text)
}

function compactionNoticeFor(planPath: string): string {
  return `Plan saved to ${planPath} and the session was compacted. Read the plan from that file. Continue with the next step of the design skill: ask whether to create tickets or implement. If the user picks implementation, invoke subagent-driven-development now, even if Plan mode is still active.`
}

test('a new plan saved in the plan directory compacts the session once with steer delivery', async (t) => {
  const harness = await createHarness(t, { confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)

  assert.deepEqual(compactCalls(harness.fake.calls), [
    { method: 'session.compact', args: { sessionID: 'session-1', delivery: 'steer' } },
  ])
})

test('a non-markdown file in the plan directory does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const textPath = await writePlan(harness.workspace.planDirectory, 'design.txt', 'plan')

  await savePlan(harness, textPath)

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('a bash tool execution does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ tool: 'bash', input: { path: planPath } }),
  )

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('an edit of a plan in the plan directory compacts the session once', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ tool: 'edit', input: { path: planPath } }),
  )

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('a failed plan save does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ status: 'error', input: { path: planPath } }),
  )

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('a plan saved by a child session does not compact the session', async (t) => {
  const harness = await createHarness(t, {
    session: { id: 'session-2', parentID: 'session-1' },
  })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ sessionID: 'session-2', input: { path: planPath } }),
  )

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('a plan save stays silent when the session lookup fails', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.get', 'lookup failed')
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await assert.doesNotReject(savePlan(harness, planPath))

  assert.deepEqual(harness.fake.calls.map((call) => call.method), ['session.get'])
})

test('a relative plan path does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ input: { path: relative(process.cwd(), planPath) } }),
  )

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('a plan path starting with a tilde expands to the home directory and compacts the session', async (t) => {
  const workspace = await createWorkspace(t)
  const planDirectory = join(workspace.homeDirectory, 'plan')
  await mkdir(planDirectory)
  const fake = createWatchedFakeApi(t)
  const autoCompact = createAutoCompact({
    planDirectory,
    homeDirectory: workspace.homeDirectory,
    confirmationTimeoutMs: WAIT_LIMIT_MS,
  })
  await writePlan(planDirectory, 'design.md', 'plan')

  await autoCompact.handleExecuteAfter(
    fake.api,
    writeExecution({ input: { path: '~/plan/design.md' } }),
  )

  assert.equal(compactCalls(fake.calls).length, 1)
})

test('a second save of unchanged plan content does not compact the session again', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('a changed plan saved after a finished compaction compacts the session again', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)
  await writeFile(planPath, 'plan two')

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('a save of changed plan content during an in-flight compaction does not compact again', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  await writeFile(planPath, 'plan two')

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('the save handler returns before the compaction is confirmed', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [])
  assert.equal(
    harness.fake.calls.some((call) => call.method === 'event.unsubscribe'),
    false,
  )
})

test('the compaction hook adds the plan notice while a compaction is in flight', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  const input = await runCompactionHook(harness)

  assert.deepEqual(input.messages, [
    { role: 'user', content: [{ type: 'text', text: compactionNoticeFor(planPath) }] },
  ])
})

test('the compaction end event unsubscribes the watcher', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)

  assert.equal(unsubscribeCount(harness.fake), 1)
})

test('a compaction failure event posts the failure notice', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  emitEvent(harness.fake, {
    type: 'session.compaction.failed',
    data: { sessionID: 'session-1', error: 'model unavailable' },
  })
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the session could not be compacted: model unavailable. Run /compact to compact it manually.`,
  ])
})

test('a save of the same content after a compaction failure event compacts the session again', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  emitEvent(harness.fake, {
    type: 'session.compaction.failed',
    data: { sessionID: 'session-1', error: 'model unavailable' },
  })
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('a rejected compact call posts the failure notice', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.compact', 'compact rejected')
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await assert.doesNotReject(savePlan(harness, planPath))

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the session could not be compacted: compact rejected. Run /compact to compact it manually.`,
  ])
})

test('a save of the same content after a rejected compact call compacts the session again', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.compact', 'compact rejected')
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  harness.fake.failures.delete('session.compact')
  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('a missing end event posts the timeout notice', async (t) => {
  const harness = await createHarness(t, { confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the compaction could not be confirmed within 0.02 seconds. Run /compact to compact the session manually.`,
  ])
})

test('a save of the same content after the confirmation timeout compacts the session again', async (t) => {
  const harness = await createHarness(t, { confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('an unreadable plan posts a notice about the unreadable file', async (t) => {
  const harness = await createHarness(t)
  const missingPath = join(harness.workspace.planDirectory, 'missing.md')

  await savePlan(harness, missingPath)

  const [notice] = syntheticTexts(harness.fake.calls)
  assert.ok(
    notice?.startsWith(`Plan saved to ${missingPath}, but it could not be read: ENOENT`),
    notice,
  )
})

test('an unreadable plan does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const missingPath = join(harness.workspace.planDirectory, 'missing.md')

  await savePlan(harness, missingPath)

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('setup registers an execute.after handler that reaches the plugin', async (t) => {
  const fake = createWatchedFakeApi(t)
  await autoCompactPlugin.setup(fake.api)
  const missingPath = join(SETUP_PLAN_DIRECTORY, 'setup-check.md')
  const handler = fake.hooks.get('execute.after') as (input: ExecuteAfterInput) => Promise<void>

  await handler(writeExecution({ input: { path: missingPath } }))

  assert.equal(autoCompactPlugin.id, 'auto-compact')
  const [notice] = syntheticTexts(fake.calls)
  assert.ok(notice?.startsWith(`Plan saved to ${missingPath}, but it could not be read`), notice)
})

test('setup registers a compaction handler that leaves messages unchanged without an in-flight compaction', async (t) => {
  const fake = createWatchedFakeApi(t)
  await autoCompactPlugin.setup(fake.api)
  const handler = fake.hooks.get('compaction') as (input: CompactionInput) => Promise<void>
  const input: CompactionInput = { sessionID: 'session-1', messages: [] }

  await handler(input)

  assert.deepEqual(input.messages, [])
})

test('an end event for another session does not end the watched compaction', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  emitEvent(harness.fake, {
    type: 'session.compaction.failed',
    data: { sessionID: 'session-2', error: 'other session' },
  })
  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [])
})

test('a plan path that escapes the plan directory with dot-dot does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const escapedPath = join(harness.workspace.planDirectory, '..', 'x.md')
  await writePlan(harness.workspace.homeDirectory, 'x.md', 'escaped')

  await savePlan(harness, escapedPath)

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('a sibling directory that shares the plan directory name prefix does not compact the session', async (t) => {
  const harness = await createHarness(t)
  const siblingDirectory = `${harness.workspace.planDirectory}-evil`
  await mkdir(siblingDirectory)
  const siblingPath = await writePlan(siblingDirectory, 'x.md', 'sibling')

  await savePlan(harness, siblingPath)

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('an unreadable plan notice is sent to the saving session without resuming it', async (t) => {
  const harness = await createHarness(t)
  const missingPath = join(harness.workspace.planDirectory, 'missing.md')

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ sessionID: 'session-7', input: { path: missingPath } }),
  )

  const noticeArgs = syntheticCalls(harness.fake.calls)[0]?.args as {
    sessionID: string
    resume: boolean
  }
  assert.deepEqual({ sessionID: noticeArgs.sessionID, resume: noticeArgs.resume }, {
    sessionID: 'session-7',
    resume: false,
  })
})

test('a compaction hook for another session leaves the messages unchanged', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  const otherInput: CompactionInput = { sessionID: 'session-2', messages: [] }

  await harness.autoCompact.handleCompaction(otherInput)

  assert.deepEqual(otherInput.messages, [])
})

test('a second compaction hook call leaves the messages unchanged', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  await runCompactionHook(harness)

  const secondInput = await runCompactionHook(harness)

  assert.deepEqual(secondInput.messages, [])
})

test('a rejected synthetic notice does not reject the save handler', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.synthetic', 'notice rejected')
  const missingPath = join(harness.workspace.planDirectory, 'missing.md')

  await assert.doesNotReject(savePlan(harness, missingPath))
})

test('the same content saved in another session compacts that session', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)

  await harness.autoCompact.handleExecuteAfter(
    harness.fake.api,
    writeExecution({ sessionID: 'session-2', input: { path: planPath } }),
  )

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('the same content saved at another plan path compacts the session', async (t) => {
  const harness = await createHarness(t)
  const firstPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, firstPath)
  emitEvent(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)
  const secondPath = await writePlan(harness.workspace.planDirectory, 'other.md', 'plan one')

  await savePlan(harness, secondPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('a throwing event stream posts the unconfirmed notice with the stream error', async (t) => {
  const harness = await createHarness(t, { stream: 'throws', confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the compaction could not be confirmed: stream broke. Run /compact to compact the session manually.`,
  ])
})

test('an event stream that ends without an event posts the unconfirmed notice with the reason', async (t) => {
  const harness = await createHarness(t, { stream: 'endsEarly', confirmationTimeoutMs: WAIT_LIMIT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the compaction could not be confirmed: the event stream ended before the compaction was confirmed. Run /compact to compact the session manually.`,
  ])
})

test('an event stream that ignores the abort signal still posts the timeout notice', async (t) => {
  const harness = await createHarness(t, { stream: 'ignoresSignal', confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')

  await savePlan(harness, planPath)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `Plan saved to ${planPath}, but the compaction could not be confirmed within 0.02 seconds. Run /compact to compact the session manually.`,
  ])
})

test('two concurrent saves of different plan content compact the session once', async (t) => {
  const harness = await createHarness(t)
  const firstPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  const secondPath = await writePlan(harness.workspace.planDirectory, 'other.md', 'plan two')

  await Promise.all([savePlan(harness, firstPath), savePlan(harness, secondPath)])

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('a superseded compaction ending does not clear the in-flight entry of a later compaction', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  await runCompactionHook(harness)
  await writeFile(planPath, 'plan two')
  await savePlan(harness, planPath)

  harness.fake.subscriptions[0]?.emit(ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)
  await writeFile(planPath, 'plan three')
  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})

test('a failed earlier compaction on another path lets its plan content compact again', async (t) => {
  const harness = await createHarness(t)
  const firstPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, firstPath)
  await runCompactionHook(harness)
  const secondPath = await writePlan(harness.workspace.planDirectory, 'other.md', 'plan two')
  await savePlan(harness, secondPath)

  emitEvent(harness.fake, {
    type: 'session.compaction.failed',
    data: { sessionID: 'session-1', error: 'model unavailable' },
  })
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)
  harness.fake.subscriptions[1]?.emit(ENDED_EVENT)
  await waitFor(() => unsubscribeCount(harness.fake) === 2)

  await savePlan(harness, firstPath)

  assert.equal(compactCalls(harness.fake.calls).length, 3)
})

test('a failure of a superseded compaction keeps the hash of a newer compaction on the same path', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)
  await runCompactionHook(harness)
  await writeFile(planPath, 'plan two')
  await savePlan(harness, planPath)

  harness.fake.subscriptions[0]?.emit({
    type: 'session.compaction.failed',
    data: { sessionID: 'session-1', error: 'model unavailable' },
  })
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)
  harness.fake.subscriptions[1]?.emit(ENDED_EVENT)
  await waitFor(() => unsubscribeCount(harness.fake) === 2)

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 2)
})
