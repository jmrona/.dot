import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const PROGRESS_VERSION = 1 as const
export type ProgressPhase = 'implement' | 'review' | 'correct'
export type StepState = 'running' | 'done' | 'failed'
export type GateState = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
export interface StepKey { readonly taskID: string; readonly phase: ProgressPhase; readonly attempt: number }
export interface StepStart extends StepKey { readonly title: string; readonly model: string }
export interface ProgressStep extends StepStart { readonly sessionID: string | null; readonly startedAt: number; readonly endedAt: number | null; readonly state: StepState }
export interface GateProgress { readonly startedAt: number | null; readonly endedAt: number | null; readonly state: GateState }
export interface WaveProgress { readonly version: typeof PROGRESS_VERSION; readonly rootSessionID: string; readonly startedAt: number; readonly status: 'running'; readonly steps: readonly ProgressStep[]; readonly gate: GateProgress }
export interface ProgressRecorder { update(change: (progress: WaveProgress) => WaveProgress): Promise<void>; remove(): Promise<void> }

let temporaryFileCounter = 0

export function progressFilePath(directory: string, rootSessionID: string): string {
  return join(directory, `${rootSessionID}.json`)
}

export function startWave(rootSessionID: string, now: number): WaveProgress {
  return {
    version: PROGRESS_VERSION,
    rootSessionID,
    startedAt: now,
    status: 'running',
    steps: [],
    gate: { startedAt: null, endedAt: null, state: 'pending' },
  }
}

export function startStep(progress: WaveProgress, step: StepStart, now: number): WaveProgress {
  const started: ProgressStep = { ...step, sessionID: null, startedAt: now, endedAt: null, state: 'running' }
  return { ...progress, steps: [...progress.steps, started] }
}

export function attachSession(progress: WaveProgress, key: StepKey, sessionID: string): WaveProgress {
  return changeMatchingSteps(progress, key, (step) => ({ ...step, sessionID }))
}

export function finishStep(
  progress: WaveProgress,
  key: StepKey,
  state: 'done' | 'failed',
  now: number,
): WaveProgress {
  return changeMatchingSteps(progress, key, (step) => ({ ...step, state, endedAt: now }))
}

export function startGate(progress: WaveProgress, now: number): WaveProgress {
  return { ...progress, gate: { startedAt: now, endedAt: null, state: 'running' } }
}

export function finishGate(
  progress: WaveProgress,
  state: 'passed' | 'failed' | 'skipped',
  now: number,
): WaveProgress {
  return { ...progress, gate: { startedAt: progress.gate.startedAt, endedAt: now, state } }
}

export function createProgressRecorder(
  path: string,
  initial: WaveProgress,
  warn: (message: string) => void,
): ProgressRecorder {
  let latest = initial
  let isRemoved = false
  let queue: Promise<void> = Promise.resolve()

  function enqueue(task: () => Promise<void>): Promise<void> {
    queue = queue.then(task)
    return queue
  }

  function scheduleWrite(): Promise<void> {
    const snapshot = latest
    return enqueue(() => writeSnapshot(path, snapshot, warn))
  }

  void scheduleWrite()

  return {
    update(change: (progress: WaveProgress) => WaveProgress): Promise<void> {
      if (isRemoved) {
        return Promise.resolve()
      }
      latest = change(latest)
      return scheduleWrite()
    },
    remove(): Promise<void> {
      isRemoved = true
      return enqueue(() => removeFile(path, warn))
    },
  }
}

export async function clearProgressFiles(
  directory: string,
  warn: (message: string) => void,
): Promise<void> {
  try {
    const names = await readdir(directory)
    const staleNames = names.filter((name) => name.endsWith('.json') || name.endsWith('.tmp'))
    await Promise.all(staleNames.map((name) => rm(join(directory, name), { force: true })))
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      warn(
        `Could not clear the wave progress files in ${directory}: ${describeError(error)}. ` +
          'Check that the directory is readable and writable, then delete the stale files by hand.',
      )
    }
  }
}

function changeMatchingSteps(
  progress: WaveProgress,
  key: StepKey,
  change: (step: ProgressStep) => ProgressStep,
): WaveProgress {
  if (!progress.steps.some((step) => isSameStep(step, key))) {
    return progress
  }
  return { ...progress, steps: progress.steps.map((step) => (isSameStep(step, key) ? change(step) : step)) }
}

function isSameStep(step: StepKey, key: StepKey): boolean {
  return step.taskID === key.taskID && step.phase === key.phase && step.attempt === key.attempt
}

async function writeSnapshot(
  path: string,
  progress: WaveProgress,
  warn: (message: string) => void,
): Promise<void> {
  temporaryFileCounter += 1
  const temporaryPath = `${path}.${process.pid}.${temporaryFileCounter}.tmp`
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(progress, null, 2)}\n`)
    await rename(temporaryPath, path)
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    warn(
      `Could not write the wave progress file ${path}: ${describeError(error)}. ` +
        'Check that the directory is writable and that the disk has free space.',
    )
  }
}

async function removeFile(path: string, warn: (message: string) => void): Promise<void> {
  try {
    await rm(path, { force: true })
  } catch (error: unknown) {
    warn(
      `Could not remove the wave progress file ${path}: ${describeError(error)}. ` +
        'Delete the file by hand, or restart the plugin to clear stale progress files.',
    )
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
