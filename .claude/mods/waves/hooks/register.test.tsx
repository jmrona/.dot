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
type World = { current: Roster; listCalls: number; opened: string[]; closed: string[]; openPanes: string[] }

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

    return { model: e.model ?? e.parentModel, agentId: `agent-${spawned}` }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null }
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

async function spawn($: Engine, overrides: { model?: string; parentAgentId?: string } = {}) {
  return $.agent.spawn({
    tool_use_id: 'toolu-1',
    prompt: 'Do the work.',
    description: 'work',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false,
    ...overrides,
  })
}

test('spawns made in one step form one wave', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await spawn($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = await ui.findAll({ type: 'Text', text: /Wave/ })
    expect(rows.map(row => row.text)).toEqual([expect.stringContaining('Wave 1')])
    expect(rows[0]?.text).toContain('2 agentes')
    await ui.unmount()
  }
})

test('spawns made in two steps form two waves', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await takeStep($, 1)
  await spawn($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = await ui.findAll({ type: 'Text', text: /Wave/ })
    expect(rows.map(row => row.text)).toEqual([
      expect.stringContaining('Wave 1'),
      expect.stringContaining('Wave 2'),
    ])
    await ui.unmount()
  }
})

test('a spawn made inside a subagent forms no wave of its own', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await spawn($, { parentAgentId: 'agent-1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await rowTexts($, surface)).toEqual([expect.stringContaining('Wave 1')])
  }
})

test('a spawn made inside a subagent does not count in the wave of its parent', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await spawn($, { parentAgentId: 'agent-1' })

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toMatch(/\b1 agente\b(?!s)/)
  }
})

test('a step taken by a subagent does not start a new wave', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)
  await takeStep($, 0, 'agent-1')
  await spawn($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const rows = await rowTexts($, surface)
    expect(rows).toEqual([expect.stringContaining('Wave 1')])
    expect(rows[0]).toContain('2 agentes')
  }
})

async function rowTexts($: Engine, surface: 'terminal' | 'desktop'): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface })
  const rows = await ui.findAll({ type: 'Text', text: /Wave/ })
  await ui.unmount()

  return rows.map(row => row.text ?? '')
}

test('an agent with an explicit model shows that model', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($, { model: 'sonnet' })
  await spawn($, { model: 'sonnet' })

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('sonnet x2')
  }
})

test('an agent with no model shows the parent model it inherits', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('hereda opus x1')
  }
})

test('a running agent shows the wave as in progress and unchecked', async ($, on) => {
  stubWorld(on)

  await takeStep($, 0)
  await spawn($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const row = (await rowTexts($, surface))[0]
    expect(row).toContain('[ ] Wave 1')
    expect(row).toContain('1 en curso')
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

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('[x] Wave 1')
  }
})

test('a wave whose agents all finished shows terminada', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = finishAllAgentsOfOneWave()
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('terminada')
  }
})

test('a failed agent shows fallido in the summary', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = [
    { id: 'agent-1', status: 'completed' },
    { id: 'agent-2', status: 'failed' },
  ]
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toMatch(/1 fallido\b(?!s)/)
  }
})

test('two failed agents show fallidos in the summary', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = [
    { id: 'agent-1', status: 'failed' },
    { id: 'agent-2', status: 'killed' },
  ]
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('2 fallidos')
  }
})

test('a wave whose agents all ended and one failed is checked', async ($, on) => {
  const roster = newWorld()
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = [
    { id: 'agent-1', status: 'completed' },
    { id: 'agent-2', status: 'failed' },
  ]
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('[x] Wave 1')
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

test('an agent that the list no longer shows counts as finished', async ($, on) => {
  const roster = newWorld([{ id: 'agent-1', status: 'running' }])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await clock.advance(5000)
  roster.current = []
  await clock.advance(5000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toContain('[x] Wave 1')
  }
})

test('a failed agent that the list later drops still shows fallido', async ($, on) => {
  const roster = newWorld([
    { id: 'agent-1', status: 'running' },
    { id: 'agent-2', status: 'running' },
  ])
  const clock = stubWorld(on, roster)

  await takeStep($, 0)
  await spawn($)
  await spawn($)
  roster.current = [
    { id: 'agent-1', status: 'failed' },
    { id: 'agent-2', status: 'running' },
  ]
  await clock.advance(3000)
  roster.current = [{ id: 'agent-2', status: 'running' }]
  await clock.advance(3000)

  for (const surface of ['terminal', 'desktop'] as const) {
    expect((await rowTexts($, surface))[0]).toMatch(/1 fallido\b(?!s)/)
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

  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await rowTexts($, surface)).toEqual([])
  }
})
