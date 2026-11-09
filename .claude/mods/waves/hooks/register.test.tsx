import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { AgentStatus } from '../types'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const PANE = {
  plugin: 'waves',
  component: 'Pane',
  requestId: 'waves',
  props: {
    title: 'Waves',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type Roster = { id: string; status: AgentStatus }[]
type World = {
  current: Roster
  listCalls: number
  opened: string[]
  closed: string[]
  openPanes: string[]
  resolvedModel?: string
  invalidated: string[]
  completions: CompletionRequest[]
  answerCompletion: (request: CompletionRequest) => Promise<Completion>
}

type Completion =
  | { isAnswered: true; text: string; usage: Usage }
  | { isAnswered: false; reason: 'api-error' | 'empty-reply' | 'aborted'; usage: Usage }
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
type CompletionRequest = { model: string; prompt: string; system?: string; effort?: string; maxTokens?: number; timeoutMs?: number }

const NO_USAGE: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function answered(text: string): Completion {
  return { isAnswered: true, text, usage: NO_USAGE }
}

function unanswered(): Completion {
  return { isAnswered: false, reason: 'empty-reply', usage: NO_USAGE }
}

function newWorld(roster: Roster = []): World {
  return {
    current: roster,
    listCalls: 0,
    opened: [],
    closed: [],
    openPanes: [],
    invalidated: [],
    completions: [],
    answerCompletion: async () => unanswered(),
  }
}

function stubWorld(on: On, roster: World = newWorld()) {
  const clock = mock.clock(on)
  let spawned = 0
  on('ui.open', (_, e) => {
    roster.opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('command.register', () => ({ value: { command: 'waves' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('ui.invalidate', (_, e) => {
    roster.invalidated.push(e.event)

    return { value: undefined }
  })
  on('ui.close', (_, e) => {
    roster.closed.push(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: roster.openPanes.map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('agent.list', () => {
    roster.listCalls += 1

    return {
      value: roster.current.map(agent => ({
        ...agent,
        description: '',
        type: 'general-purpose',
      })),
    }
  })
  on('agent.spawn', (_, e) => {
    spawned += 1

    return { model: roster.resolvedModel ?? e.model ?? e.parentModel, agentId: e.resume?.agentId ?? `agent-${spawned}` }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null }
  })
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', async (_, e) => {
    roster.completions.push(e)

    return { value: await roster.answerCompletion(e) }
  })

  return clock
}

async function takeStep($: Engine, index: number, agentId?: string): Promise<void> {
  const stream = $.turn.step({ turnId: 'turn-1', index, model: 'opus', messageCount: 1, agentId })
  let chunk = await stream.next()
  while (!chunk.done) {
    chunk = await stream.next()
  }
}

type SpawnOverrides = {
  model?: string
  parentAgentId?: string
  description?: string
  runId?: string
  resumeAgentId?: string
  prompt?: string
}

async function spawn($: Engine, overrides: SpawnOverrides = {}) {
  const { runId, resumeAgentId, ...rest } = overrides

  return $.agent.spawn({
    tool_use_id: 'toolu-1',
    prompt: 'Do the work.',
    description: 'work',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false,
    ...(runId === undefined ? {} : { workflow: { runId, agentIndex: 0 } }),
    ...(resumeAgentId === undefined ? {} : { resume: { agentId: resumeAgentId } }),
    ...rest,
  })
}

function completeTurn($: Engine, agentId: string, reason: 'answer' | 'error' | 'refusal' | 'aborted') {
  return $.turn.complete({
    answer: '',
    durationMs: 1,
    isAborted: reason === 'aborted',
    turnId: 'turn-1',
    agentId,
    reason,
  })
}

async function lineTexts($: Engine, surface: 'terminal' | 'desktop'): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface })
  const rows = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return rows.map(row => row.text ?? '')
}

async function headerTexts($: Engine, surface: 'terminal' | 'desktop'): Promise<string[]> {
  return (await lineTexts($, surface)).filter(line => /Wave \d/.test(line))
}

function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => {
    resolve = done
  })

  return { promise, resolve }
}

const SURFACES = ['terminal', 'desktop'] as const

test('workflow agents of one run spawned in different steps render under one wave', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1' })
  await takeStep($, 1)
  await spawn($, { runId: 'wf_1' })

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual([expect.stringContaining('Wave 1')])
  }
})

test('agent tool spawns made in different steps render as separate waves', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await takeStep($, 1)
  await spawn($)

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual([
      expect.stringContaining('Wave 1'),
      expect.stringContaining('Wave 2'),
    ])
  }
})

