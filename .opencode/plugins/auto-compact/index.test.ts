import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  type CommandDraft,
  type ExecuteAfterInput,
  type PluginApi,
  setupAutoCompact,
} from './index.ts'
import { createProcessState, type ProcessState } from './process-state.ts'
import { readWatcherFailed } from './status.ts'
import type { ThresholdEvent } from './threshold.ts'

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
  readonly failingSubscriptions?: number
}

type RegisteredCommand = Parameters<CommandDraft['add']>[0]

interface FakeApi {
  readonly api: PluginApi
  readonly commands: RegisteredCommand[]
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
const THRESHOLD_MODEL = {
  id: 'model-a',
  providerID: 'provider-a',
  limit: { context: 2000, input: 1000, output: 100 },
}
const CONFIGURED_THRESHOLD_PERCENT = 80
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
  const commands: RegisteredCommand[] = []
  let subscriptionCount = 0

  const record = async (method: string, args?: unknown): Promise<void> => {
    calls.push({ method, args })
    const failureMessage = failures.get(method)
    if (failureMessage !== undefined) {
      throw new Error(failureMessage)
    }
  }

  const api: PluginApi = {
    command: { transform: (fn) => fn({ add: (command) => commands.push(command) }) },
    model: { list: async () => ({ data: [THRESHOLD_MODEL] }) },
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
        subscriptionCount += 1
        if (subscriptionCount <= (options.failingSubscriptions ?? 0)) {
          subscriptions.push({ signal, emit: () => undefined })
          return createAbnormalIterable('throws')
        }
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

  return { api, calls, commands, failures, hooks, subscriptions }
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
  const autoCompact = createAutoCompact(
    {
      ...workspace,
      confirmationTimeoutMs: options.confirmationTimeoutMs ?? WAIT_LIMIT_MS,
    },
    createProcessState(),
  )
  return { workspace, fake, autoCompact }
}

async function writePlan(directory: string, name: string, content: string): Promise<string> {
  const filePath = join(directory, name)
  await writeFile(filePath, content)
  return filePath
}

let nextCallNumber = 0

function writeExecution(
  overrides: Partial<ExecuteAfterInput> & { readonly input: unknown },
): ExecuteAfterInput {
  nextCallNumber += 1
  return {
    tool: 'write',
    sessionID: 'session-1',
    agent: 'plan',
    messageID: 'message-1',
    id: `call-${nextCallNumber}`,
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

async function waitForFailedStatus(statusPath: string): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS
  while (!(await readWatcherFailed(statusPath))) {
    if (Date.now() > deadline) {
      throw new Error(`failed status not written within ${WAIT_LIMIT_MS} ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

async function waitForUnsubscribe(fake: FakeApi): Promise<void> {
  await waitFor(() => fake.calls.some((call) => call.method === 'event.unsubscribe'))
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
  const autoCompact = createAutoCompact(
    {
      planDirectory,
      homeDirectory: workspace.homeDirectory,
      confirmationTimeoutMs: WAIT_LIMIT_MS,
    },
    createProcessState(),
  )
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
  const { fake } = await setupWithConfig(t)
  const missingPath = join(SETUP_PLAN_DIRECTORY, 'setup-check.md')
  const handler = fake.hooks.get('execute.after') as (input: ExecuteAfterInput) => Promise<void>

  await handler(writeExecution({ input: { path: missingPath } }))

  assert.equal(autoCompactPlugin.id, 'auto-compact')
  const [notice] = syntheticTexts(fake.calls)
  assert.ok(notice?.startsWith(`Plan saved to ${missingPath}, but it could not be read`), notice)
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

const THRESHOLD_PERCENT = 85

async function startThreshold(harness: Harness): Promise<boolean> {
  return harness.autoCompact.startThresholdCompaction(
    harness.fake.api,
    'session-1',
    THRESHOLD_PERCENT,
  )
}

function thresholdPrefix(): string {
  return `Context reached ${THRESHOLD_PERCENT}% of the input limit, but`
}

test('startThresholdCompaction returns false while a plan compaction is in flight', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  const started = await startThreshold(harness)

  assert.equal(started, false)
})

test('startThresholdCompaction returns true when compact throws', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.compact', 'compact rejected')

  const started = await startThreshold(harness)

  assert.equal(started, true)
})

test('startThresholdCompaction returns false while a threshold compaction is in flight', async (t) => {
  const harness = await createHarness(t)
  await startThreshold(harness)

  const started = await startThreshold(harness)

  assert.equal(started, false)
})

test('a plan save does not compact while a threshold compaction is in flight', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await startThreshold(harness)

  await savePlan(harness, planPath)

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('the compaction hook adds no plan notice to a threshold run', async (t) => {
  const harness = await createHarness(t)
  await startThreshold(harness)

  const input = await runCompactionHook(harness)

  assert.deepEqual(input.messages, [])
})

test('a threshold run stays in flight after the compaction hook runs', async (t) => {
  const harness = await createHarness(t)
  await startThreshold(harness)

  await runCompactionHook(harness)

  assert.equal(harness.autoCompact.isCompactionInFlight('session-1'), true)
})

test('a failed threshold compaction posts the threshold failure notice', async (t) => {
  const harness = await createHarness(t)
  await startThreshold(harness)

  emitEvent(harness.fake, {
    type: 'session.compaction.failed',
    data: { sessionID: 'session-1', error: 'model unavailable' },
  })
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `${thresholdPrefix()} the session could not be compacted: model unavailable. Run /compact to compact it manually.`,
  ])
})

test('a threshold compaction that throws posts the threshold failure notice', async (t) => {
  const harness = await createHarness(t)
  harness.fake.failures.set('session.compact', 'compact rejected')

  await startThreshold(harness)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `${thresholdPrefix()} the session could not be compacted: compact rejected. Run /compact to compact it manually.`,
  ])
})

test('an unconfirmed threshold compaction posts the threshold timeout notice', async (t) => {
  const harness = await createHarness(t, { confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS })

  await startThreshold(harness)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `${thresholdPrefix()} the compaction could not be confirmed within 0.02 seconds. Run /compact to compact the session manually.`,
  ])
})

test('a threshold compaction whose event stream fails posts the threshold unconfirmed notice', async (t) => {
  const harness = await createHarness(t, { stream: 'throws' })

  await startThreshold(harness)
  await waitFor(() => syntheticTexts(harness.fake.calls).length === 1)

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    `${thresholdPrefix()} the compaction could not be confirmed: stream broke. Run /compact to compact the session manually.`,
  ])
})

interface SetupHarness {
  readonly fake: FakeApi
  readonly logs: string[]
  readonly configPath: string
  readonly statusPath: string
}

async function setupWithConfig(
  t: TestContext,
  config?: unknown,
  stream?: StreamBehaviour,
  failingSubscriptions?: number,
  statusPathOverride?: (root: string) => string,
  existingStatus?: string,
  processState: ProcessState = createProcessState(),
): Promise<SetupHarness> {
  const root = await mkdtemp(join(tmpdir(), 'auto-compact-setup-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const configPath = join(root, 'config.json')
  if (config !== undefined) {
    await writeFile(configPath, JSON.stringify(config))
  }
  const statusPath = statusPathOverride?.(root) ?? join(root, 'status.json')
  if (existingStatus !== undefined) {
    await writeFile(statusPath, existingStatus)
  }
  const fake = createWatchedFakeApi(t, { stream, failingSubscriptions })
  const logs: string[] = []
  await setupAutoCompact(
    fake.api,
    { configPath, statusPath, log: (message) => logs.push(message) },
    processState,
  )
  return { fake, logs, configPath, statusPath }
}

function thresholdReachingEvents(): ThresholdEvent[] {
  return [
    {
      type: 'session.step.started',
      data: { sessionID: 'session-1', model: { id: 'model-a', providerID: 'provider-a' } },
    },
    {
      type: 'session.step.ended',
      data: {
        sessionID: 'session-1',
        tokens: { input: 900, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    },
  ]
}

async function waitForImmediates(condition: () => boolean): Promise<void> {
  for (let tick = 0; tick < 200 && !condition(); tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.ok(condition(), 'condition not met within 200 event loop turns')
}

test('setupAutoCompact uses the configured confirmation timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { fake } = await setupWithConfig(t, {
    confirmationTimeoutSeconds: 7,
    compactAtPercentOfInputLimit: CONFIGURED_THRESHOLD_PERCENT,
  })
  for (const event of thresholdReachingEvents()) {
    fake.subscriptions[0]?.emit(event)
  }
  await waitForImmediates(() => compactCalls(fake.calls).length === 1)

  t.mock.timers.tick(7000)
  await waitForImmediates(() => syntheticTexts(fake.calls).length === 1)

  const [notice] = syntheticTexts(fake.calls)
  assert.ok(notice?.includes('within 7 seconds'), notice)
})

test('setupAutoCompact does not register the plan trigger when compactOnPlanSave is false', async (t) => {
  const { fake } = await setupWithConfig(t, { compactOnPlanSave: false })

  assert.equal(fake.hooks.has('execute.after'), false)
})

test('setupAutoCompact registers the compaction hook when compactOnPlanSave is false', async (t) => {
  const { fake } = await setupWithConfig(t, { compactOnPlanSave: false })

  assert.equal(fake.hooks.has('compaction'), true)
})

test('setupAutoCompact starts no threshold watcher when no threshold is configured', async (t) => {
  const { fake } = await setupWithConfig(t, {})

  assert.deepEqual(fake.subscriptions, [])
})

test('setupAutoCompact logs an invalid config value through the injected log', async (t) => {
  const { logs } = await setupWithConfig(t, { compactOnPlanSave: 'yes' })

  assert.ok(logs[0]?.includes('compactOnPlanSave'), logs[0])
})

test('setupAutoCompact passes the injected log to the threshold watcher', async (t) => {
  const { logs } = await setupWithConfig(
    t,
    { compactAtPercentOfInputLimit: CONFIGURED_THRESHOLD_PERCENT },
    'throws',
  )

  await waitForImmediates(() => logs.length > 0)

  assert.equal(
    logs[0],
    'auto-compact: the threshold watcher stream failed (stream broke). Resubscribing once.',
  )
})

test('setupAutoCompact reads the config file only at setup', async (t) => {
  const { fake, configPath } = await setupWithConfig(t, {})
  await writeFile(configPath, JSON.stringify({ compactOnPlanSave: false }))
  const missingPath = join(SETUP_PLAN_DIRECTORY, 'setup-check.md')
  const handler = fake.hooks.get('execute.after') as (input: ExecuteAfterInput) => Promise<void>

  await handler(writeExecution({ input: { path: missingPath } }))

  assert.equal(syntheticTexts(fake.calls).length, 1)
})

test('a plan run stays in flight after the compaction hook runs', async (t) => {
  const harness = await createHarness(t)
  const planPath = await writePlan(harness.workspace.planDirectory, 'design.md', 'plan one')
  await savePlan(harness, planPath)

  await runCompactionHook(harness)

  assert.equal(harness.autoCompact.isCompactionInFlight('session-1'), true)
})

test('setupAutoCompact registers a command named auto-compact', async (t) => {
  const { fake } = await setupWithConfig(t, {})

  assert.deepEqual(
    fake.commands.map((command) => command.name),
    ['auto-compact'],
  )
})

async function runCommand(harness: SetupHarness, argument: string): Promise<void> {
  const [command] = harness.fake.commands
  await command?.execute({ sessionID: 'session-1', prompt: { text: argument } })
}

function emitToWatchers(fake: FakeApi, event: AutoCompactEvent): void {
  for (const subscription of fake.subscriptions) {
    if (!subscription.signal.aborted) {
      subscription.emit(event)
    }
  }
}

function stepEndedAtPercent(percent: number): ThresholdEvent {
  return {
    type: 'session.step.ended',
    data: {
      sessionID: 'session-1',
      tokens: { input: percent * 10, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  }
}

function emitStepAtPercent(fake: FakeApi, percent: number): void {
  const [stepStarted] = thresholdReachingEvents()
  emitToWatchers(fake, stepStarted as ThresholdEvent)
  emitToWatchers(fake, stepEndedAtPercent(percent))
}

async function settleEventLoop(): Promise<void> {
  for (let tick = 0; tick < 50; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

test('a threshold set through the command while the threshold is off compacts a session above it', async (t) => {
  const harness = await setupWithConfig(t, {})

  await runCommand(harness, '50')
  emitStepAtPercent(harness.fake, 60)

  await waitForImmediates(() => compactCalls(harness.fake.calls).length === 1)
})

test('raising the threshold through the command stops a step below the new value from compacting', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })

  await runCommand(harness, '80')
  emitStepAtPercent(harness.fake, 60)
  await settleEventLoop()

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('turning the threshold off through the command stops a step at 99 percent from compacting', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })

  await runCommand(harness, 'off')
  emitStepAtPercent(harness.fake, 99)
  await settleEventLoop()

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('turning the threshold off and back on does not compact a session that stayed above it', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })
  emitStepAtPercent(harness.fake, 60)
  await waitForImmediates(() => compactCalls(harness.fake.calls).length === 1)
  emitToWatchers(harness.fake, ENDED_EVENT)
  await waitForUnsubscribe(harness.fake)

  await runCommand(harness, 'off')
  await runCommand(harness, '1')
  emitStepAtPercent(harness.fake, 60)
  await settleEventLoop()

  assert.equal(compactCalls(harness.fake.calls).length, 1)
})

test('setting the threshold after the watcher gave up starts a new watcher that compacts', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 80 }, undefined, 2)
  await waitForImmediates(() => harness.logs.length === 2)
  await settleEventLoop()

  await runCommand(harness, '50')
  emitStepAtPercent(harness.fake, 60)

  await waitForImmediates(() => compactCalls(harness.fake.calls).length === 1)
})

test('the command without an argument posts the current threshold', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 12.5 })

  await runCommand(harness, '')

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    'Auto-compact threshold is 12.5% of the input limit.',
  ])
})

test('the command without an argument posts that the threshold is off', async (t) => {
  const harness = await setupWithConfig(t, {})

  await runCommand(harness, '')

  assert.deepEqual(syntheticTexts(harness.fake.calls), ['Auto-compact threshold is off.'])
})

test('the command with an invalid argument posts the usage text', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })

  await runCommand(harness, '101')

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    'Use /auto-compact <1-100> or /auto-compact off.',
  ])
})

test('the command with an invalid argument leaves the config file byte-identical', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })
  const before = await readFile(harness.configPath)

  await runCommand(harness, 'abc')

  assert.deepEqual(await readFile(harness.configPath), before)
})

test('the command saves the threshold to the config file', async (t) => {
  const harness = await setupWithConfig(t, { compactOnPlanSave: false })

  await runCommand(harness, '50')

  const saved = JSON.parse(await readFile(harness.configPath, 'utf8'))
  assert.equal(saved.compactAtPercentOfInputLimit, 50)
})

test('a failed save posts the error naming the config path', async (t) => {
  const harness = await setupWithConfig(t, {})
  await writeFile(harness.configPath, '{not json')

  await runCommand(harness, '50')

  const [text] = syntheticTexts(harness.fake.calls)
  const expectedPrefix = `Could not save the auto-compact threshold: ${harness.configPath} is not valid JSON (`
  assert.ok(text?.startsWith(expectedPrefix), text)
  assert.ok(text?.endsWith('). The threshold is unchanged.'), text)
  assert.ok(!text?.includes('..'), text)
})

test('a failed save keeps the old threshold on the watcher', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 80 })
  await writeFile(harness.configPath, '{not json')

  await runCommand(harness, '50')
  emitStepAtPercent(harness.fake, 60)
  await settleEventLoop()

  assert.deepEqual(compactCalls(harness.fake.calls), [])
})

test('setting the threshold posts the set confirmation', async (t) => {
  const harness = await setupWithConfig(t, {})

  await runCommand(harness, '12.5')

  assert.deepEqual(syntheticTexts(harness.fake.calls), [
    'Auto-compact threshold set to 12.5% of the input limit.',
  ])
})

test('turning the threshold off posts the off confirmation', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })

  await runCommand(harness, 'off')

  assert.deepEqual(syntheticTexts(harness.fake.calls), ['Auto-compact threshold turned off.'])
})

test('a command reply is sent to the invoking session without resuming it', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 50 })
  const [command] = harness.fake.commands

  await command?.execute({ sessionID: 'session-7', prompt: { text: '' } })

  const replyArgs = syntheticCalls(harness.fake.calls)[0]?.args as { sessionID: string; resume: boolean }
  assert.deepEqual(
    { sessionID: replyArgs.sessionID, resume: replyArgs.resume },
    { sessionID: 'session-7', resume: false },
  )
})

test('turning the threshold off while no threshold is configured starts no watcher', async (t) => {
  const harness = await setupWithConfig(t, {})

  await runCommand(harness, 'off')

  assert.deepEqual(harness.fake.subscriptions, [])
})

test('the command resolves when posting the message is rejected', async (t) => {
  const harness = await setupWithConfig(t, {})
  harness.fake.failures.set('session.synthetic', 'post rejected')

  await assert.doesNotReject(runCommand(harness, '50'))
})

const FAILED_STATUS_FILE = '{"thresholdWatcher":"failed"}'

test('setup removes an existing status file when no threshold is configured', async (t) => {
  const { statusPath } = await setupWithConfig(t, {}, undefined, undefined, undefined, FAILED_STATUS_FILE)

  assert.equal(await readWatcherFailed(statusPath), false)
})

test('setting the threshold after the watcher gave up removes the failed status file', async (t) => {
  const harness = await setupWithConfig(t, { compactAtPercentOfInputLimit: 80 }, undefined, 2)
  await waitForFailedStatus(harness.statusPath)

  await runCommand(harness, '50')

  assert.equal(await readWatcherFailed(harness.statusPath), false)
})

test('a failed status write is logged with the status path', async (t) => {
  const missingDirectoryStatus = (root: string): string => join(root, 'missing', 'status.json')
  const { logs, statusPath } = await setupWithConfig(
    t,
    { compactAtPercentOfInputLimit: 80 },
    undefined,
    2,
    missingDirectoryStatus,
  )
  await waitForImmediates(() => logs.length === 3)

  assert.ok(logs[2]?.startsWith(`auto-compact: could not write ${statusPath}: `))
})

const DIRECTORY_AS_STATUS_PATH = (root: string): string => root

test('a failed clear at setup is logged with the status path', async (t) => {
  const { logs, statusPath } = await setupWithConfig(
    t,
    {},
    undefined,
    undefined,
    DIRECTORY_AS_STATUS_PATH,
  )

  assert.ok(logs[0]?.startsWith(`auto-compact: could not clear ${statusPath}: `))
})

test('a failed clear at setup still starts the threshold watcher', async (t) => {
  const { fake } = await setupWithConfig(
    t,
    { compactAtPercentOfInputLimit: 80 },
    undefined,
    undefined,
    DIRECTORY_AS_STATUS_PATH,
  )

  assert.equal(fake.subscriptions.length, 1)
})

const THRESHOLD_CONFIG = { compactAtPercentOfInputLimit: CONFIGURED_THRESHOLD_PERCENT }

function setupSharingState(
  t: TestContext,
  processState: ProcessState,
  config: unknown = THRESHOLD_CONFIG,
): Promise<SetupHarness> {
  return setupWithConfig(t, config, undefined, undefined, undefined, undefined, processState)
}

function runningSubscriptionCount(...harnesses: SetupHarness[]): number {
  return harnesses
    .flatMap(({ fake }) => fake.subscriptions)
    .filter((subscription) => !subscription.signal.aborted).length
}

test('a second setup sharing the state leaves one running watcher', async (t) => {
  const processState = createProcessState()
  const first = await setupSharingState(t, processState)
  const second = await setupSharingState(t, processState)

  assert.equal(runningSubscriptionCount(first, second), 1)
})

test('one threshold crossing seen by two setups sharing the state requests one compaction', async (t) => {
  const processState = createProcessState()
  const first = await setupSharingState(t, processState)
  const second = await setupSharingState(t, processState)

  for (const { fake } of [first, second]) {
    emitStepAtPercent(fake, 90)
  }
  await settleEventLoop()

  const requests = [first, second].flatMap(({ fake }) => compactCalls(fake.calls))
  assert.equal(requests.length, 1)
})

test('two instances sharing a state do not both compact the same session', async (t) => {
  const workspace = await createWorkspace(t)
  const processState = createProcessState()
  const options = { ...workspace, confirmationTimeoutMs: WAIT_LIMIT_MS }
  const first = createAutoCompact(options, processState)
  const second = createAutoCompact(options, processState)
  const fake = createWatchedFakeApi(t)

  await first.startThresholdCompaction(fake.api, 'session-1', 80)
  await second.startThresholdCompaction(fake.api, 'session-1', 80)

  assert.equal(compactCalls(fake.calls).length, 1)
})

test('a new setup with the threshold off stops the previous watcher and starts none', async (t) => {
  const processState = createProcessState()
  const first = await setupSharingState(t, processState)
  const second = await setupSharingState(t, processState, {})

  assert.equal(runningSubscriptionCount(first, second), 0)
})

test('setting the threshold after the watcher gave up leaves one running watcher', async (t) => {
  const harness = await setupWithConfig(t, THRESHOLD_CONFIG, undefined, 2)
  await waitForFailedStatus(harness.statusPath)

  await runCommand(harness, '50')

  assert.equal(runningSubscriptionCount(harness), 1)
})

async function createInstancesSharingState(t: TestContext, count: number) {
  const workspace = await createWorkspace(t)
  const processState = createProcessState()
  const options = { ...workspace, confirmationTimeoutMs: WAIT_LIMIT_MS }
  const instances = Array.from({ length: count }, () => createAutoCompact(options, processState))
  return { workspace, processState, instances }
}

test('two instances seeing the same plan write request one compaction', async (t) => {
  const { workspace, instances } = await createInstancesSharingState(t, 2)
  const fake = createWatchedFakeApi(t)
  const planPath = await writePlan(workspace.planDirectory, 'design.md', 'plan')

  await Promise.all(
    instances.map((instance) =>
      instance.handleExecuteAfter(
        fake.api,
        writeExecution({ id: 'call-1', input: { path: planPath } }),
      ),
    ),
  )

  assert.equal(compactCalls(fake.calls).length, 1)
})

test('two instances seeing the same unreadable plan write post one notice', async (t) => {
  const { workspace, instances } = await createInstancesSharingState(t, 2)
  const fake = createWatchedFakeApi(t)
  const missingPath = join(workspace.planDirectory, 'missing.md')

  await Promise.all(
    instances.map((instance) =>
      instance.handleExecuteAfter(
        fake.api,
        writeExecution({ id: 'call-1', input: { path: missingPath } }),
      ),
    ),
  )

  assert.equal(syntheticTexts(fake.calls).length, 1)
})

test('a plan write with a new call ID is handled after an earlier call ID was claimed', async (t) => {
  const { workspace, instances } = await createInstancesSharingState(t, 2)
  const fake = createWatchedFakeApi(t)
  const missingPath = join(workspace.planDirectory, 'missing.md')

  await instances[0]?.handleExecuteAfter(
    fake.api,
    writeExecution({ id: 'call-1', input: { path: missingPath } }),
  )
  await instances[1]?.handleExecuteAfter(
    fake.api,
    writeExecution({ id: 'call-2', input: { path: missingPath } }),
  )

  assert.equal(syntheticTexts(fake.calls).length, 2)
})

test('a write outside the plan directory does not claim its call ID', async (t) => {
  const { workspace, processState, instances } = await createInstancesSharingState(t, 1)
  const fake = createWatchedFakeApi(t)
  const outsidePath = join(workspace.homeDirectory, 'notes.md')

  await instances[0]?.handleExecuteAfter(
    fake.api,
    writeExecution({ id: 'call-1', input: { path: outsidePath } }),
  )

  assert.equal(processState.handledPlanWriteIds.has('call-1'), false)
})
