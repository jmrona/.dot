import { atom, read, update } from 'claude-code'
import type { Hook, Register, Timer } from 'claude-code'

import type { AgentStatus, WaveAgent } from '../types'

const PANE = 'waves'
const POLL_INTERVAL_MS = 3000

type Engine = Parameters<Hook<'agent.spawn'>>[0]

const agents = atom({ plugin: 'waves', key: 'agents' } as const, [] as WaveAgent[], {
  shape: 'agents-2',
})
const step = atom({ plugin: 'waves', key: 'step' } as const, 0)

const RUNNING: readonly AgentStatus[] = ['pending', 'running', 'waiting']
const FAILED: readonly AgentStatus[] = ['failed', 'killed']

function isRunning(agent: WaveAgent): boolean {
  return RUNNING.includes(agent.status)
}

function groupByWave(list: readonly WaveAgent[]): WaveAgent[][] {
  const keys = [...new Set(list.map(agent => agent.waveKey))]

  return keys.map(key => list.filter(agent => agent.waveKey === key))
}

function markOf(agent: WaveAgent): string {
  if (RUNNING.includes(agent.status)) {
    return ' '
  }

  return FAILED.includes(agent.status) ? '!' : 'x'
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${Math.floor(totalSeconds / 60)}m ${seconds}s`
}

function describeHeader(number: number, wave: readonly WaveAgent[]): string {
  const done = wave.filter(agent => !isRunning(agent)).length
  const mark = wave.some(isRunning) ? ' ' : 'x'

  return `[${mark}] Wave ${number}   ${done}/${wave.length} done`
}

function describeDetail(agent: WaveAgent, now: number): string {
  const end = isRunning(agent) ? now : (agent.finishedAt ?? now)

  return `        ${agent.model}  ${formatElapsed(end - agent.startedAt)}`
}

function waveKeyOf(workflow: { runId: string } | undefined, currentStep: number): string {
  const runId = workflow?.runId

  return runId === undefined || runId === '' ? `step:${currentStep}` : `run:${runId}`
}

function statusFromPoll(agent: WaveAgent, live: readonly { id: string; status: AgentStatus }[]): AgentStatus {
  const listed = live.find(one => one.id === agent.agentId)
  if (listed !== undefined) {
    return listed.status
  }

  return isRunning(agent) && agent.waveKey.startsWith('step:') ? 'completed' : agent.status
}

async function refreshStatuses($: Engine): Promise<boolean> {
  const live = await $.agent.list()
  const now = await $.clock.now()
  const updated = await update($, agents, list =>
    list.map(agent => {
      const status = statusFromPoll(agent, live)
      const hasLeftRunning = isRunning(agent) && !RUNNING.includes(status)

      return {
        ...agent,
        status,
        finishedAt: hasLeftRunning ? (agent.finishedAt ?? now) : agent.finishedAt,
      }
    }),
  )

  return updated.some(isRunning)
}

const FINAL_STATUS = {
  answer: 'completed',
  error: 'failed',
  refusal: 'failed',
  aborted: 'killed',
} as const satisfies Record<'answer' | 'error' | 'refusal' | 'aborted', AgentStatus>

const polling: { timer: Timer | null } = { timer: null }

function stopPolling(): void {
  polling.timer?.cancel()
  polling.timer = null
}

function startPolling($: Engine): void {
  polling.timer ??= $.clock.every(POLL_INTERVAL_MS, () => {
    void refreshStatuses($).then(isAnyRunning => {
      if (isAnyRunning) {
        $.ui.invalidate('ui.render')
      } else {
        stopPolling()
      }
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'waves', description: 'Toggle the pane that shows subagent waves' })

    return next(e)
  })

  on('command.run', { command: 'waves' }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })

      return { text: 'Waves pane closed.' }
    }
    await $.ui.open({ id: PANE, title: 'Waves' })

    return { text: 'Waves pane opened.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      stopPolling()
      await update($, agents, () => [])
      await update($, step, () => 0)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, step, count => count + 1)
    }

    return yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.parentAgentId !== undefined) {
      return next(e)
    }
    const currentStep = await read($, step)
    const answer = await next(e)
    if (answer.agentId !== undefined) {
      const record: WaveAgent = {
        waveKey: waveKeyOf(e.workflow, currentStep),
        agentId: answer.agentId,
        description: e.description,
        model: answer.model || (e.model ?? e.parentModel),
        status: 'running',
        startedAt: await $.clock.now(),
      }
      const recorded = await update($, agents, list => [...list, record])
      startPolling($)
      if (recorded.length === 1) {
        await $.ui.open({ id: PANE, title: 'Waves' })
      }
    }

    return answer
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const finishedAt = await $.clock.now()
      await update($, agents, list =>
        list.map(agent =>
          agent.agentId === e.agentId ? { ...agent, status: FINAL_STATUS[e.reason], finishedAt } : agent,
        ),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const waves = groupByWave(await read($, agents))
    const now = await $.clock.now()

    return (
      <Box flexDirection="column">
        {waves.map((wave, index) => (
          <Box key={`wave-${index + 1}`} flexDirection="column">
            <Text>{describeHeader(index + 1, wave)}</Text>
            {wave.flatMap(agent => [
              <Text key={`${agent.agentId}-task`}>{`    [${markOf(agent)}] ${agent.description}`}</Text>,
              <Text key={`${agent.agentId}-detail`}>{describeDetail(agent, now)}</Text>,
            ])}
          </Box>
        ))}
      </Box>
    )
  })
}