test('agent tool spawns made in one step render under one wave', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await spawn($)

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual([expect.stringContaining('0/2 done')])
  }
})

test('the tree renders the header, the task line and the model and time line', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { model: 'sonnet', description: 'Add parser tests' })

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toEqual([
      '[ ] Wave 1   0/1 done',
      '    [ ] Add parser tests',
      '        sonnet  0m 00s',
    ])
  }
})

test('a spawn made inside a subagent forms no wave and no task of its own', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await spawn($, { parentAgentId: 'agent-1', description: 'nested' })

  for (const surface of SURFACES) {
    const lines = await lineTexts($, surface)
    expect(lines.some(line => line.includes('nested'))).toBe(false)
    expect(await headerTexts($, surface)).toEqual([expect.stringContaining('Wave 1')])
  }
})

test('a step taken by a subagent does not start a new wave', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await takeStep($, 0, 'agent-1')
  await spawn($)

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual([expect.stringContaining('0/2 done')])
  }
})

test('the resolved model of the answer renders instead of an inherited label', async ($, on) => {
  const world = newWorld()
  world.resolvedModel = 'claude-opus-5-5'
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)

  for (const surface of SURFACES) {
    const lines = await lineTexts($, surface)
    expect(lines.some(line => line.includes('claude-opus-5-5'))).toBe(true)
    expect(lines.some(line => line.includes('inherits'))).toBe(false)
  }
})

test('turn complete with reason answer marks the task as done', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await completeTurn($, 'agent-1', 'answer')

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [x] Write it')
  }
})

test('turn complete with reason error marks the task as failed', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await completeTurn($, 'agent-1', 'error')

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [!] Write it')
  }
})

test('turn complete with reason aborted marks the task as killed', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await completeTurn($, 'agent-1', 'aborted')

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [!] Write it')
  }
})

test('turn complete with reason refusal marks the task as failed', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await completeTurn($, 'agent-1', 'refusal')

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [!] Write it')
  }
})

test('a workflow agent absent from the agent list still renders as running after a poll', async ($, on) => {
  const clock = stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await clock.advance(5000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Write it')
  }
})

test('a finished task renders the time between its spawn and its finish', async ($, on) => {
  const clock = stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', model: 'sonnet' })
  await clock.advance(72000)
  await completeTurn($, 'agent-1', 'answer')
  await clock.advance(30000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('        sonnet  1m 12s')
  }
})

test('a poll that moves an agent out of running freezes its elapsed time at the poll moment', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($, { model: 'sonnet' })
  await clock.advance(1000)
  roster.current = [{ id: 'agent-1', status: 'completed' }]
  await clock.advance(2000)
  await clock.advance(30000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('        sonnet  0m 03s')
  }
})

test('a poll tick with a running agent invalidates the pane render', async ($, on) => {
  const roster = newWorld([{ id: 'agent-1', status: 'running' }])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await clock.advance(3000)

  expect(roster.invalidated).toContain('ui.render')
})

test('a resumed agent reopens its existing row instead of adding a second one', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', model: 'sonnet', description: 'Write it' })
  await clock.advance(10000)
  await completeTurn($, 'agent-1', 'answer')
  await spawn($, { runId: 'wf_1', model: 'haiku', description: 'Write it again', resumeAgentId: 'agent-1' })
  await clock.advance(5000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toEqual([
      '[ ] Wave 1   0/1 done',
      '    [ ] Write it',
      '        sonnet  0m 15s',
    ])
  }
})

test('a resumed agent without an existing row is recorded as a new row', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it', resumeAgentId: 'agent-9' })

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Write it')
  }
})

test('a running task renders the time between its spawn and the render', async ($, on) => {
  const clock = stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', model: 'sonnet' })
  await clock.advance(8000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('        sonnet  0m 08s')
  }
})

function finishAllAgentsOfOneWave() {
  return [
    { id: 'agent-1', status: 'completed' },
    { id: 'agent-2', status: 'completed' },
  ] satisfies Roster
}

test('a wave whose agents all finished is checked', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = finishAllAgentsOfOneWave()
  await clock.advance(5000)

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual(['[x] Wave 1   2/2 done'])
  }
})

