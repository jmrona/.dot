import { readFile, rm, writeFile } from 'node:fs/promises'

const WATCHER_KEY = 'thresholdWatcher'
const FAILED_VALUE = 'failed'

export async function markWatcherFailed(statusPath: string): Promise<void> {
  await writeFile(statusPath, `${JSON.stringify({ [WATCHER_KEY]: FAILED_VALUE }, null, 2)}\n`)
}

export async function clearWatcherStatus(statusPath: string): Promise<void> {
  try {
    await rm(statusPath)
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      throw error
    }
  }
}

export async function readWatcherFailed(statusPath: string): Promise<boolean> {
  try {
    return isFailedStatus(JSON.parse(await readFile(statusPath, 'utf8')))
  } catch {
    return false
  }
}

function isFailedStatus(status: unknown): boolean {
  return (
    typeof status === 'object' &&
    status !== null &&
    WATCHER_KEY in status &&
    status[WATCHER_KEY] === FAILED_VALUE
  )
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
