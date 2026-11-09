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
}

function newWorld(roster: Roster = []): World {
  return { current: roster, listCalls: 0, opened: [], closed: [], openPanes: [] }
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

    return { model: roster.resolvedModel ?? e.model ?? e.parentModel, agentId: `agent-${spawned}` }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null }
  })
  on('turn.complete', () => ({ text: '' }))

  return clock
}

async function takeStep($: Engine, index: number, agentId?: string): Promise<void> {
  const stream = $.turn.step({ turnId: 'turn-1', index, model: 'opus', messageCount: 1, agentId })
  let chunk = await stream.next()
  while (!chunk.done) {
    chunk = await stream.next()
  }
}

type SpawnOverrides = { model?: string; parentAgentId?: string; description?: string; runId?: string }

async function spawn($: Engine, overrides: SpawnOverrides = {}) {
  const { runId, ...rest } = overrides

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
    ...rest,
  })
}

function completeTurn($: Engine, agentId: string, reason: 'answer' | 'error' | 'aborted') {
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

test('turn complete with reason aborted marks the task as failed', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { runId: 'wf_1', description: 'Write it' })
  await completeTurn($, 'agent-1', 'aborted')

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

test('an agent tool agent that the list no longer shows counts as finished', async ($, on) => {
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
