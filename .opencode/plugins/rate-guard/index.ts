import { fileURLToPath } from 'node:url'

import { loadHardLimit } from './config.ts'
import type { OpencodeEvent } from './event-kind.ts'
import {
  createLimitCommand,
  LIMIT_COMMAND_DESCRIPTION,
  type LimitInvocation,
} from './limit-command.ts'
import { applyRateLimitDecision, type RetryEvent } from './retry-delay.ts'
import { createSlotSemaphore } from './semaphore.ts'
import { createSlotTracker, type SubagentCall } from './slot-tracker.ts'

export interface RateGuardApi {
  readonly session: {
    get(input: { sessionID: string }): Promise<unknown>
    synthetic(input: { sessionID: string; text: string; resume: boolean }): Promise<unknown>
    hook(name: 'retry', handler: (event: RetryEvent) => Promise<void>): Promise<void>
  }
  readonly tool: {
    hook(
      name: 'execute.before' | 'execute.after',
      handler: (call: SubagentCall) => Promise<void>,
    ): Promise<void>
  }
  readonly agent: {
    get(input: { agentID: string }): Promise<{
      data?: { model?: { id?: string; providerID?: string } }
    }>
  }
  readonly event: {
    subscribe(input: { signal: AbortSignal }): AsyncIterable<OpencodeEvent>
  }
  readonly command: {
    transform(
      fn: (draft: {
        add(command: {
          name: string
          description: string
          execute(invocation: LimitInvocation): Promise<void>
        }): void
      }) => void,
    ): unknown
  }
}

export interface RateGuardOptions {
  readonly configPath: string
  readonly warn: (message: string) => void
  readonly random: () => number
}

export async function setupRateGuard(api: RateGuardApi, options: RateGuardOptions): Promise<void> {
  const limit = await loadHardLimit(options.configPath, options.warn)
  const semaphore = createSlotSemaphore(limit, (sessionID) => sessionExists(api, sessionID))
  const tracker = createSlotTracker({
    semaphore,
    isHardAgent: (agentID) => isHardAgent(api, agentID),
  })
  await api.session.hook('retry', async (event) => applyRateLimitDecision(event, options.random))
  await api.tool.hook('execute.before', (call) => tracker.beforeExecute(call))
  await api.tool.hook('execute.after', (call) => tracker.afterExecute(call))
  void forwardEvents(api, tracker.handleEvent, options.warn)
  const execute = createLimitCommand({
    semaphore,
    configPath: options.configPath,
    notify: (sessionID, text) => notify(api, sessionID, text),
  })
  api.command.transform((draft) =>
    draft.add({ name: 'hard-limit', description: LIMIT_COMMAND_DESCRIPTION, execute }),
  )
}

async function isHardAgent(api: RateGuardApi, agentID: string): Promise<boolean> {
  const model = (await api.agent.get({ agentID })).data?.model
  return model?.id === 'hard' && model.providerID === 'openai'
}

async function sessionExists(api: RateGuardApi, sessionID: string): Promise<boolean> {
  const session = await api.session.get({ sessionID })
  return session !== undefined && session !== null
}

async function forwardEvents(
  api: RateGuardApi,
  handleEvent: (event: OpencodeEvent) => void,
  warn: (message: string) => void,
): Promise<void> {
  let reason = 'the stream ended'
  try {
    for await (const event of api.event.subscribe({ signal: new AbortController().signal })) {
      handleEvent(event)
    }
  } catch (error: unknown) {
    reason = error instanceof Error ? error.message : String(error)
  }
  warn(
    `rate-guard: the event stream stopped (${reason}). ` +
      'Restart opencode to release hard subagent slots.',
  )
}

async function notify(api: RateGuardApi, sessionID: string, text: string): Promise<void> {
  try {
    await api.session.synthetic({ sessionID, text, resume: false })
  } catch {
    return
  }
}

interface RateGuardPlugin {
  readonly id: string
  readonly setup: (api: RateGuardApi) => Promise<void>
}

const rateGuardPlugin: RateGuardPlugin = {
  id: 'rate-guard',
  setup: (api) =>
    setupRateGuard(api, {
      configPath: fileURLToPath(new URL('./config.json', import.meta.url)),
      warn: console.warn,
      random: Math.random,
    }),
}

export default rateGuardPlugin
