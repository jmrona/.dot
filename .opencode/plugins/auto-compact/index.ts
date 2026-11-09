import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parsePercentArgument, savePercent } from './command.ts'
import { loadAutoCompactConfig } from './config.ts'
import { replaceActiveWatcher, sharedProcessState, type ProcessState } from './process-state.ts'
import { clearWatcherStatus, markWatcherFailed } from './status.ts'
import {
  startThresholdWatcher,
  type ThresholdApi,
  type ThresholdDependencies,
} from './threshold.ts'

const CONFIRMATION_CAP_MS = 60 * 60 * 1000

const EXECUTION_PROGRESS_EVENTS: ReadonlySet<string> = new Set([
  'session.step.ended',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
])

const PLAN_DIRECTORY = '/Users/jose.romero/.opencode/plan'

export interface AutoCompactSession {
  readonly id: string
  readonly parentID?: string
}

export interface AutoCompactEvent {
  readonly type: string
  readonly data: { readonly sessionID: string; readonly error?: unknown }
}

export interface ExecuteAfterInput {
  readonly tool: string
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly input: unknown
  readonly status: string
  readonly result?: unknown
  readonly error?: unknown
}

export interface AutoCompactApi {
  readonly session: {
    get(input: { sessionID: string }): Promise<AutoCompactSession>
    compact(input: { sessionID: string; delivery: 'steer' }): Promise<unknown>
    synthetic(input: { sessionID: string; text: string; resume: boolean }): Promise<unknown>
  }
  readonly tool: {
    hook(name: 'execute.after', handler: (input: ExecuteAfterInput) => Promise<void>): Promise<void>
  }
  readonly event: {
    subscribe(input: { signal: AbortSignal }): AsyncIterable<AutoCompactEvent>
  }
}

export interface AutoCompactOptions {
  readonly planDirectory: string
  readonly homeDirectory: string
  readonly confirmationTimeoutMs: number
}

export type CompactionRun =
  | { readonly kind: 'plan'; readonly planPath: string; readonly contentHash: string }
  | { readonly kind: 'threshold'; readonly percent: number }

interface AutoCompactState {
  readonly handledPlanWriteIds: Set<string>
  readonly inFlightBySession: Map<string, CompactionRun>
  readonly hashesBySession: Map<string, Map<string, string>>
}

type CompactionOutcome =
  | { readonly kind: 'ended' }
  | { readonly kind: 'deleted' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'timedOut'; readonly confirmationTimeoutMs: number }
  | { readonly kind: 'interrupted'; readonly error: unknown }

export function createAutoCompact(options: AutoCompactOptions, processState: ProcessState) {
  const state: AutoCompactState = {
    inFlightBySession: processState.inFlightBySession,
    hashesBySession: processState.hashesBySession,
    handledPlanWriteIds: processState.handledPlanWriteIds,
  }
  return {
    async handleExecuteAfter(api: AutoCompactApi, input: ExecuteAfterInput): Promise<void> {
      const planPath = await compactionTargetOf(api, input, options, state)
      if (planPath === undefined || !claimPlanWrite(state, input.id)) {
        return
      }
      const content = await readPlanOrNotice(api, input.sessionID, planPath)
      if (content === undefined || state.inFlightBySession.has(input.sessionID)) {
        return
      }
      const run: CompactionRun = { kind: 'plan', planPath, contentHash: hashOf(content) }
      if (!rememberHash(state, input.sessionID, run)) {
        return
      }
      await startCompaction(api, input.sessionID, run, state, options.confirmationTimeoutMs)
    },
    async startThresholdCompaction(
      api: AutoCompactApi,
      sessionID: string,
      percent: number,
    ): Promise<boolean> {
      if (state.inFlightBySession.has(sessionID)) {
        return false
      }
      const run: CompactionRun = { kind: 'threshold', percent }
      await startCompaction(api, sessionID, run, state, options.confirmationTimeoutMs)
      return true
    },
    isCompactionInFlight(sessionID: string): boolean {
      return state.inFlightBySession.has(sessionID)
    },
  }
}

