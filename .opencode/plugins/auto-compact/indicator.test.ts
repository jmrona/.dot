import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { commandReplyOf, indicatorLabel, readIndicatorState, type IndicatorData } from './indicator.ts'

const ROOT_SESSION = { id: 'ses_root', location: { directory: '/work/app' } }

const EASY_MODEL_ENTRY = {
  id: 'easy',
  modelID: 'gpt-5',
  providerID: 'openai',
  limit: { context: 1050000, input: 1000, output: 128000 },
}

const USAGE_TOKENS = {
  input: 200,
  output: 50,
  reasoning: 10,
  cache: { read: 40, write: 20 },
}

function assistantMessage(tokens: unknown = USAGE_TOKENS): unknown {
  return {
    type: 'assistant',
    model: { id: 'easy', providerID: 'openai', variant: 'default' },
    tokens,
  }
}

interface FakeOptions {
  readonly session?: unknown
  readonly messages?: unknown
  readonly models?: unknown
}

function fakeData(options: FakeOptions = {}): IndicatorData {
  return {
    session: {
      get: () => options.session,
      message: { list: () => options.messages ?? [] },
    },
    location: { model: { list: () => options.models ?? [EASY_MODEL_ENTRY] } },
  }
}

async function createDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-compact-indicator-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function configPathWith(t: TestContext, contents: string): Promise<string> {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, contents)
  return path
}

async function missingConfigPath(t: TestContext): Promise<string> {
  return join(await createDirectory(t), 'config.json')
}

test('indicator rounds usage half up to the nearest whole percent', () => {
  assert.equal(indicatorLabel({ contextTokens: 505, limit: 1000, percent: 50 }), 'auto-compact 51/50%')
})

test('indicator rounds usage below half down to the nearest whole percent', () => {
  assert.equal(indicatorLabel({ contextTokens: 494, limit: 1000, percent: 50 }), 'auto-compact 49/50%')
})

test('indicator state shows auto-compact off when the config file is missing', async (t) => {
  const label = await readIndicatorState(fakeData({ session: ROOT_SESSION }), 'ses_root', await missingConfigPath(t))

  assert.equal(label, 'auto-compact off')
})

test('indicator state hides when there is no session ID', async (t) => {
  const label = await readIndicatorState(fakeData({ session: ROOT_SESSION }), undefined, await missingConfigPath(t))

  assert.equal(label, undefined)
})

test('indicator state hides when the session cannot be found yet', async (t) => {
  const label = await readIndicatorState(fakeData(), 'ses_new', await missingConfigPath(t))

  assert.equal(label, undefined)
})

test('indicator state hides for a child session even when the threshold is off', async (t) => {
  const childSession = { ...ROOT_SESSION, parentID: 'ses_root' }

  const label = await readIndicatorState(
    fakeData({ session: childSession }),
    'ses_child',
    await missingConfigPath(t),
  )

  assert.equal(label, undefined)
})

test('indicator state shows usage from the last assistant message that has tokens', async (t) => {
  const messages = [
    assistantMessage({ input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }),
    assistantMessage(),
    { type: 'synthetic', text: 'continue' },
  ]

  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, 'auto-compact 32/50%')
})

test('indicator state uses the context limit when the input limit is absent', async (t) => {
  const models = [{ ...EASY_MODEL_ENTRY, limit: { context: 2000, output: 128000 } }]

  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages: [assistantMessage()], models }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, 'auto-compact 16/50%')
})

test('indicator state hides when no assistant message has tokens', async (t) => {
  const messages = [{ type: 'user', text: 'hello' }, { type: 'synthetic', text: 'continue' }]

  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, undefined)
})

test('indicator state hides when no model entry matches the last assistant message', async (t) => {
  const models = [{ ...EASY_MODEL_ENTRY, providerID: 'anthropic' }]

  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages: [assistantMessage()], models }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, undefined)
})

test('indicator state hides when config.json is not valid JSON', async (t) => {
  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages: [assistantMessage()] }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": '),
  )

  assert.equal(label, undefined)
})

test('indicator state hides when the threshold in config.json is out of range', async (t) => {
  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages: [assistantMessage()] }),
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 150 }'),
  )

  assert.equal(label, undefined)
})

