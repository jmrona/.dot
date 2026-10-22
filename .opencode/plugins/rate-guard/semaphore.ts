interface Waiter {
  readonly sessionID: string
  readonly callID: string
  readonly settle: (granted: boolean) => void
}

export interface SlotSemaphore {
  acquire(sessionID: string, callID: string): Promise<boolean>
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

  async function admit(waiter: Waiter): Promise<void> {
    const isAlive = await isSessionAlive(waiter.sessionID).catch(() => false)
    if (isAlive) {
      waiter.settle(true)
      return
    }
    activeSlots -= 1
    waiter.settle(false)
    grantFreeSlots()
  }

  function grantFreeSlots(): void {
    while (activeSlots < currentLimit && queue.length > 0) {
      const next = queue.shift() as Waiter
      activeSlots += 1
      void admit(next)
    }
  }

  function drop(shouldDrop: (waiter: Waiter) => boolean): void {
    const dropped = queue.filter(shouldDrop)
    queue = queue.filter((waiter) => !shouldDrop(waiter))
    dropped.forEach((waiter) => waiter.settle(false))
  }

  return {
    acquire(sessionID, callID) {
      return new Promise<boolean>((settle) => {
        queue.push({ sessionID, callID, settle })
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
