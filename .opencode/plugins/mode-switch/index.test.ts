import assert from 'node:assert/strict'
import { test } from 'node:test'

import modeSwitchPlugin, {
  applySwitch,
  handleToolExecuteBefore,
  switchNotice,
  targetAgentForSkill,
  type ContextEvent,
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
      hook: async (name, handler) => {
        await record('session.hook', { name })
        hooks.set(name, async (event) => handler(event as ContextEvent))
      },
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

test('applySwitch sets the target agent model when the session already runs that agent', async () => {
  const { api, calls } = createFakeApi()

  await applySwitch(api, 'session-1', 'plan', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchModel', args: { sessionID: 'session-1', model: DEFAULT_MODEL } },
  ])
})

test('applySwitch neither switches agent nor records a notice when the session already runs that agent', async () => {
  const { api, calls } = createFakeApi()

  await applySwitch(api, 'session-1', 'plan', 'plan', 'brainstorming')

  const agentOrNoticeCalls = calls.filter(
    ({ method }) => method === 'session.switchAgent' || method === 'session.synthetic',
  )
  assert.deepEqual(agentOrNoticeCalls, [])
})

test('applySwitch records a model failure notice when the session already runs that agent and its model cannot be set', async () => {
  const { api, calls } = createFakeApi({ failures: { 'session.switchModel': 'model rejected' } })

  await applySwitch(api, 'session-1', 'plan', 'plan', 'brainstorming')

  assert.deepEqual(calls, [
    { method: 'agent.get', args: { agentID: 'plan' } },
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

test('applySwitch records a failure notice when the session already runs that agent and its agent cannot be read', async () => {
  const { api, calls } = createFakeApi({ failures: { 'agent.get': 'agent missing' } })

  await applySwitch(api, 'session-1', 'plan', 'plan', 'brainstorming')

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

test('handleToolExecuteBefore sets the model without a notice when a root session is already on the target agent', async () => {
  const { api, calls } = createFakeApi()

  await handleToolExecuteBefore(api, skillExecution({ agent: 'plan' }))

  assert.deepEqual(calls, [
    { method: 'session.get', args: { sessionID: 'session-1' } },
    { method: 'agent.get', args: { agentID: 'plan' } },
    { method: 'session.switchModel', args: { sessionID: 'session-1', model: DEFAULT_MODEL } },
  ])
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

const DESIGN_ROOT_TEXT =
  'You are the design root on openai/hard. You author design content yourself: design questions, alternatives, sections, the committee agenda, summaries and design revisions. Do not delegate them to stack-planner.'

async function runContextHook(
  options: FakeApiOptions,
  agent: string,
): Promise<{ event: ContextEvent; calls: RecordedCall[] }> {
  const { api, hooks, calls } = createFakeApi(options)
  await modeSwitchPlugin.setup(api)
  const event: ContextEvent = { agent, sessionID: 'session-1', system: [] }
  await hooks.get('context')?.(event)
  return { event, calls }
}

test('the context hook appends the design root instruction for a root plan session', async () => {
  const { event } = await runContextHook({}, 'plan')

  assert.deepEqual(event.system, [{ type: 'text', text: DESIGN_ROOT_TEXT }])
})

test('the context hook appends nothing for a non-plan agent', async () => {
  const { event } = await runContextHook({}, 'build')

  assert.deepEqual(event.system, [])
})

test('the context hook appends nothing for a child plan session', async () => {
  const { event } = await runContextHook(
    { session: { id: 'session-1', parentID: 'session-0' } },
    'plan',
  )

  assert.deepEqual(event.system, [])
})

test('the context hook appends nothing when the session lookup fails', async () => {
  const { event } = await runContextHook({ failures: { 'session.get': 'lookup failed' } }, 'plan')

  assert.deepEqual(event.system, [])
})
