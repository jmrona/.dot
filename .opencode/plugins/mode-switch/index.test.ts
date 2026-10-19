import assert from 'node:assert/strict'
import { test } from 'node:test'

import modeSwitchPlugin, {
  applySwitch,
  handleToolExecuteBefore,
  switchNotice,
  targetAgentForSkill,
  type ModeSwitchApi,
  type ModeSwitchModel,
  type ModeSwitchSession,
  type ToolExecuteBeforeInput,
} from './index.ts'

interface RecordedCall {
  readonly method: string
  readonly args: unknown
}

interface FakeApiOptions {
  readonly failures?: Readonly<Record<string, string>>
  readonly targetModel?: ModeSwitchModel
  readonly session?: ModeSwitchSession
}

interface FakeApi {
  readonly api: ModeSwitchApi
  readonly calls: RecordedCall[]
  readonly hooks: Map<string, (input: unknown) => Promise<void>>
}

const DEFAULT_MODEL: ModeSwitchModel = { id: 'hard', providerID: 'openai' }
const ROOT_SESSION: ModeSwitchSession = { id: 'session-1' }

function skillExecution(
  overrides: Partial<ToolExecuteBeforeInput> = {},
): ToolExecuteBeforeInput {
  return {
    tool: 'skill',
    sessionID: 'session-1',
    agent: 'build',
    messageID: 'message-1',
    id: 'call-1',
    input: { id: 'brainstorming' },
    ...overrides,
  }
}

function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const calls: RecordedCall[] = []
  const hooks = new Map<string, (input: unknown) => Promise<void>>()

  const record = async (method: string, args: unknown): Promise<void> => {
    calls.push({ method, args })
    const failureMessage = options.failures?.[method]
    if (failureMessage !== undefined) {
      throw new Error(failureMessage)
    }
  }

  const api: ModeSwitchApi = {
    session: {
      get: async (input) => {
        await record('session.get', input)
        return options.session ?? ROOT_SESSION
      },
      switchAgent: (input) => record('session.switchAgent', input),
      switchModel: (input) => record('session.switchModel', input),
      synthetic: (input) => record('session.synthetic', input),
    },
    agent: {
      get: async (input) => {
        await record('agent.get', input)
        return { data: { model: options.targetModel ?? DEFAULT_MODEL } }
      },
    },
    tool: {
      hook: async (name, handler) => {
        await record('tool.hook', { name })
        hooks.set(name, handler)
      },
    },
  }

  return { api, calls, hooks }
}

test('targetAgentForSkill sends every design skill to plan', () => {
  const designSkills: readonly string[] = [
    'brainstorming',
    'brainstorming-standard',
    'brainstorming-committee',
    'brainstorming-skip',
    'work-on-ticket',
  ]

  for (const skillId of designSkills) {
    assert.equal(targetAgentForSkill(skillId), 'plan', skillId)
  }
})

test('targetAgentForSkill sends both implementation skills to build', () => {
  const implementationSkills: readonly string[] = [
    'subagent-driven-development',
    'fast-path-implementation',
  ]

  for (const skillId of implementationSkills) {
    assert.equal(targetAgentForSkill(skillId), 'build', skillId)
  }
})

test('targetAgentForSkill leaves an unlisted skill without a target', () => {
  assert.equal(targetAgentForSkill('code-review'), undefined)
})

test('switchNotice formats the transition in upper case with its reason', () => {
  assert.equal(switchNotice('build', 'plan', 'brainstorming'), 'BUILD -> PLAN (brainstorming)')
})

test('applySwitch does nothing when the target matches the current agent', async () => {
  const { api, calls } = createFakeApi()

  await applySwitch(api, 'session-1', 'build', 'build', 'fast-path-implementation')

  assert.deepEqual(calls, [])
})

test('applySwitch switches agent, then the target agent model, then records the notice', async () => {
  const { api, calls } = createFakeApi()

  await applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchAgent', args: { sessionID: 'session-1', agent: 'plan' } },
    { method: 'session.switchModel', args: { sessionID: 'session-1', model: DEFAULT_MODEL } },
    {
      method: 'session.synthetic',
      args: { sessionID: 'session-1', text: 'BUILD -> PLAN (brainstorming)', resume: false },
    },
  ])
})

test('applySwitch records a failure notice instead of throwing when the switch fails', async () => {
  const { api, calls } = createFakeApi({ failures: { 'session.switchAgent': 'agent unavailable' } })

  await applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchAgent', args: { sessionID: 'session-1', agent: 'plan' } },
    {
      method: 'session.synthetic',
      args: {
        sessionID: 'session-1',
        text: 'Mode switch to PLAN failed: agent unavailable. Press Tab to switch manually.',
        resume: false,
      },
    },
  ])
})

