import type { AutoCompactApi, AutoCompactEvent } from './index.ts'
import {
  type ModelLimit,
  type StepTokens,
  contextTokensOf,
  inputLimitOf,
} from './context-usage.ts'

interface ModelReference {
  readonly id: string
  readonly providerID: string
}

interface ModelEntry extends ModelReference {
  readonly limit: ModelLimit
}

type ThresholdEventData = AutoCompactEvent['data'] & {
  readonly model?: ModelReference
  readonly tokens?: StepTokens
}

export interface ThresholdEvent extends AutoCompactEvent {
  readonly data: ThresholdEventData
}

export interface ThresholdApi extends AutoCompactApi {
  readonly model: {
    list(input: object): Promise<{ readonly data: readonly ModelEntry[] }>
  }
  readonly event: {
    subscribe(input: { signal: AbortSignal }): AsyncIterable<ThresholdEvent>
  }
}

export interface ThresholdDependencies {
  readonly api: ThresholdApi
  readonly autoCompact: {
    startThresholdCompaction(api: ThresholdApi, sessionID: string, percent: number): Promise<boolean>
    isCompactionInFlight(sessionID: string): boolean
  }
  readonly percent: number | null
  readonly log: (message: string) => void
  readonly onGiveUp: () => Promise<void>
}

type StreamEnding =
  | { readonly kind: 'ended' }
  | { readonly kind: 'failed'; readonly error: unknown }

interface ThresholdHolder {
  percent: number | null
}

interface WatcherContext extends Omit<ThresholdDependencies, 'percent'> {
  readonly threshold: ThresholdHolder
  readonly signal: AbortSignal
  readonly modelBySession: Map<string, ModelReference>
  readonly disarmedSessions: Set<string>
  readonly rootBySession: Map<string, boolean>
}

export interface ThresholdWatcher {
  stop(): void
  setPercent(percent: number | null): void
  isRunning(): boolean
}

export function startThresholdWatcher(deps: ThresholdDependencies): ThresholdWatcher {
  const controller = new AbortController()
  const context: WatcherContext = {
    api: deps.api,
    autoCompact: deps.autoCompact,
    log: deps.log,
    onGiveUp: deps.onGiveUp,
    threshold: { percent: deps.percent },
    signal: controller.signal,
    modelBySession: new Map<string, ModelReference>(),
    disarmedSessions: new Set<string>(),
    rootBySession: new Map<string, boolean>(),
  }
  let isWatching = true
  void watchWithOneRetry(context).finally(() => {
    isWatching = false
  })
  return {
    stop: () => controller.abort(),
    setPercent: (percent) => {
      context.threshold.percent = percent
    },
    isRunning: () => isWatching && !controller.signal.aborted,
  }
}

async function watchWithOneRetry(context: WatcherContext): Promise<void> {
  const firstEnding = await consumeStream(context)
  if (context.signal.aborted) {
    return
  }
  context.log(retryNotice(firstEnding))
  const secondEnding = await consumeStream(context)
  if (context.signal.aborted) {
    return
  }
  context.log(giveUpNotice(secondEnding))
  await context.onGiveUp()
}

function retryNotice(ending: StreamEnding): string {
  return `auto-compact: the threshold watcher stream ${describeEnding(ending, '')}. Resubscribing once.`
}

function giveUpNotice(ending: StreamEnding): string {
  return `auto-compact: the threshold watcher stream ${describeEnding(ending, ' again')}. The token threshold is inactive until opencode restarts or /auto-compact sets it again.`
}

function describeEnding(ending: StreamEnding, suffix: string): string {
  return ending.kind === 'ended'
    ? `ended${suffix}`
    : `failed${suffix} (${errorMessage(ending.error)})`
}

async function consumeStream(context: WatcherContext): Promise<StreamEnding> {
  try {
    for await (const event of context.api.event.subscribe({ signal: context.signal })) {
      await handleEventSafely(context, event)
    }
    return { kind: 'ended' }
  } catch (error: unknown) {
    return { kind: 'failed', error }
  }
}

async function handleEventSafely(context: WatcherContext, event: ThresholdEvent): Promise<void> {
  try {
    await handleEvent(context, event)
  } catch (error: unknown) {
    context.log(
      `auto-compact: the threshold watcher skipped a ${event.type} event (${errorMessage(error)}).`,
    )
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleEvent(context: WatcherContext, event: ThresholdEvent): Promise<void> {
  const { sessionID, model, tokens } = event.data
  if (event.type === 'session.step.started' && model !== undefined) {
    context.modelBySession.set(sessionID, { id: model.id, providerID: model.providerID })
  } else if (event.type === 'session.step.ended' && tokens !== undefined) {
    await handleStepEnded(context, sessionID, tokens)
  } else if (event.type === 'session.deleted') {
    context.modelBySession.delete(sessionID)
    context.disarmedSessions.delete(sessionID)
    context.rootBySession.delete(sessionID)
  }
}

async function handleStepEnded(
  context: WatcherContext,
  sessionID: string,
  tokens: StepTokens,
): Promise<void> {
  if (context.autoCompact.isCompactionInFlight(sessionID) || !(await isRoot(context, sessionID))) {
    return
  }
  const limit = await inputLimitForSession(context, sessionID)
  const percent = context.threshold.percent
  if (limit === undefined || percent === null) {
    return
  }
  if (contextTokensOf(tokens) < (limit * percent) / 100) {
    context.disarmedSessions.delete(sessionID)
    return
  }
  if (!context.disarmedSessions.has(sessionID)) {
    await compactAndDisarm(context, sessionID, percent)
  }
}

async function compactAndDisarm(
  context: WatcherContext,
  sessionID: string,
  percent: number,
): Promise<void> {
  const started = await context.autoCompact.startThresholdCompaction(
    context.api,
    sessionID,
    percent,
  )
  if (started) {
    context.disarmedSessions.add(sessionID)
  }
}

async function isRoot(context: WatcherContext, sessionID: string): Promise<boolean> {
  const cached = context.rootBySession.get(sessionID)
  if (cached !== undefined) {
    return cached
  }
  try {
    const session = await context.api.session.get({ sessionID })
    const isRootSession = session.parentID === undefined
    context.rootBySession.set(sessionID, isRootSession)
    return isRootSession
  } catch {
    return false
  }
}

async function inputLimitForSession(
  context: WatcherContext,
  sessionID: string,
): Promise<number | undefined> {
  const model = context.modelBySession.get(sessionID)
  if (model === undefined) {
    return undefined
  }
  try {
    const { data } = await context.api.model.list({})
    const entry = data.find((e) => e.id === model.id && e.providerID === model.providerID)
    return entry === undefined ? undefined : inputLimitOf(entry.limit)
  } catch {
    return undefined
  }
}
