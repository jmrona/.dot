import { writeFile } from 'node:fs/promises'

import { isValidLimit, LIMIT_KEY, readConfigDocument } from './config.ts'

export type LimitArgument =
  | { readonly kind: 'show' }
  | { readonly kind: 'set'; readonly limit: number }
  | { readonly kind: 'invalid' }

const WHOLE_NUMBER_PATTERN = /^\d+$/

export function parseLimitArgument(text: string): LimitArgument {
  const trimmed = text.trim()
  if (trimmed === '') {
    return { kind: 'show' }
  }
  const limit = WHOLE_NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : Number.NaN
  return isValidLimit(limit) ? { kind: 'set', limit } : { kind: 'invalid' }
}

export async function saveLimit(path: string, limit: number): Promise<void> {
  const document = await readConfigDocument(path).catch(replaceMissingDocument)
  document[LIMIT_KEY] = limit
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`)
}

function replaceMissingDocument(error: unknown): Record<string, unknown> {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    return {}
  }
  throw error
}
