import { readFile } from 'node:fs/promises'

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 300_000

export interface AutoCompactConfig {
  readonly compactOnPlanSave: boolean
  readonly compactAtPercentOfInputLimit: number | null
  readonly confirmationTimeoutMs: number
}

type ConfigLogger = (message: string) => void

function defaultConfig(): AutoCompactConfig {
  return {
    compactOnPlanSave: true,
    compactAtPercentOfInputLimit: null,
    confirmationTimeoutMs: DEFAULT_CONFIRMATION_TIMEOUT_MS,
  }
}

export async function loadAutoCompactConfig(
  path: string,
  log: ConfigLogger,
): Promise<AutoCompactConfig> {
  const text = await readConfigText(path, log)
  if (text === undefined) {
    return defaultConfig()
  }
  const document = parseConfigDocument(text, path, log)
  if (document === undefined) {
    return defaultConfig()
  }
  return {
    compactOnPlanSave: readCompactOnPlanSave(document, path, log),
    compactAtPercentOfInputLimit: readCompactAtPercent(document, path, log),
    confirmationTimeoutMs: readConfirmationTimeoutMs(document, path, log),
  }
}

function readConfirmationTimeoutMs(
  document: Record<string, unknown>,
  path: string,
  log: ConfigLogger,
): number {
  if (!Object.hasOwn(document, 'confirmationTimeoutSeconds')) {
    return DEFAULT_CONFIRMATION_TIMEOUT_MS
  }
  const value = document.confirmationTimeoutSeconds
  if (isValidTimeoutSeconds(value)) {
    return value * 1000
  }
  log(invalidKeyMessage('confirmationTimeoutSeconds', path, value, 'the default 300'))
  return DEFAULT_CONFIRMATION_TIMEOUT_MS
}

function isValidTimeoutSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

async function readConfigText(path: string, log: ConfigLogger): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      log(ignoredFileMessage(path, `it could not be read (${errorMessage(error)})`))
    }
    return undefined
  }
}

function parseConfigDocument(
  text: string,
  path: string,
  log: ConfigLogger,
): Record<string, unknown> | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    log(ignoredFileMessage(path, `it is not valid JSON (${errorMessage(error)})`))
    return undefined
  }
  if (!isPlainObject(parsed)) {
    log(ignoredFileMessage(path, 'the top-level value must be a JSON object'))
    return undefined
  }
  return parsed
}

function ignoredFileMessage(path: string, reason: string): string {
  return `auto-compact: ignoring ${path}: ${reason}. Using the defaults.`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCompactOnPlanSave(
  document: Record<string, unknown>,
  path: string,
  log: ConfigLogger,
): boolean {
  if (!Object.hasOwn(document, 'compactOnPlanSave')) {
    return true
  }
  const value = document.compactOnPlanSave
  if (typeof value === 'boolean') {
    return value
  }
  log(invalidKeyMessage('compactOnPlanSave', path, value, 'the default true'))
  return true
}

function readCompactAtPercent(
  document: Record<string, unknown>,
  path: string,
  log: ConfigLogger,
): number | null {
  if (!Object.hasOwn(document, 'compactAtPercentOfInputLimit')) {
    return null
  }
  const value = document.compactAtPercentOfInputLimit
  if (value === null || isValidPercent(value)) {
    return value
  }
  log(
    invalidKeyMessage(
      'compactAtPercentOfInputLimit',
      path,
      value,
      'the default null (threshold off)',
    ),
  )
  return null
}

function isValidPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
}

function invalidKeyMessage(key: string, path: string, value: unknown, fallback: string): string {
  const received = JSON.stringify(value)
  return `auto-compact: ignoring ${key} in ${path}: received ${received}. Using ${fallback}.`
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
