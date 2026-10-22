import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import type { OpencodeEvent } from './event-kind.ts'
import rateGuardPlugin, { setupRateGuard, type RateGuardApi } from './index.ts'
import type { RetryEvent } from './retry-delay.ts'
import type { SubagentCall } from './slot-tracker.ts'

interface RegisteredCommand {
  readonly name: string
  readonly description: string
  execute(invocation: { sessionID: string; prompt: { text: string } }): Promise<void>
}

async function createFixture(t: TestContext, limit = 1) {
  const directory = await mkdtemp(join(tmpdir(), 'rate-guard-index-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const configPath = join(directory, 'config.json')
  await writeFile(configPath, JSON.stringify({ maxConcurrentHardSubagents: limit }))
  const hooks: Record<string, (event: never) => Promise<void>> = {}
  const commands: RegisteredCommand[] = []
  const notices: string[] = []
  const events: { push(event: OpencodeEvent): void } = { push: () => {} }
  const deletedSessions = new Set<string>()
  const api: RateGuardApi = {
    session: {
      hook: async (name, handler) => void (hooks[name] = handler as never),
      get: async ({ sessionID }) => {
        if (deletedSessions.has(sessionID)) {
          throw new Error('session not found')
        }
        return { id: sessionID }
      },
      synthetic: async ({ text }) => void notices.push(text),
    },
    tool: { hook: async (name, handler) => void (hooks[name] = handler as never) },
    agent: {
      get: async ({ agentID }) => ({
        data: { model: { id: agentID === 'stack-planner' ? 'hard' : 'easy', providerID: 'openai' } },
      }),
    },
    event: {
      subscribe: ({ signal }) => eventStream(events, signal),
    },
    command: { transform: (fn) => fn({ add: (command) => void commands.push(command) }) },
  }
  await setupRateGuard(api, { configPath, warn: () => {}, random: () => 0 })
  return { hooks, commands, notices, events, configPath, deletedSessions }
}

async function* eventStream(
  events: { push(event: OpencodeEvent): void },
  signal: AbortSignal,
): AsyncIterable<OpencodeEvent> {
  const queue: OpencodeEvent[] = []
  let wake: () => void = () => {}
  events.push = (event) => {
    queue.push(event)
    wake()
  }
  while (!signal.aborted) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        wake = resolve
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
    }
    const next = queue.shift()
    if (next !== undefined) {
      yield next
    }
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

function subagentCall(id: string, agent: string, background = false): SubagentCall {
  return { tool: 'subagent', sessionID: 'parent', id, input: { agent, background } }
}

function rateLimited(attempt: number): RetryEvent {
  return {
    attempt,
    error: { type: 'provider.rate-limit', status: 429, message: 'try again in 2s' },
    decision: { retry: true, delay: 1 },
  }
}

test('a rate-limit retry gets the longer delay through the registered hook', async (t) => {
  const { hooks } = await createFixture(t)
  const event = rateLimited(2)
  await hooks.retry?.(event as never)
  assert.deepEqual(event.decision, { retry: true, delay: 2000 })
})

test('a hard subagent call waits for a slot through the registered hooks', async (t) => {
  const { hooks } = await createFixture(t, 1)
  await hooks['execute.before']?.(subagentCall('c1', 'stack-planner') as never)
  let secondStarted = false
  void hooks['execute.before']?.(subagentCall('c2', 'stack-planner') as never).then(() => {
    secondStarted = true
  })
  await settle()
  assert.equal(secondStarted, false)
})

test('a background hard call frees its slot only when the child end event arrives', async (t) => {
  const { hooks, events } = await createFixture(t, 1)
  await hooks['execute.before']?.(subagentCall('c1', 'stack-planner', true) as never)
  const result = { output: { sessionID: 'child-1', status: 'running' } }
  await hooks['execute.after']?.({ ...subagentCall('c1', 'stack-planner', true), result } as never)
  let secondStarted = false
  void hooks['execute.before']?.(subagentCall('c2', 'stack-planner') as never).then(() => {
    secondStarted = true
  })
  await settle()
  const startedBeforeEvent = secondStarted
  events.push({ type: 'session.execution.succeeded', data: { sessionID: 'child-1' } })
  await settle()
  assert.deepEqual([startedBeforeEvent, secondStarted], [false, true])
})

test('a queued call whose session was deleted is dropped when its turn comes', async (t) => {
  const { hooks, deletedSessions } = await createFixture(t, 1)
  await hooks['execute.before']?.(subagentCall('c1', 'stack-planner') as never)
  const queued = hooks['execute.before']?.({
    ...subagentCall('c2', 'stack-planner'),
    sessionID: 'gone',
  } as never)
  let queuedSettled = false
  void queued?.then(() => {
    queuedSettled = true
  })
  deletedSessions.add('gone')
  await settle()
  await hooks['execute.after']?.(subagentCall('c1', 'stack-planner') as never)
  await settle()
  assert.equal(queuedSettled, true)
})

test('the hard-limit command is registered with a description naming openai/hard', async (t) => {
  const { commands } = await createFixture(t)
  assert.deepEqual(
    [commands[0]?.name, commands[0]?.description.includes('openai/hard')],
    ['hard-limit', true],
  )
})

test('the hard-limit command without an argument reports the current limit', async (t) => {
  const { commands, notices } = await createFixture(t, 3)
  await commands[0]?.execute({ sessionID: 'parent', prompt: { text: '' } })
  assert.match(notices[0] ?? '', /3/)
})

test('the hard-limit command saves a new limit to the config file', async (t) => {
  const { commands, configPath } = await createFixture(t, 1)
  await commands[0]?.execute({ sessionID: 'parent', prompt: { text: '4' } })
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).maxConcurrentHardSubagents, 4)
})

test('raising the limit through the command wakes a queued hard call', async (t) => {
  const { hooks, commands } = await createFixture(t, 1)
  await hooks['execute.before']?.(subagentCall('c1', 'stack-planner') as never)
  let secondStarted = false
  void hooks['execute.before']?.(subagentCall('c2', 'stack-planner') as never).then(() => {
    secondStarted = true
  })
  await settle()
  await commands[0]?.execute({ sessionID: 'parent', prompt: { text: '2' } })
  await settle()
  assert.equal(secondStarted, true)
})

test('the hard-limit command replies with usage for an invalid argument', async (t) => {
  const { commands, notices } = await createFixture(t)
  await commands[0]?.execute({ sessionID: 'parent', prompt: { text: '99' } })
  assert.match(notices[0] ?? '', /\/hard-limit <1-10>/)
})

test('the default export is the rate-guard plugin', () => {
  assert.equal(rateGuardPlugin.id, 'rate-guard')
})

test('an event stream that ends without an error logs the restart warning', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'rate-guard-stream-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const warnings: string[] = []
  const api: RateGuardApi = {
    session: { hook: async () => {}, get: async () => ({}), synthetic: async () => {} },
    tool: { hook: async () => {} },
    agent: { get: async () => ({}) },
    event: { subscribe: () => (async function* (): AsyncGenerator<OpencodeEvent> {})() },
    command: { transform: () => {} },
  }
  await setupRateGuard(api, {
    configPath: join(directory, 'config.json'),
    warn: (message) => warnings.push(message),
    random: () => 0,
  })
  await settle()
  assert.ok(warnings.some((message) => message.includes('Restart opencode')))
})