test('a failed agent renders as failed while its wave counts as done', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($, { description: 'first' })
  await spawn($, { description: 'second' })
  roster.current = [
    { id: 'agent-1', status: 'completed' },
    { id: 'agent-2', status: 'failed' },
  ]
  await clock.advance(5000)

  for (const surface of SURFACES) {
    const lines = await lineTexts($, surface)
    expect(lines).toContain('    [!] second')
    expect(lines).toContain('[x] Wave 1   2/2 done')
  }
})

test('polling stops once no agent is running', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  roster.current = [{ id: 'agent-1', status: 'completed' }]
  await clock.advance(10000)
  const callsWhenIdle = roster.listCalls
  await clock.advance(60000)

  expect(callsWhenIdle).toBeGreaterThan(0)
  expect(roster.listCalls).toBe(callsWhenIdle)
})

test('polling stops once the list no longer shows an agent', async ($, on) => {
  const roster = newWorld([{ id: 'agent-1', status: 'running' }])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await clock.advance(5000)
  roster.current = []
  await clock.advance(5000)
  const callsWhenAbsent = roster.listCalls
  await clock.advance(60000)

  expect(roster.listCalls).toBe(callsWhenAbsent)
})

test('an agent spawned outside a workflow counts as finished once the list no longer shows it', async ($, on) => {
  const roster = newWorld([{ id: 'agent-1', status: 'running' }])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($, { description: 'work' })
  await clock.advance(5000)
  roster.current = []
  await clock.advance(5000)

  for (const surface of SURFACES) {
    const lines = await lineTexts($, surface)
    expect(lines).toContain('    [x] work')
    expect(lines).toContain('[x] Wave 1   1/1 done')
  }
})

test('a failed agent that the list later drops still shows failed', async ($, on) => {
  const roster = newWorld([
    { id: 'agent-1', status: 'running' },
    { id: 'agent-2', status: 'running' },
  ])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($, { description: 'first' })
  await spawn($, { description: 'second' })
  roster.current = [
    { id: 'agent-1', status: 'failed' },
    { id: 'agent-2', status: 'running' },
  ]
  await clock.advance(3000)
  roster.current = [{ id: 'agent-2', status: 'running' }]
  await clock.advance(3000)

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [!] first')
  }
})

test('polling continues while an agent is running', async ($, on) => {
  const roster = newWorld([{ id: 'agent-1', status: 'running' }])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await clock.advance(10000)
  const callsAfterFirstWindow = roster.listCalls
  await clock.advance(10000)

  expect(roster.listCalls).toBeGreaterThan(callsAfterFirstWindow)
})

test('the pane opens once, on the first spawn', async ($, on) => {
  const world = newWorld()
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await spawn($)

  expect(world.opened).toEqual(['waves'])
})

function runWavesCommand($: Engine) {
  return $.command.run({
    command: 'waves',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

test('the waves command closes the pane when it is open', async ($, on) => {
  const world = newWorld()
  world.openPanes = ['waves']
  stubWorld(on, world)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const answer = await runWavesCommand($)

  expect(world.closed).toEqual(['waves'])
  expect(answer.text).toBe('Waves pane closed.')
})

test('the waves command opens the pane when it is closed', async ($, on) => {
  const world = newWorld()
  stubWorld(on, world)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const answer = await runWavesCommand($)

  expect(world.opened).toEqual(['waves'])
  expect(answer.text).toBe('Waves pane opened.')
})

test('clearing the conversation resets the list of waves', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toEqual([])
  }
})

test('a task line shows the description until its title arrives', async ($, on) => {
  const world = newWorld()
  const reply = deferred<Completion>()
  world.answerCompletion = () => reply.promise
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Add parser tests')
  }
})

test('a task line shows the title once the model answers', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async () => answered('Parser test coverage')
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Parser test coverage')
  }
})

test('the task title request uses model haiku and effort low', async ($, on) => {
  const world = newWorld()
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()

  expect(world.completions[0]).toMatchObject({ model: 'haiku', effort: 'low', maxTokens: 256, timeoutMs: 15000 })
})

test('the task title prompt holds the description and only the first 2000 characters of the spawn prompt', async ($, on) => {
  const world = newWorld()
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests', prompt: `${'a'.repeat(2000)}${'b'.repeat(50)}` })
  await settle()

  expect(world.completions[0]?.prompt).toBe(`Add parser tests\n\n${'a'.repeat(2000)}`)
})

test('a failed title reply keeps the description', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async () => unanswered()
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Add parser tests')
  }
})