async function compactionTargetOf(
  api: AutoCompactApi,
  input: ExecuteAfterInput,
  options: AutoCompactOptions,
  state: AutoCompactState,
): Promise<string | undefined> {
  if (!isCompletedPlanWrite(input)) {
    return undefined
  }
  const planPath = planPathOf(input, options)
  if (planPath === undefined || !planPath.endsWith('.md')) {
    return undefined
  }
  if (state.inFlightBySession.has(input.sessionID)) {
    return undefined
  }
  return (await isRootSession(api, input.sessionID)) ? planPath : undefined
}

function claimPlanWrite(state: AutoCompactState, callID: string): boolean {
  if (state.handledPlanWriteIds.has(callID)) {
    return false
  }
  state.handledPlanWriteIds.add(callID)
  return true
}

function isCompletedPlanWrite(input: ExecuteAfterInput): boolean {
  return (input.tool === 'write' || input.tool === 'edit') && input.status === 'completed'
}

function planPathOf(input: ExecuteAfterInput, options: AutoCompactOptions): string | undefined {
  const requestedPath = pathOf(input.input)
  if (requestedPath === undefined) {
    return undefined
  }
  const absolutePath = expandHomeDirectory(requestedPath, options.homeDirectory)
  if (!isAbsolute(absolutePath)) {
    return undefined
  }
  const resolvedPath = resolve(absolutePath)
  return isInside(resolve(options.planDirectory), resolvedPath) ? resolvedPath : undefined
}

function pathOf(toolInput: unknown): string | undefined {
  if (typeof toolInput === 'object' && toolInput !== null && 'path' in toolInput) {
    return typeof toolInput.path === 'string' ? toolInput.path : undefined
  }
  return undefined
}

function expandHomeDirectory(requestedPath: string, homeDirectory: string): string {
  if (requestedPath === '~') {
    return homeDirectory
  }
  if (requestedPath.startsWith('~/')) {
    return join(homeDirectory, requestedPath.slice(2))
  }
  return requestedPath
}

