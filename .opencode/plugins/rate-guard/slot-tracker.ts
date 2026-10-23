import { classifyEvent, type OpencodeEvent } from './event-kind.ts'
import type { SlotSemaphore } from './semaphore.ts'

export interface SubagentCall {
  readonly tool: string
  readonly sessionID: string
  readonly id: string
  readonly input: { readonly agent?: string; readonly background?: boolean }
  readonly result?: {
    readonly output?: { readonly sessionID?: string }
    readonly metadata?: { readonly sessionID?: string }
  }
}

export interface SlotTrackerDependencies {
  readonly semaphore: SlotSemaphore
  readonly isHardAgent: (agentID: string) => Promise<boolean>
}

export interface SlotTracker {
  beforeExecute(call: SubagentCall): Promise<void>
  afterExecute(call: SubagentCall): Promise<void>
  handleEvent(event: OpencodeEvent): void
}

export function createSlotTracker(dependencies: SlotTrackerDependencies): SlotTracker {
  const { semaphore, isHardAgent } = dependencies
  const heldCalls = new Map<string, { readonly isBackground: boolean; readonly sessionID: string }>()
  const callByChild = new Map<string, string>()
  const pendingCalls = new Map<string, { readonly sessionID: string; isCancelled: boolean }>()

  function cancelPendingCall(callID: string): void {
    const pending = pendingCalls.get(callID)
    if (pending !== undefined) {
      pending.isCancelled = true
    }
  }

  function cancelPendingSession(sessionID: string): void {
    pendingCalls.forEach((pending) => {
      if (pending.sessionID === sessionID) {
        pending.isCancelled = true
      }
    })
  }

  function forgetChildrenOf(callID: string): void {
    callByChild.forEach((heldCallID, childID) => {
      if (heldCallID === callID) {
        callByChild.delete(childID)
      }
    })
  }

  async function acquireSlot(call: SubagentCall): Promise<void> {
    const pending = pendingCalls.get(call.id)
    if (!(await shouldGate(call)) || pending?.isCancelled) {
      return
    }
    if (!(await semaphore.acquire(call.sessionID, call.id))) {
      return
    }
    if (pending?.isCancelled) {
      semaphore.release()
      return
    }
    heldCalls.set(call.id, { isBackground: call.input.background === true, sessionID: call.sessionID })
  }

  function releaseCall(callID: string): void {
    if (heldCalls.delete(callID)) {
      semaphore.release()
    }
  }

  function releaseForegroundCallsOf(sessionID: string): void {
    const foregroundCallIDs = [...heldCalls]
      .filter(([, held]) => held.sessionID === sessionID && !held.isBackground)
      .map(([callID]) => callID)
    foregroundCallIDs.forEach(releaseCall)
  }

  async function shouldGate(call: SubagentCall): Promise<boolean> {
    if (call.tool !== 'subagent' || call.input.agent === undefined) {
      return false
    }
    return isHardAgent(call.input.agent).catch(() => false)
  }

  return {
    async beforeExecute(call) {
      pendingCalls.set(call.id, { sessionID: call.sessionID, isCancelled: false })
      try {
        await acquireSlot(call)
      } finally {
        pendingCalls.delete(call.id)
      }
    },
    async afterExecute(call) {
      const held = heldCalls.get(call.id)
      if (held === undefined) {
        return
      }
      const childID = call.result?.output?.sessionID ?? call.result?.metadata?.sessionID
      if (held.isBackground && childID !== undefined) {
        callByChild.set(childID, call.id)
        return
      }
      releaseCall(call.id)
    },
    handleEvent(event) {
      const kind = classifyEvent(event)
      if (kind.kind === 'toolFailed') {
        cancelPendingCall(kind.callID)
        semaphore.cancelCall(kind.callID)
        forgetChildrenOf(kind.callID)
        releaseCall(kind.callID)
      }
      if (kind.kind === 'executionEnded') {
        releaseChild(kind.sessionID)
        if (kind.wasInterrupted) {
          cancelPendingSession(kind.sessionID)
          semaphore.cancelSession(kind.sessionID)
          releaseForegroundCallsOf(kind.sessionID)
        }
      }
      if (kind.kind === 'sessionDeleted') {
        releaseChild(kind.sessionID)
      }
    },
  }

  function releaseChild(childID: string): void {
    const callID = callByChild.get(childID)
    if (callID !== undefined) {
      callByChild.delete(childID)
      releaseCall(callID)
    }
  }
}