test('indicator state still shows usage when only another config key is invalid', async (t) => {
  const label = await readIndicatorState(
    fakeData({ session: ROOT_SESSION, messages: [assistantMessage()] }),
    'ses_root',
    await configPathWith(t, '{ "compactOnPlanSave": "yes", "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, 'auto-compact 32/50%')
})

test('indicator state hides when a data method throws', async (t) => {
  const throwingData: IndicatorData = {
    session: {
      get: () => {
        throw new Error('session store unavailable')
      },
      message: { list: () => [] },
    },
    location: { model: { list: () => [EASY_MODEL_ENTRY] } },
  }

  const label = await readIndicatorState(
    throwingData,
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, undefined)
})

test('indicator state works when the data methods return promises', async (t) => {
  const asyncData: IndicatorData = {
    session: {
      get: async () => ROOT_SESSION,
      message: { list: async () => [assistantMessage()] },
    },
    location: { model: { list: async () => [EASY_MODEL_ENTRY] } },
  }

  const label = await readIndicatorState(
    asyncData,
    'ses_root',
    await configPathWith(t, '{ "compactAtPercentOfInputLimit": 50 }'),
  )

  assert.equal(label, 'auto-compact 32/50%')
})

test('indicator prints a fractional threshold exactly as configured', () => {
  assert.equal(indicatorLabel({ contextTokens: 70, limit: 1000, percent: 12.5 }), 'auto-compact 7/12.5%')
})

function enqueuedEvent(
  text: unknown,
  overrides: { type?: string; sessionID?: string; itemType?: string } = {},
): unknown {
  return {
    type: overrides.type ?? 'session.inbox.enqueued',
    data: {
      sessionID: overrides.sessionID ?? 'ses_root',
      item: { type: overrides.itemType ?? 'synthetic', payload: { text }, delivery: 'steer' },
    },
  }
}

test('command reply returns the set confirmation as info', () => {
  const text = 'Auto-compact threshold set to 40% of the input limit.'

  assert.deepEqual(commandReplyOf(enqueuedEvent(text), 'ses_root'), { message: text, variant: 'info' })
})

test('command reply returns the show reply as info', () => {
  const text = 'Auto-compact threshold is 40% of the input limit.'

  assert.deepEqual(commandReplyOf(enqueuedEvent(text), 'ses_root'), { message: text, variant: 'info' })
})

test('command reply returns the usage text as error', () => {
  const text = 'Use /auto-compact <1-100> or /auto-compact off.'

  assert.deepEqual(commandReplyOf(enqueuedEvent(text), 'ses_root'), { message: text, variant: 'error' })
})

test('command reply returns the save failure as error', () => {
  const text = 'Could not save the auto-compact threshold: disk full. The threshold is unchanged.'

  assert.deepEqual(commandReplyOf(enqueuedEvent(text), 'ses_root'), { message: text, variant: 'error' })
})

test('command reply ignores a synthetic message from another feature', () => {
  const event = enqueuedEvent('Plan saved to /work/app/plan.md.')

  assert.equal(commandReplyOf(event, 'ses_root'), undefined)
})

test('command reply ignores an event for another session', () => {
  const event = enqueuedEvent('Auto-compact threshold turned off.', { sessionID: 'ses_other' })

  assert.equal(commandReplyOf(event, 'ses_root'), undefined)
})

test('command reply ignores the event when no session is visible', () => {
  const event = {
    type: 'session.inbox.enqueued',
    data: { item: { type: 'synthetic', payload: { text: 'Auto-compact threshold turned off.' } } },
  }

  assert.equal(commandReplyOf(event, undefined), undefined)
})

test('command reply ignores an event of another type', () => {
  const event = enqueuedEvent('Auto-compact threshold turned off.', { type: 'session.step.ended' })

  assert.equal(commandReplyOf(event, 'ses_root'), undefined)
})

test('command reply ignores a non-synthetic item', () => {
  const event = enqueuedEvent('Auto-compact threshold turned off.', { itemType: 'prompt' })

  assert.equal(commandReplyOf(event, 'ses_root'), undefined)
})

test('command reply tolerates malformed events', () => {
  const malformed = [
    null,
    undefined,
    'text',
    {},
    { type: 'session.inbox.enqueued' },
    { type: 'session.inbox.enqueued', data: { sessionID: 'ses_root' } },
    { type: 'session.inbox.enqueued', data: { sessionID: 'ses_root', item: { type: 'synthetic' } } },
    { type: 'session.inbox.enqueued', data: { sessionID: 'ses_root', item: { type: 'synthetic', payload: { text: 7 } } } },
  ]

  for (const event of malformed) {
    assert.equal(commandReplyOf(event, 'ses_root'), undefined)
  }
})
