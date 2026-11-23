import { addAbortListener } from 'node:events'

interface Waiter {
  readonly sessionID: string
  readonly callID: string
  readonly resolve: (granted: boolean) => void
  state: 'queued' | 'reserved' | 'settled'
}

export interface SlotSemaphore {
  acquire(sessionID: string, callID: string, signal?: AbortSignal): Promise<boolean>
  release(): void
  setLimit(limit: number): void
  limit(): number
  cancelSession(sessionID: string): void
  cancelCall(callID: string): void
}

export function createSlotSemaphore(
  initialLimit: number,
  isSessionAlive: (sessionID: string) => Promise<boolean>,
): SlotSemaphore {
  let currentLimit = initialLimit
  let activeSlots = 0
  let queue: Waiter[] = []

  function settle(waiter: Waiter, granted: boolean): void {
    if (waiter.state === 'settled') return
    const returnsReservation = waiter.state === 'reserved' && !granted
    waiter.state = 'settled'
    waiter.resolve(granted)
    if (returnsReservation) {
      activeSlots -= 1
      grantFreeSlots()
    }
  }

  async function admit(waiter: Waiter): Promise<void> {
    const isAlive = await isSessionAlive(waiter.sessionID).catch(() => false)
    settle(waiter, isAlive)
  }

  function grantFreeSlots(): void {
    while (activeSlots < currentLimit && queue.length > 0) {
      const next = queue.shift() as Waiter
      next.state = 'reserved'
      activeSlots += 1
      void admit(next)
    }
  }

  function abort(waiter: Waiter): void {
    const index = queue.indexOf(waiter)
    if (index !== -1) queue.splice(index, 1)
    settle(waiter, false)
  }

  function drop(shouldDrop: (waiter: Waiter) => boolean): void {
    const dropped = queue.filter(shouldDrop)
    queue = queue.filter((waiter) => !shouldDrop(waiter))
    dropped.forEach((waiter) => settle(waiter, false))
  }

  return {
    acquire(sessionID, callID, signal) {
      if (signal?.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const waiter: Waiter = {
          sessionID,
          callID,
          state: 'queued',
          resolve(granted) {
            abortSubscription?.[Symbol.dispose]()
            resolve(granted)
          },
        }
        const abortSubscription = signal ? addAbortListener(signal, () => abort(waiter)) : undefined
        queue.push(waiter)
        grantFreeSlots()
      })
    },
    release() {
      activeSlots = Math.max(0, activeSlots - 1)
      grantFreeSlots()
    },
    setLimit(limit) {
      currentLimit = limit
      grantFreeSlots()
    },
    limit: () => currentLimit,
    cancelSession: (sessionID) => drop((waiter) => waiter.sessionID === sessionID),
    cancelCall: (callID) => drop((waiter) => waiter.callID === callID),
  }
}
