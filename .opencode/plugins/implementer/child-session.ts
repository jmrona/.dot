import type { SlotSemaphore } from '../rate-guard/semaphore.ts'

export interface ContextMessage {
  readonly type: string
  readonly content?: readonly { readonly type: string; readonly text?: string }[]
}

export interface ChildSessionApi {
  readonly session: {
    create(input: {
      parentID: string
      agent: string
      model: { providerID: string; id: string }
    }): Promise<{ id: string }>
    prompt(input: { sessionID: string; text: string }): Promise<unknown>
    wait(input: { sessionID: string }): Promise<unknown>
    context(input: { sessionID: string }): Promise<readonly ContextMessage[]>
    interrupt(input: { sessionID: string }): Promise<unknown>
  }
}

export interface ChildRunSpec {
  readonly parentID: string
  readonly agent: string
  readonly model: string
  readonly text: string
  readonly requiredFields: readonly string[]
  readonly slotKey: string
  readonly signal?: AbortSignal
}

export type ChildRunResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>>; readonly sessionID: string }
  | { readonly ok: false; readonly reason: string; readonly sessionID?: string }

export interface ChildSessionRunner {
  run(spec: ChildRunSpec): Promise<ChildRunResult>
}

export interface ChildSessionDependencies {
  readonly api: ChildSessionApi
  readonly semaphore: SlotSemaphore
  readonly hardModel: string
  readonly timeoutSeconds: number
}

type WaitOutcome = 'finished' | 'timeout' | 'aborted'

const FENCED_JSON_BLOCK = /```json\s*\n([\s\S]*?)```/g
const CANCELLED: ChildRunResult = { ok: false, reason: 'cancelled' }

export function extractLastJsonBlock(text: string): unknown {
  const lastBlock = [...text.matchAll(FENCED_JSON_BLOCK)].at(-1)
  if (!lastBlock) return undefined
  try {
    return JSON.parse(lastBlock[1])
  } catch {
    return undefined
  }
}

function parseModel(model: string): { providerID: string; id: string } | undefined {
  const separator = model.indexOf('/')
  if (separator < 0) return undefined
  return { providerID: model.slice(0, separator), id: model.slice(separator + 1) }
}

function failure(reason: string, sessionID?: string): ChildRunResult {
  return sessionID === undefined ? { ok: false, reason } : { ok: false, reason, sessionID }
}

function sessionError(error: unknown, sessionID?: string): ChildRunResult {
  const message = error instanceof Error ? error.message : String(error)
  return failure(`session-error: ${message}`, sessionID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function lastAssistantText(messages: readonly ContextMessage[]): string {
  const assistant = messages.filter((message) => message.type === 'assistant').at(-1)
  const parts = assistant?.content ?? []
  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

function parseReport(
  messages: readonly ContextMessage[],
  requiredFields: readonly string[],
): Record<string, unknown> | undefined {
  const report = extractLastJsonBlock(lastAssistantText(messages))
  if (!isRecord(report)) return undefined
  return requiredFields.every((field) => field in report) ? report : undefined
}

function raceWait(
  api: ChildSessionApi,
  sessionID: string,
  timeoutSeconds: number,
  signal?: AbortSignal,
): Promise<WaitOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  return new Promise<WaitOutcome>((resolve, reject) => {
    timer = setTimeout(() => resolve('timeout'), timeoutSeconds * 1000)
    onAbort = () => resolve('aborted')
    signal?.addEventListener('abort', onAbort, { once: true })
    api.session.wait({ sessionID }).then(() => resolve('finished'), reject)
  }).finally(() => {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  })
}

async function readReport(api: ChildSessionApi, sessionID: string, spec: ChildRunSpec): Promise<ChildRunResult> {
  const report = parseReport(await api.session.context({ sessionID }), spec.requiredFields)
  return report ? { ok: true, value: report, sessionID } : failure('invalid-report', sessionID)
}

async function runChild(
  dependencies: ChildSessionDependencies,
  spec: ChildRunSpec,
  model: { providerID: string; id: string },
): Promise<ChildRunResult> {
  const { api, timeoutSeconds } = dependencies
  let sessionID: string | undefined
  try {
    sessionID = (await api.session.create({ parentID: spec.parentID, agent: spec.agent, model })).id
    await api.session.prompt({ sessionID, text: spec.text })
    const outcome = await raceWait(api, sessionID, timeoutSeconds, spec.signal)
    if (outcome === 'finished') return await readReport(api, sessionID, spec)
    await api.session.interrupt({ sessionID })
    return failure(outcome === 'timeout' ? 'child-timeout' : 'cancelled', sessionID)
  } catch (error) {
    return sessionError(error, sessionID)
  }
}

async function runWithSlot(dependencies: ChildSessionDependencies, spec: ChildRunSpec): Promise<ChildRunResult> {
  const model = parseModel(spec.model)
  if (!model) return failure(`session-error: model must be provider/id, got ${spec.model}`)
  return runChild(dependencies, spec, model)
}

export function createChildSessionRunner(dependencies: ChildSessionDependencies): ChildSessionRunner {
  const { semaphore, hardModel } = dependencies
  return {
    async run(spec) {
      if (spec.signal?.aborted) return CANCELLED
      const needsSlot = spec.model === hardModel
      if (needsSlot && !(await semaphore.acquire(spec.parentID, spec.slotKey))) {
        return failure('session-error: no hard slot')
      }
      try {
        return await runWithSlot(dependencies, spec)
      } finally {
        if (needsSlot) semaphore.release()
      }
    },
  }
}
