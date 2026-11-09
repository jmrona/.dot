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
const waveTitles = atom({ plugin: 'waves', key: 'waveTitles' } as const, {} as Record<string, string>)

const TITLE_MODEL = 'haiku'
const TITLE_MAX_LENGTH = 60
const TASK_PROMPT_MAX_LENGTH = 2000
const TASK_TITLE_SYSTEM = 'Write a title of at most six words, in British English, for the task below. Reply with the title only.'
const WAVE_TITLE_SYSTEM =
  'Write a title of at most six words, in British English, that sums up these tasks. Reply with the title only.'
const waveRequestCounters = new Map<string, number>()

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
  if (isRunning(agent)) {
    return ' '
  }

  return FAILED.includes(agent.status) ? '!' : 'x'
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${Math.floor(totalSeconds / 60)}m ${seconds}s`
}

function describeHeader(number: number, wave: readonly WaveAgent[], title: string | undefined): string {
  const done = wave.filter(agent => !isRunning(agent)).length
  const mark = wave.some(isRunning) ? ' ' : 'x'
  const titlePart = title === undefined ? '' : `${title}   `

  return `[${mark}] Wave ${number}   ${titlePart}${done}/${wave.length} done`
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

function reopenAgent(agent: WaveAgent): WaveAgent {
  const { finishedAt: _finishedAt, ...rest } = agent

  return { ...rest, status: 'running' }
}

function recordSpawn(list: readonly WaveAgent[], record: WaveAgent, isResume: boolean): WaveAgent[] {
  const hasRow = list.some(agent => agent.agentId === record.agentId)
  if (!isResume || !hasRow) {
    return [...list, record]
  }

  return list.map(agent => (agent.agentId === record.agentId ? reopenAgent(agent) : agent))
}

function cleanTitle(text: string): string {
  const firstLine = text.split('\n').find(line => line.trim() !== '') ?? ''

  return firstLine
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .slice(0, TITLE_MAX_LENGTH)
}

async function requestTitle($: Engine, system: string, prompt: string): Promise<string | undefined> {
  const reply = await $.model.complete({
    model: TITLE_MODEL,
    effort: 'low',
    maxTokens: 256,
    timeoutMs: 15000,
    system,
    prompt,
  })
  const title = reply.isAnswered ? cleanTitle(reply.text) : ''

  return title === '' ? undefined : title
}

async function requestWaveTitle($: Engine, list: readonly WaveAgent[], waveKey: string): Promise<void> {
  const taskTitles = list.filter(agent => agent.waveKey === waveKey && agent.title !== undefined)
  const requestNumber = (waveRequestCounters.get(waveKey) ?? 0) + 1
  waveRequestCounters.set(waveKey, requestNumber)
  const title = await requestTitle($, WAVE_TITLE_SYSTEM, taskTitles.map(agent => agent.title).join('\n'))
  if (title !== undefined && waveRequestCounters.get(waveKey) === requestNumber) {
    await update($, waveTitles, titles => ({ ...titles, [waveKey]: title }))
  }
}

async function generateTitles($: Engine, record: WaveAgent, taskPrompt: string): Promise<void> {
  const prompt = `${record.description}\n\n${taskPrompt.slice(0, TASK_PROMPT_MAX_LENGTH)}`
  const title = await requestTitle($, TASK_TITLE_SYSTEM, prompt)
  if (title === undefined) {
    return
  }
  const stored = await update($, agents, list =>
    list.map(agent => (agent.agentId === record.agentId ? { ...agent, title } : agent)),
  )
  await requestWaveTitle($, stored, record.waveKey)
}

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
      await update($, waveTitles, () => ({}))
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
      const startedAt = await $.clock.now()
      const record: WaveAgent = {
        waveKey: waveKeyOf(e.workflow, currentStep),
        agentId: answer.agentId,
        description: e.description,
        model: answer.model || (e.model ?? e.parentModel),
        status: 'running',
        startedAt,
      }
      const isResume = e.resume !== undefined
      let isNewRow = true
      const recorded = await update($, agents, list => {
        isNewRow = !isResume || !list.some(agent => agent.agentId === record.agentId)

        return recordSpawn(list, record, isResume)
      })
      startPolling($)
      if (isNewRow) {
        void generateTitles($, record, e.prompt)
      }
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
    const titles = await read($, waveTitles)
    const now = await $.clock.now()

    return (
      <Box flexDirection="column">
        {waves.map((wave, index) => (
          <Box key={`wave-${index + 1}`} flexDirection="column">
            <Text>{describeHeader(index + 1, wave, titles[wave[0]?.waveKey ?? ''])}</Text>
            {wave.flatMap(agent => [
              <Text key={`${agent.agentId}-task`}>{`    [${markOf(agent)}] ${agent.title ?? agent.description}`}</Text>,
              <Text key={`${agent.agentId}-detail`}>{describeDetail(agent, now)}</Text>,
            ])}
          </Box>
        ))}
      </Box>
    )
  })
}