test('applySwitch records a failure notice without switching when the target agent cannot be read', async () => {
  const { api, calls } = createFakeApi({ failures: { 'agent.get': 'agent missing' } })

  await applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
    {
      method: 'session.synthetic',
      args: {
        sessionID: 'session-1',
        text: 'Mode switch to PLAN failed: agent missing. Press Tab to switch manually.',
        resume: false,
      },
    },
  ])
})

test('applySwitch reports a model failure after a completed agent switch without the transition notice', async () => {
  const { api, calls } = createFakeApi({ failures: { 'session.switchModel': 'model rejected' } })

  await applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchAgent', args: { sessionID: 'session-1', agent: 'plan' } },
    { method: 'session.switchModel', args: { sessionID: 'session-1', model: DEFAULT_MODEL } },
    {
      method: 'session.synthetic',
      args: {
        sessionID: 'session-1',
        text: 'Switched to PLAN but its model could not be set: model rejected. Press Tab to switch manually.',
        resume: false,
      },
    },
  ])
})

test('applySwitch keeps a completed switch when only the notice fails to record', async () => {
  const { api, calls } = createFakeApi({ failures: { 'session.synthetic': 'notice rejected' } })

  await assert.doesNotReject(applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming'))

  assert.equal(calls.at(-1)?.method, 'session.synthetic')
})

test('applySwitch does not throw when the failure notice cannot be recorded either', async () => {
  const { api } = createFakeApi({
    failures: { 'session.switchAgent': 'agent unavailable', 'session.synthetic': 'notice rejected' },
  })

  await assert.doesNotReject(applySwitch(api, 'session-1', 'build', 'plan', 'brainstorming'))
})

test('handleToolExecuteBefore ignores tools other than skill', async () => {
  const { api, calls } = createFakeApi()

  await handleToolExecuteBefore(api, skillExecution({ tool: 'bash' }))

  assert.deepEqual(calls, [])
})

test('handleToolExecuteBefore makes no calls for a skill without a target', async () => {
  const { api, calls } = createFakeApi()

  await handleToolExecuteBefore(api, skillExecution({ input: { id: 'code-review' } }))

  assert.deepEqual(calls, [])
})

test('handleToolExecuteBefore records nothing when a root session is already on the target agent', async () => {
  const { api, calls } = createFakeApi()

  await handleToolExecuteBefore(api, skillExecution({ agent: 'plan' }))

  assert.deepEqual(calls, [{ method: 'session.get', args: { sessionID: 'session-1' } }])
})

test('handleToolExecuteBefore ignores child sessions', async () => {
  const childSession: ModeSwitchSession = { id: 'session-2', parentID: 'session-1' }
  const { api, calls } = createFakeApi({ session: childSession })

  await handleToolExecuteBefore(api, skillExecution({ sessionID: 'session-2' }))

  assert.deepEqual(calls, [
    { method: 'session.get', args: { sessionID: 'session-2' } },
  ])
})

test('handleToolExecuteBefore switches a root session when a design skill starts', async () => {
  const { api, calls } = createFakeApi()

  await handleToolExecuteBefore(api, skillExecution())

  assert.deepEqual(calls, [
    { method: 'session.get', args: { sessionID: 'session-1' } },
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchAgent', args: { sessionID: 'session-1', agent: 'plan' } },
    { method: 'session.switchModel', args: { sessionID: 'session-1', model: DEFAULT_MODEL } },
    {
      method: 'session.synthetic',
      args: { sessionID: 'session-1', text: 'BUILD -> PLAN (brainstorming)', resume: false },
    },
  ])
})

test('the default export carries the id and setup function the v2 loader requires', async () => {
  const { api, hooks } = createFakeApi()

  assert.equal(modeSwitchPlugin.id, 'mode-switch')
  await modeSwitchPlugin.setup(api)

  assert.equal(typeof hooks.get('execute.before'), 'function')
})

test('handleToolExecuteBefore does not throw when the session lookup fails', async () => {
  const { api, calls } = createFakeApi({ failures: { 'session.get': 'lookup failed' } })

  await assert.doesNotReject(handleToolExecuteBefore(api, skillExecution()))

  assert.deepEqual(calls, [{ method: 'session.get', args: { sessionID: 'session-1' } }])
})
