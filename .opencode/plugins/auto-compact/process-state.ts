import type { CompactionRun } from './index.ts'
import type { ThresholdWatcher } from './threshold.ts'

const PROCESS_STATE_KEY = Symbol.for('opencode.auto-compact')

export interface ProcessState {
  activeWatcher: ThresholdWatcher | undefined
  readonly inFlightBySession: Map<string, CompactionRun>
  readonly hashesBySession: Map<string, Map<string, string>>
  readonly handledPlanWriteIds: Set<string>
}

export function createProcessState(): ProcessState {
  return {
    activeWatcher: undefined,
    inFlightBySession: new Map<string, CompactionRun>(),
    hashesBySession: new Map<string, Map<string, string>>(),
    handledPlanWriteIds: new Set<string>(),
  }
}

export function sharedProcessState(): ProcessState {
  const scope = globalThis as { [PROCESS_STATE_KEY]?: ProcessState }
  scope[PROCESS_STATE_KEY] ??= createProcessState()
  return scope[PROCESS_STATE_KEY]
}

export function replaceActiveWatcher(
  state: ProcessState,
  watcher: ThresholdWatcher | undefined,
): void {
  state.activeWatcher?.stop()
  state.activeWatcher = watcher
}
