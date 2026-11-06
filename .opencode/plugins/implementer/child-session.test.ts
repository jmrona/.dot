import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSlotSemaphore } from '../rate-guard/semaphore.ts'
import {
  createChildSessionRunner,
  extractLastJsonBlock,
  type ChildRunSpec,
  type ChildSessionApi,
  type ContextMessage,
} from './child-session.ts'

interface RecordedCall {
  readonly method: string
  readonly args: unknown
}

interface FakeOptions {
  readonly failures?: Readonly<Record<string, string>>
  readonly waitNeverResolves?: boolean
  readonly context?: readonly ContextMessage[]
}

const HARD_MODEL = 'openai/hard'
const CHILD_ID = 'child-1'

function reportMessage(text: string): ContextMessage {
  return { type: 'assistant', content: [{ type: 'text', text }] }
}

function jsonReport(value: unknown): readonly ContextMessage[] {
  return [reportMessage(`Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)]
}

function createFakeApi(options: FakeOptions = {}): { api: ChildSessionApi; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const step = async <T>(method: string, args: unknown, result: T): Promise<T> => {
    calls.push({ method, args })
    const failure = options.failures?.[method]
    if (failure) throw new Error(failure)
    return result
  }
  const api: ChildSessionApi = {
    session: {
      create: (input) => step('create', input, { id: CHILD_ID }),
      prompt: (input) => step('prompt', input, undefined),
      wait: (input) =>
        options.waitNeverResolves
          ? (calls.push({ method: 'wait', args: input }), new Promise<never>(() => {}))
          : step('wait', input, undefined),
      context: (input) => step('context', input, options.context ?? jsonReport({ status: 'DONE' })),
      interrupt: (input) => step('interrupt', input, undefined),
    },
  }
  return { api, calls }
}

function createRunner(fake: { api: ChildSessionApi }, model = HARD_MODEL, timeoutSeconds = 5) {
  const semaphore = createSlotSemaphore(1, async () => true)
  const runner = createChildSessionRunner({ api: fake.api, semaphore, hardModel: model, timeoutSeconds })
  return { runner, semaphore }
}

function specFor(overrides: Partial<ChildRunSpec> = {}): ChildRunSpec {
  return {
    parentID: 'parent-1',
    agent: 'build',
    model: 'openai/routine',
    text: 'do the task',
    requiredFields: ['status'],
    slotKey: 'call-1',
    ...overrides,
  }
}

function methodsOf(calls: readonly RecordedCall[]): string[] {
  return calls.map((call) => call.method)
}

test('extractLastJsonBlock parses the last fenced json block', () => {
  const text = '```json\n{"a":1}\n```\ntext\n```json\n{"a":2}\n```'
  assert.deepEqual(extractLastJsonBlock(text), { a: 2 })
})

test('extractLastJsonBlock returns undefined when no block parses', () => {
  assert.equal(extractLastJsonBlock('```json\nnot json\n```'), undefined)
})

test('run creates the child from a provider/id model string', async () => {
  const fake = createFakeApi()
  await createRunner(fake).runner.run(specFor())
  assert.deepEqual(fake.calls[0], {
    method: 'create',
    args: { parentID: 'parent-1', agent: 'build', model: { providerID: 'openai', id: 'routine' } },
  })
})

test('run prompts then waits for the created child', async () => {
  const fake = createFakeApi()
  await createRunner(fake).runner.run(specFor())
  assert.deepEqual(fake.calls.slice(1, 3), [
    { method: 'prompt', args: { sessionID: CHILD_ID, text: 'do the task' } },
    { method: 'wait', args: { sessionID: CHILD_ID } },
  ])
})

test('run returns the object parsed from the last assistant message', async () => {
  const context = [reportMessage('```json\n{"status":"old"}\n```'), reportMessage('```json\n{"status":"DONE"}\n```'), { type: 'idle' }]
  const result = await createRunner(createFakeApi({ context })).runner.run(specFor())
  assert.deepEqual(result, { ok: true, value: { status: 'DONE' }, sessionID: CHILD_ID })
})

test('run returns invalid-report when no json block parses', async () => {
  const context = [reportMessage('no report here')]
  const result = await createRunner(createFakeApi({ context })).runner.run(specFor())
  assert.deepEqual(result, { ok: false, reason: 'invalid-report', sessionID: CHILD_ID })
})

test('run returns invalid-report when a required field is missing', async () => {
  const context = jsonReport({ other: 1 })
  const result = await createRunner(createFakeApi({ context })).runner.run(specFor())
  assert.equal(result.ok === false && result.reason, 'invalid-report')
})

for (const method of ['create', 'prompt', 'wait', 'context']) {
  test(`run returns session-error with the message when ${method} throws`, async () => {
    const fake = createFakeApi({ failures: { [method]: 'boom' } })
    const result = await createRunner(fake).runner.run(specFor())
    assert.equal(result.ok === false && result.reason, 'session-error: boom')
  })
}

test('run returns session-error when the model has no provider prefix', async () => {
  const result = await createRunner(createFakeApi()).runner.run(specFor({ model: 'routine' }))
  assert.equal(result.ok === false && result.reason, 'session-error: model must be provider/id, got routine')
})

test('run holds a semaphore slot while a hard model child runs', async () => {
  const fake = createFakeApi({ waitNeverResolves: true })
  const { runner, semaphore } = createRunner(fake, HARD_MODEL, 0.05)
  const holder = await semaphore.acquire('other', 'other-call')
  assert.equal(holder, true)
  let started = false
  const pending = runner.run(specFor({ model: HARD_MODEL })).then(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 20))
  started = fake.calls.length > 0
  semaphore.release()
  await pending
  assert.equal(started, false)
})

test('run does not acquire a slot for a routine model', async () => {
  const { runner, semaphore } = createRunner(createFakeApi())
  await semaphore.acquire('other', 'other-call')
  const result = await runner.run(specFor({ model: 'openai/routine' }))
  assert.equal(result.ok, true)
})

test('run returns no hard slot when acquire resolves false', async () => {
  const fake = createFakeApi()
  const semaphore = createSlotSemaphore(1, async () => false)
  const runner = createChildSessionRunner({ api: fake.api, semaphore, hardModel: HARD_MODEL, timeoutSeconds: 5 })
  const result = await runner.run(specFor({ model: HARD_MODEL }))
  assert.deepEqual(result, { ok: false, reason: 'session-error: no hard slot' })
})

test('run releases the slot when wait throws', async () => {
  const fake = createFakeApi({ failures: { wait: 'boom' } })
  const { runner, semaphore } = createRunner(fake)
  await runner.run(specFor({ model: HARD_MODEL }))
  assert.equal(await semaphore.acquire('next', 'next-call'), true)
})

test('run interrupts the child and returns child-timeout when wait exceeds the timeout', async () => {
  const fake = createFakeApi({ waitNeverResolves: true })
  const result = await createRunner(fake, HARD_MODEL, 0.05).runner.run(specFor())
  assert.deepEqual(result, { ok: false, reason: 'child-timeout', sessionID: CHILD_ID })
  assert.deepEqual(fake.calls.at(-1), { method: 'interrupt', args: { sessionID: CHILD_ID } })
})

test('run interrupts the child and returns cancelled when the signal fires', async () => {
  const fake = createFakeApi({ waitNeverResolves: true })
  const controller = new AbortController()
  const pending = createRunner(fake).runner.run(specFor({ signal: controller.signal }))
  await new Promise((resolve) => setTimeout(resolve, 10))
  controller.abort()
  const result = await pending
  assert.deepEqual(result, { ok: false, reason: 'cancelled', sessionID: CHILD_ID })
  assert.equal(methodsOf(fake.calls).at(-1), 'interrupt')
})

test('run returns cancelled without creating a child when the signal is already aborted', async () => {
  const fake = createFakeApi()
  const result = await createRunner(fake).runner.run(specFor({ signal: AbortSignal.abort() }))
  assert.deepEqual(result, { ok: false, reason: 'cancelled' })
  assert.deepEqual(fake.calls, [])
})
