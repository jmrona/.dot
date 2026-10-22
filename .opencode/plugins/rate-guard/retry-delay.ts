const BASE_FALLBACK_MS = 5000
const MAX_FALLBACK_MS = 60_000
const FIRST_RETRY_ATTEMPT = 2
const MAX_JITTER_RATIO = 0.2
const HINT_PATTERN = /try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i

export interface RetryDecision {
  readonly retry: boolean
  readonly delay?: number
}

export interface RetryEvent {
  readonly attempt: number
  readonly error: {
    readonly type?: string
    readonly status?: number
    readonly message?: string
  }
  decision: RetryDecision
}

export function applyRateLimitDecision(event: RetryEvent, random: () => number): void {
  if (!event.decision.retry || !isRateLimit(event.error)) {
    return
  }
  const base = hintedDelayMs(event.error.message) ?? fallbackDelayMs(event.attempt)
  event.decision = { retry: true, delay: Math.round(base + random() * MAX_JITTER_RATIO * base) }
}

function isRateLimit(error: RetryEvent['error']): boolean {
  return error.status === 429 || error.type === 'provider.rate-limit'
}

function hintedDelayMs(message: string | undefined): number | undefined {
  const match = HINT_PATTERN.exec(message ?? '')
  if (match === null) {
    return undefined
  }
  const amount = Number(match[1])
  return match[2]?.toLowerCase() === 'ms' ? amount : amount * 1000
}

function fallbackDelayMs(attempt: number): number {
  return Math.min(MAX_FALLBACK_MS, BASE_FALLBACK_MS * 2 ** (attempt - FIRST_RETRY_ATTEMPT))
}
