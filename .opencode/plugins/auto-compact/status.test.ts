import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { markWatcherFailed, readWatcherFailed } from './status.ts'

async function createDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-compact-status-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('markWatcherFailed writes the JSON with two-space indentation and a trailing newline', async (t) => {
  const path = join(await createDirectory(t), 'status.json')

  await markWatcherFailed(path)

  assert.equal(await readFile(path, 'utf8'), '{\n  "thresholdWatcher": "failed"\n}\n')
})

test('readWatcherFailed is false when the status file is not valid JSON', async (t) => {
  const path = join(await createDirectory(t), 'status.json')
  await writeFile(path, '{ "thresholdWatcher": ')

  assert.equal(await readWatcherFailed(path), false)
})

test('readWatcherFailed is false when thresholdWatcher has another value', async (t) => {
  const path = join(await createDirectory(t), 'status.json')
  await writeFile(path, JSON.stringify({ thresholdWatcher: 'running' }))

  assert.equal(await readWatcherFailed(path), false)
})
