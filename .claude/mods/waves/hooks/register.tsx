import { atom, read, update } from 'claude-code'
import type { Hook, Register, Timer } from 'claude-code'

import type { AgentStatus, WaveAgent } from '../types'

const PANE = 'waves'
const POLL_INTERVAL_MS = 3000

type Engine = Parameters<Hook<'agent.spawn'>>[0]

const agents = atom({ plugin: 'waves', key: 'agents' } as const, [] as WaveAgent[], {
  shape: 'agents-1',
})
const step = atom({ plugin: 'waves', key: 'step' } as const, 0)

function groupByStep(list: readonly WaveAgent[]): WaveAgent[][] {
  const steps = [...new Set(list.map(agent => agent.step))].sort((a, b) => a - b)

  return steps.map(one => list.filter(agent => agent.step === one))
}

function summariseModels(wave: readonly WaveAgent[]): string {
  const counts = new Map<string, number>()
  for (const agent of wave) {
    counts.set(agent.model, (counts.get(agent.model) ?? 0) + 1)
  }

  return [...counts].map(([model, count]) => `${model} x${count}`).join(', ')
}

const RUNNING: readonly AgentStatus[] = ['pending', 'running', 'waiting']
const FAILED: readonly AgentStatus[] = ['failed', 'killed']

function countWhere(wave: readonly WaveAgent[], statuses: readonly AgentStatus[]): number {
  return wave.filter(agent => statuses.includes(agent.status)).length
}

function summariseProgress(wave: readonly WaveAgent[]): string {
  const running = countWhere(wave, RUNNING)
  const failed = countWhere(wave, FAILED)
  if (running === 0 && failed === 0) {
    return 'finished'
  }
  const finishedWell = wave.length - running - failed
  const parts = [
    running > 0 ? `${running} running` : '',
    finishedWell > 0 ? `${finishedWell} OK` : '',
    failed > 0 ? `${failed} failed` : '',
  ]

  return parts.filter(part => part !== '').join(', ')
}

function isRunning(agent: WaveAgent): boolean {
  return RUNNING.includes(agent.status)
}

function statusWhenAbsentFromList(agent: WaveAgent): AgentStatus {
  return isRunning(agent) ? 'completed' : agent.status
}

async function refreshStatuses($: Engine): Promise<boolean> {
  const live = await $.agent.list()
  const updated = await update($, agents, list =>
    list.map(agent => ({
      ...agent,
      status: live.find(one => one.id === agent.agentId)?.status ?? statusWhenAbsentFromList(agent),
    })),
  )

  return updated.some(isRunning)
}

function describeWave(number: number, wave: readonly WaveAgent[]): string {
  const mark = wave.some(isRunning) ? ' ' : 'x'

  return `[${mark}] Wave ${number}   ${wave.length} ${wave.length === 1 ? 'agent' : 'agents'}  ${summariseProgress(wave)}  ${summariseModels(wave)}`
}

const polling: { timer: Timer | null } = { timer: null }

function stopPolling(): void {
  polling.timer?.cancel()
  polling.timer = null
}

function startPolling($: Engine): void {
  polling.timer ??= $.clock.every(POLL_INTERVAL_MS, () => {
    void refreshStatuses($).then(isAnyRunning => {
      if (!isAnyRunning) {
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
        step: currentStep,
        agentId: answer.agentId,
        subagentType: e.subagentType,
        model: e.model ?? `inherits ${e.parentModel}`,
        status: 'running',
      }
      const recorded = await update($, agents, list => [...list, record])
      startPolling($)
      if (recorded.length === 1) {
        await $.ui.open({ id: PANE, title: 'Waves' })
      }
    }

    return answer
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const waves = groupByStep(await read($, agents))

    return (
      <Box flexDirection="column">
        {waves.map((wave, index) => (
          <Text key={`wave-${index + 1}`}>{describeWave(index + 1, wave)}</Text>
        ))}
      </Box>
    )
  })
}
