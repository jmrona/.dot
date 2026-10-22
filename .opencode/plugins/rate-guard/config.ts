import { readFile } from 'node:fs/promises'

export const LIMIT_KEY = 'maxConcurrentHardSubagents'
export const DEFAULT_LIMIT = 2
export const MIN_LIMIT = 1
export const MAX_LIMIT = 10

export function isValidLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_LIMIT && value <= MAX_LIMIT
}

export async function readConfigDocument(path: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`the top-level value of ${path} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

export async function loadHardLimit(path: string, warn: (message: string) => void): Promise<number> {
  try {
    const value = (await readConfigDocument(path))[LIMIT_KEY]
    if (isValidLimit(value)) {
      return value
    }
    warn(invalidLimitNotice(path, `${LIMIT_KEY} is ${JSON.stringify(value)}`))
  } catch (error: unknown) {
    warn(invalidLimitNotice(path, error instanceof Error ? error.message : String(error)))
  }
  return DEFAULT_LIMIT
}

function invalidLimitNotice(path: string, reason: string): string {
  return `rate-guard: ${reason} in ${path}. Set ${LIMIT_KEY} to a whole number from ${MIN_LIMIT} to ${MAX_LIMIT}. Using ${DEFAULT_LIMIT}.`
}