function isInside(directory: string, candidate: string): boolean {
  const relativePath = relative(directory, candidate)
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

async function isRootSession(api: AutoCompactApi, sessionID: string): Promise<boolean> {
  try {
    const session = await api.session.get({ sessionID })
    return session.parentID === undefined
  } catch {
    return false
  }
}

async function readPlanOrNotice(
  api: AutoCompactApi,
  sessionID: string,
  planPath: string,
): Promise<string | undefined> {
  try {
    return await readFile(planPath, 'utf8')
  } catch (error: unknown) {
    await recordNotice(api, sessionID, unreadableText(planPath, error))
    return undefined
  }
}

function rememberHash(state: AutoCompactState, sessionID: string, run: CompactionRun): boolean {
  const hashesForSession = state.hashesBySession.get(sessionID) ?? new Map<string, string>()
  state.hashesBySession.set(sessionID, hashesForSession)
  if (hashesForSession.get(run.planPath) === run.contentHash) {
    return false
  }
  hashesForSession.set(run.planPath, run.contentHash)
  return true
}

function forgetRunHash(state: AutoCompactState, sessionID: string, run: CompactionRun): void {
  if (run.kind !== 'plan') {
    return
  }
  const hashesForSession = state.hashesBySession.get(sessionID)
  if (hashesForSession?.get(run.planPath) === run.contentHash) {
    hashesForSession.delete(run.planPath)
  }
}

function releaseInFlight(state: AutoCompactState, sessionID: string, run: CompactionRun): void {
  if (state.inFlightBySession.get(sessionID) === run) {
    state.inFlightBySession.delete(sessionID)
  }
}

async function startCompaction(
  api: AutoCompactApi,
  sessionID: string,
  run: CompactionRun,
  state: AutoCompactState,
  confirmationTimeoutMs: number,
): Promise<void> {
  state.inFlightBySession.set(sessionID, run)
  const confirmation = openConfirmation(api, sessionID, confirmationTimeoutMs)
  void confirmation.outcome.then((outcome) => settleCompaction(api, sessionID, run, state, outcome))
  try {
    await api.session.compact({ sessionID, delivery: 'steer' })
  } catch (error: unknown) {
    confirmation.cancel()
    releaseInFlight(state, sessionID, run)
    forgetRunHash(state, sessionID, run)
    await recordNotice(api, sessionID, failureTextOf(run, error))
  }
}

interface Confirmation {
  readonly outcome: Promise<CompactionOutcome>
  cancel(): void
}

function openConfirmation(
  api: AutoCompactApi,
  sessionID: string,
  confirmationTimeoutMs: number,
): Confirmation {
  const controller = new AbortController()
  const timers = armConfirmationTimers(controller, confirmationTimeoutMs)
  let isCancelled = false
  const outcome = Promise.race([
    nextCompactionOutcome(api, sessionID, controller.signal, timers.startStepTimer),
    untilAborted(controller.signal),
  ])
    .catch((error: unknown): CompactionOutcome => ({ kind: 'interrupted', error }))
    .then((observed): CompactionOutcome => {
      timers.clear()
      controller.abort()
      return isCancelled ? { kind: 'cancelled' } : timers.expire(observed)
    })
  return {
    outcome,
    cancel: () => {
      isCancelled = true
      controller.abort()
    },
  }
}

function armConfirmationTimers(controller: AbortController, confirmationTimeoutMs: number) {
  let expiredAfterMs: number | undefined
  const expireAfter = (afterMs: number): ReturnType<typeof setTimeout> =>
    setTimeout(() => {
      expiredAfterMs = afterMs
      controller.abort()
    }, afterMs)
  const capTimer = expireAfter(CONFIRMATION_CAP_MS)
  let stepTimer: ReturnType<typeof setTimeout> | undefined
  return {
    startStepTimer: (): void => {
      stepTimer ??= expireAfter(confirmationTimeoutMs)
    },
    clear: (): void => {
      clearTimeout(capTimer)
      clearTimeout(stepTimer)
    },
    expire: (observed: CompactionOutcome): CompactionOutcome =>
      expiredAfterMs !== undefined && observed.kind === 'interrupted'
        ? { kind: 'timedOut', confirmationTimeoutMs: expiredAfterMs }
        : observed,
  }
}

async function settleCompaction(
  api: AutoCompactApi,
  sessionID: string,
  run: CompactionRun,
  state: AutoCompactState,
  outcome: CompactionOutcome,
): Promise<void> {
  if (outcome.kind === 'cancelled') {
    return
  }
  releaseInFlight(state, sessionID, run)
  if (outcome.kind === 'deleted') {
    return
  }
  if (outcome.kind === 'ended') {
    await recordNotice(api, sessionID, postCompactionTextOf(run))
    return
  }
  forgetRunHash(state, sessionID, run)
  await recordNotice(api, sessionID, settlementText(run, outcome))
}

function postCompactionTextOf(run: CompactionRun): string {
  return run.kind === 'plan'
    ? `The session was compacted after the plan was saved to ${run.planPath}. Skill instructions loaded before the compaction are no longer in context. Read the plan from that file. Do not restart the design skill: continue with its handoff step. In a ticket run, invoke subagent-driven-development with skill, even if you invoked it before this notice. Otherwise, ask whether to create tickets or implement, unless the user has already answered.`
    : `The session was compacted at ${run.percent}% of the input limit. Skill instructions loaded before the compaction are no longer in context. Invoke the skill whose procedure you are following again with skill before your next step.`
}

function settlementText(
  run: CompactionRun,
  outcome: Exclude<CompactionOutcome, { readonly kind: 'ended' | 'deleted' | 'cancelled' }>,
): string {
  if (outcome.kind === 'failed') {
    return failureTextOf(run, outcome.error)
  }
  if (outcome.kind === 'timedOut') {
    return timeoutTextOf(run, outcome.confirmationTimeoutMs)
  }
  return unconfirmedTextOf(run, outcome.error)
}

function failureTextOf(run: CompactionRun, error: unknown): string {
  return run.kind === 'plan'
    ? compactionFailureText(run.planPath, error)
    : thresholdFailureText(run.percent, error)
}

function timeoutTextOf(run: CompactionRun, confirmationTimeoutMs: number): string {
  return run.kind === 'plan'
    ? unconfirmedTimeoutText(run.planPath, confirmationTimeoutMs)
    : thresholdTimeoutText(run.percent, confirmationTimeoutMs)
}

function unconfirmedTextOf(run: CompactionRun, error: unknown): string {
  return run.kind === 'plan'
    ? unconfirmedErrorText(run.planPath, error)
    : thresholdUnconfirmedText(run.percent, error)
}

async function nextCompactionOutcome(
  api: AutoCompactApi,
  sessionID: string,
  signal: AbortSignal,
  onExecutionProgress: () => void,
): Promise<CompactionOutcome> {
  for await (const event of api.event.subscribe({ signal })) {
    if (event.data.sessionID !== sessionID) {
      continue
    }
    if (event.type === 'session.compaction.ended') {
      return { kind: 'ended' }
    }
    if (event.type === 'session.deleted') {
      return { kind: 'deleted' }
    }
    if (EXECUTION_PROGRESS_EVENTS.has(event.type)) {
      onExecutionProgress()
    }
    if (event.type === 'session.compaction.failed') {
      return { kind: 'failed', error: event.data.error }
    }
  }
  return {
    kind: 'interrupted',
    error: new Error('the event stream ended before the compaction was confirmed'),
  }
}

function untilAborted(signal: AbortSignal): Promise<CompactionOutcome> {
  return new Promise((resolve) => {
    signal.addEventListener(
      'abort',
      () => resolve({ kind: 'interrupted', error: new Error('the watcher was aborted') }),
      { once: true },
    )
  })
}

async function recordNotice(api: AutoCompactApi, sessionID: string, text: string): Promise<void> {
  try {
    await api.session.synthetic({ sessionID, text, resume: false })
  } catch {
    return
  }
}

function unreadableText(planPath: string, error: unknown): string {
  return `Plan saved to ${planPath}, but it could not be read: ${errorMessage(error)}. Run /compact to compact the session manually.`
}

function compactionFailureText(planPath: string, error: unknown): string {
  return `Plan saved to ${planPath}, but the session could not be compacted: ${errorMessage(error)}. Run /compact to compact it manually.`
}

function unconfirmedTimeoutText(planPath: string, confirmationTimeoutMs: number): string {
  return `Plan saved to ${planPath}, but the compaction could not be confirmed within ${confirmationTimeoutMs / 1000} seconds. Run /compact to compact the session manually.`
}

function unconfirmedErrorText(planPath: string, error: unknown): string {
  return `Plan saved to ${planPath}, but the compaction could not be confirmed: ${errorMessage(error)}. Run /compact to compact the session manually.`
}

function thresholdFailureText(percent: number, error: unknown): string {
  return `Context reached ${percent}% of the input limit, but the session could not be compacted: ${errorMessage(error)}. Run /compact to compact it manually.`
}

function thresholdTimeoutText(percent: number, confirmationTimeoutMs: number): string {
  return `Context reached ${percent}% of the input limit, but the compaction could not be confirmed within ${confirmationTimeoutMs / 1000} seconds. Run /compact to compact the session manually.`
}

function thresholdUnconfirmedText(percent: number, error: unknown): string {
  return `Context reached ${percent}% of the input limit, but the compaction could not be confirmed: ${errorMessage(error)}. Run /compact to compact the session manually.`
}

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface CommandInvocation {
  readonly sessionID: string
  readonly prompt: { readonly text: string }
}

export interface CommandDraft {
  add(command: {
    name: string
    description: string
    execute(invocation: CommandInvocation): Promise<void>
  }): void
}

export interface PluginApi extends ThresholdApi {
  readonly command: { transform(fn: (draft: CommandDraft) => void): unknown }
}

const USAGE_TEXT = 'Use /auto-compact <1-100> or /auto-compact off.'

const COMMAND_DESCRIPTION =
  'Set the auto-compact token threshold: /auto-compact <1-100> or /auto-compact off'

export interface SetupOptions {
  readonly configPath: string
  readonly statusPath: string
  readonly log: (message: string) => void
}

export async function setupAutoCompact(
  api: PluginApi,
  options: SetupOptions,
  processState: ProcessState = sharedProcessState(),
): Promise<void> {
  const config = await loadAutoCompactConfig(options.configPath, options.log)
  const autoCompact = createAutoCompact(
    {
      planDirectory: PLAN_DIRECTORY,
      homeDirectory: homedir(),
      confirmationTimeoutMs: config.confirmationTimeoutMs,
    },
    processState,
  )
  if (config.compactOnPlanSave) {
    await api.tool.hook('execute.after', (input) => autoCompact.handleExecuteAfter(api, input))
  }
  const threshold: ThresholdControl = {
    processState,
    percent: config.compactAtPercentOfInputLimit,
  }
  const watcherDependencies = {
    api,
    autoCompact,
    log: options.log,
    onGiveUp: () => markWatcherFailedSafely(options.statusPath, options.log),
  }
  await clearWatcherStatusSafely(options.statusPath, options.log)
  replaceActiveWatcher(
    processState,
    threshold.percent === null
      ? undefined
      : startThresholdWatcher({ ...watcherDependencies, percent: threshold.percent }),
  )
  api.command.transform((draft) =>
    draft.add({
      name: 'auto-compact',
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        executeCommand(api, invocation, threshold, watcherDependencies, options),
    }),
  )
}

interface ThresholdControl {
  readonly processState: ProcessState
  percent: number | null
}

type WatcherDependencies = Omit<ThresholdDependencies, 'percent'>

async function executeCommand(
  api: AutoCompactApi,
  invocation: CommandInvocation,
  threshold: ThresholdControl,
  watcherDependencies: WatcherDependencies,
  options: SetupOptions,
): Promise<void> {
  const argument = parsePercentArgument(invocation.prompt.text)
  if (argument.kind === 'show') {
    await recordNotice(api, invocation.sessionID, currentThresholdText(threshold.percent))
  } else if (argument.kind === 'invalid') {
    await recordNotice(api, invocation.sessionID, USAGE_TEXT)
  } else {
    const percent = argument.kind === 'set' ? argument.percent : null
    await changeThreshold(api, invocation, percent, threshold, watcherDependencies, options)
  }
}

async function changeThreshold(
  api: AutoCompactApi,
  invocation: CommandInvocation,
  percent: number | null,
  threshold: ThresholdControl,
  watcherDependencies: WatcherDependencies,
  options: SetupOptions,
): Promise<void> {
  try {
    await savePercent(options.configPath, percent)
  } catch (error: unknown) {
    await recordNotice(api, invocation.sessionID, saveFailureText(error))
    return
  }
  await applyPercent(threshold, watcherDependencies, percent, options)
  threshold.percent = percent
  await recordNotice(api, invocation.sessionID, changeConfirmationText(percent))
}

function changeConfirmationText(percent: number | null): string {
  return percent === null
    ? 'Auto-compact threshold turned off.'
    : `Auto-compact threshold set to ${percent}% of the input limit.`
}

function saveFailureText(error: unknown): string {
  return `Could not save the auto-compact threshold: ${errorMessage(error)}. The threshold is unchanged.`
}

function currentThresholdText(percent: number | null): string {
  return percent === null
    ? 'Auto-compact threshold is off.'
    : `Auto-compact threshold is ${percent}% of the input limit.`
}

async function applyPercent(
  threshold: ThresholdControl,
  watcherDependencies: WatcherDependencies,
  percent: number | null,
  options: SetupOptions,
): Promise<void> {
  const activeWatcher = threshold.processState.activeWatcher
  if (activeWatcher?.isRunning()) {
    activeWatcher.setPercent(percent)
    return
  }
  if (percent === null) {
    return
  }
  await clearWatcherStatusSafely(options.statusPath, options.log)
  replaceActiveWatcher(
    threshold.processState,
    startThresholdWatcher({ ...watcherDependencies, percent }),
  )
}

async function markWatcherFailedSafely(
  statusPath: string,
  log: (message: string) => void,
): Promise<void> {
  try {
    await markWatcherFailed(statusPath)
  } catch (error: unknown) {
    log(`auto-compact: could not write ${statusPath}: ${errorMessage(error)}`)
  }
}

async function clearWatcherStatusSafely(
  statusPath: string,
  log: (message: string) => void,
): Promise<void> {
  try {
    await clearWatcherStatus(statusPath)
  } catch (error: unknown) {
    log(`auto-compact: could not clear ${statusPath}: ${errorMessage(error)}`)
  }
}

interface AutoCompactPlugin {
  readonly id: string
  readonly setup: (api: PluginApi) => Promise<void>
}

const autoCompactPlugin: AutoCompactPlugin = {
  id: 'auto-compact',
  setup: (api: PluginApi): Promise<void> =>
    setupAutoCompact(api, {
      configPath: fileURLToPath(new URL('./config.json', import.meta.url)),
      statusPath: fileURLToPath(new URL('./status.json', import.meta.url)),
      log: console.error,
    }),
}

export default autoCompactPlugin
