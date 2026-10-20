import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const PLAN_DIRECTORY = '/Users/jose.romero/.opencode/plan'
const COMPACTION_CONFIRMATION_TIMEOUT_MS = 300_000

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

export interface CompactionMessage {
  readonly role: string
  readonly content: Array<{ readonly type: string; readonly text?: string }>
}

export interface CompactionInput {
  readonly sessionID: string
  readonly messages: CompactionMessage[]
}

export interface AutoCompactApi {
  readonly session: {
    get(input: { sessionID: string }): Promise<AutoCompactSession>
    compact(input: { sessionID: string; delivery: 'steer' }): Promise<unknown>
    synthetic(input: { sessionID: string; text: string; resume: boolean }): Promise<unknown>
    hook(name: 'compaction', handler: (input: CompactionInput) => Promise<void>): Promise<void>
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

interface CompactionRun {
  readonly planPath: string
  readonly contentHash: string
}

interface AutoCompactState {
  readonly inFlightBySession: Map<string, CompactionRun>
  readonly hashesBySession: Map<string, Map<string, string>>
}

type CompactionOutcome =
  | { readonly kind: 'ended' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'timedOut'; readonly confirmationTimeoutMs: number }
  | { readonly kind: 'interrupted'; readonly error: unknown }

export function createAutoCompact(options: AutoCompactOptions) {
  const state: AutoCompactState = {
    inFlightBySession: new Map<string, CompactionRun>(),
    hashesBySession: new Map<string, Map<string, string>>(),
  }
  return {
    async handleExecuteAfter(api: AutoCompactApi, input: ExecuteAfterInput): Promise<void> {
      const planPath = await compactionTargetOf(api, input, options, state)
      if (planPath === undefined) {
        return
      }
      const content = await readPlanOrNotice(api, input.sessionID, planPath)
      if (content === undefined || state.inFlightBySession.has(input.sessionID)) {
        return
      }
      const run: CompactionRun = { planPath, contentHash: hashOf(content) }
      if (!rememberHash(state, input.sessionID, run)) {
        return
      }
      await startCompaction(api, input.sessionID, run, state, options.confirmationTimeoutMs)
    },
    async handleCompaction(input: CompactionInput): Promise<void> {
      const run = state.inFlightBySession.get(input.sessionID)
      if (run === undefined) {
        return
      }
      input.messages.push({
        role: 'user',
        content: [{ type: 'text', text: compactionNoticeText(run.planPath) }],
      })
      state.inFlightBySession.delete(input.sessionID)
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
  try {
    await api.session.compact({ sessionID, delivery: 'steer' })
  } catch (error: unknown) {
    releaseInFlight(state, sessionID, run)
    forgetRunHash(state, sessionID, run)
    await recordNotice(api, sessionID, compactionFailureText(run.planPath, error))
    return
  }
  void watchCompaction(api, sessionID, run, state, confirmationTimeoutMs)
}

async function watchCompaction(
  api: AutoCompactApi,
  sessionID: string,
  run: CompactionRun,
  state: AutoCompactState,
  confirmationTimeoutMs: number,
): Promise<void> {
  const controller = new AbortController()
  let isTimedOut = false
  const timer = setTimeout(() => {
    isTimedOut = true
    controller.abort()
  }, confirmationTimeoutMs)
  const observed = await Promise.race([
    nextCompactionOutcome(api, sessionID, controller.signal),
    untilAborted(controller.signal),
  ]).catch((error: unknown): CompactionOutcome => ({ kind: 'interrupted', error }))
  clearTimeout(timer)
  controller.abort()
  const outcome: CompactionOutcome =
    isTimedOut && observed.kind === 'interrupted'
      ? { kind: 'timedOut', confirmationTimeoutMs }
      : observed
  await settleCompaction(api, sessionID, run, state, outcome)
}

async function settleCompaction(
  api: AutoCompactApi,
  sessionID: string,
  run: CompactionRun,
  state: AutoCompactState,
  outcome: CompactionOutcome,
): Promise<void> {
  releaseInFlight(state, sessionID, run)
  if (outcome.kind === 'ended') {
    return
  }
  forgetRunHash(state, sessionID, run)
  await recordNotice(api, sessionID, settlementText(run.planPath, outcome))
}

function settlementText(
  planPath: string,
  outcome: Exclude<CompactionOutcome, { readonly kind: 'ended' }>,
): string {
  if (outcome.kind === 'failed') {
    return compactionFailureText(planPath, outcome.error)
  }
  if (outcome.kind === 'timedOut') {
    return unconfirmedTimeoutText(planPath, outcome.confirmationTimeoutMs)
  }
  return unconfirmedErrorText(planPath, outcome.error)
}

async function nextCompactionOutcome(
  api: AutoCompactApi,
  sessionID: string,
  signal: AbortSignal,
): Promise<CompactionOutcome> {
  for await (const event of api.event.subscribe({ signal })) {
    if (event.data.sessionID !== sessionID) {
      continue
    }
    if (event.type === 'session.compaction.ended') {
      return { kind: 'ended' }
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

function compactionNoticeText(planPath: string): string {
  return `Plan saved to ${planPath} and the session was compacted. Read the plan from that file. Continue with the next step of the design skill: ask whether to create tickets or implement. If the user picks implementation, invoke subagent-driven-development now, even if Plan mode is still active.`
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

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface AutoCompactPlugin {
  readonly id: string
  readonly setup: (api: AutoCompactApi) => Promise<void>
}

const autoCompactPlugin: AutoCompactPlugin = {
  id: 'auto-compact',
  setup: async (api: AutoCompactApi): Promise<void> => {
    const autoCompact = createAutoCompact({
      planDirectory: PLAN_DIRECTORY,
      homeDirectory: homedir(),
      confirmationTimeoutMs: COMPACTION_CONFIRMATION_TIMEOUT_MS,
    })
    await api.tool.hook('execute.after', (input) => autoCompact.handleExecuteAfter(api, input))
    await api.session.hook('compaction', (input) => autoCompact.handleCompaction(input))
  },
}

export default autoCompactPlugin