test('the reply is cleaned to its first line without surrounding quotes', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async () => answered('\n  "Parser test coverage"  \nSecond line')
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Parser test coverage')
  }
})

test('a cleaned title is cut to 60 characters', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async () => answered('t'.repeat(80))
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain(`    [ ] ${'t'.repeat(60)}`)
  }
})

function isWaveRequest(request: CompletionRequest): boolean {
  return request.system?.includes('sums up these tasks') ?? false
}

test('the wave header shows the wave title once one is stored', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async request => answered(isWaveRequest(request) ? 'Parser work' : 'Task title')
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual(['[ ] Wave 1   Parser work   0/1 done'])
  }
})

test('the wave title is requested again when a later task title arrives, with both task titles in its prompt', async ($, on) => {
  const world = newWorld()
  let taskCount = 0
  world.answerCompletion = async request => {
    if (isWaveRequest(request)) {
      return answered('Wave title')
    }
    taskCount += 1

    return answered(`Task ${taskCount}`)
  }
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()
  await spawn($)
  await settle()

  const waveRequests = world.completions.filter(isWaveRequest)
  expect(waveRequests).toHaveLength(2)
  expect(waveRequests[1]?.prompt).toBe('Task 1\nTask 2')
})

test('a stale wave title reply that arrives after a newer one does not replace it', async ($, on) => {
  const world = newWorld()
  const waveReplies = [deferred<Completion>(), deferred<Completion>()]
  let waveCount = 0
  let taskCount = 0
  world.answerCompletion = request => {
    if (isWaveRequest(request)) {
      waveCount += 1

      return waveReplies[waveCount - 1]!.promise
    }
    taskCount += 1

    return Promise.resolve(answered(`Task ${taskCount}`))
  }
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()
  await spawn($)
  await settle()
  waveReplies[1]!.resolve(answered('Newer wave title'))
  await settle()
  waveReplies[0]!.resolve(answered('Stale wave title'))
  await settle()

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual(['[ ] Wave 1   Newer wave title   0/2 done'])
  }
})

test('a resumed agent makes no new title request', async ($, on) => {
  const world = newWorld()
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1' })
  await settle()
  const requestsBeforeResume = world.completions.length
  await spawn($, { runId: 'wf_1', resumeAgentId: 'agent-1' })
  await settle()

  expect(world.completions.length).toBe(requestsBeforeResume)
})

test('clearing the conversation empties the wave titles', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async request => answered(isWaveRequest(request) ? 'Parser work' : 'Task title')
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'first' })
  await settle()
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  world.answerCompletion = async () => unanswered()
  await takeStep($, 0)
  await spawn($, { description: 'second' })
  await settle()

  for (const surface of SURFACES) {
    const headers = await headerTexts($, surface)
    expect(headers.some(header => header.includes('Parser work'))).toBe(false)
  }
})

test('a task title reply that arrives after a clear starts no wave title request', async ($, on) => {
  const world = newWorld()
  const taskReply = deferred<Completion>()
  world.answerCompletion = request => (isWaveRequest(request) ? Promise.resolve(answered('Wave')) : taskReply.promise)
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  taskReply.resolve(answered('Late task title'))
  await settle()

  expect(world.completions.filter(isWaveRequest)).toHaveLength(0)
})

test('a wave title reply that arrives after a clear does not title a new wave with the same key', async ($, on) => {
  const world = newWorld()
  const oldWaveReply = deferred<Completion>()
  let taskCount = 0
  world.answerCompletion = request => {
    if (isWaveRequest(request)) {
      return oldWaveReply.promise
    }
    taskCount += 1

    return Promise.resolve(taskCount === 1 ? answered('Old task') : unanswered())
  }
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($)
  await settle()
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await takeStep($, 0)
  await spawn($)
  await settle()
  oldWaveReply.resolve(answered('Old wave title'))
  await settle()

  for (const surface of SURFACES) {
    expect(await headerTexts($, surface)).toEqual(['[ ] Wave 1   0/1 done'])
  }
})

test('a rejected title request keeps the description', async ($, on) => {
  const world = newWorld()
  world.answerCompletion = async () => {
    throw new Error('model blocked')
  }
  stubWorld(on, world)

  await takeStep($, 0)
  await spawn($, { description: 'Add parser tests' })
  await settle()

  for (const surface of SURFACES) {
    expect(await lineTexts($, surface)).toContain('    [ ] Add parser tests')
  }
})
