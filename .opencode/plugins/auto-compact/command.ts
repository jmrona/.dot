import { readFile, writeFile } from 'node:fs/promises'

const THRESHOLD_KEY = 'compactAtPercentOfInputLimit'

export type PercentArgument =
  | { readonly kind: 'show' }
  | { readonly kind: 'off' }
  | { readonly kind: 'set'; readonly percent: number }
  | { readonly kind: 'invalid' }

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/
const MIN_PERCENT = 1
const MAX_PERCENT = 100

export function parsePercentArgument(text: string): PercentArgument {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { kind: 'show' }
  }
  if (trimmed.toLowerCase() === 'off') {
    return { kind: 'off' }
  }
  return parseNumericPercent(trimmed)
}

function parseNumericPercent(trimmed: string): PercentArgument {
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return { kind: 'invalid' }
  }
  const percent = Number(trimmed)
  if (percent < MIN_PERCENT || percent > MAX_PERCENT) {
    return { kind: 'invalid' }
  }
  return { kind: 'set', percent }
}

export async function savePercent(configPath: string, percent: number | null): Promise<void> {
  const document = await readConfigDocument(configPath)
  document[THRESHOLD_KEY] = percent
  await writeFile(configPath, `${JSON.stringify(document, null, 2)}\n`)
}

async function readConfigDocument(configPath: string): Promise<Record<string, unknown>> {
  const text = await readConfigText(configPath)
  if (text === undefined) {
    return {}
  }
  return parseConfigDocument(text, configPath)
}

async function readConfigText(configPath: string): Promise<string | undefined> {
  try {
    return await readFile(configPath, 'utf8')
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined
    }
    throw error
  }
}

function parseConfigDocument(text: string, configPath: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`${configPath} is not valid JSON (${errorMessage(error)})`)
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`the top-level value of ${configPath} must be a JSON object`)
  }
  return parsed
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
