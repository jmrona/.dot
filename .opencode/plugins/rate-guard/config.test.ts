import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { parseLimitArgument, saveLimit } from './command.ts'
import { loadHardLimit } from './config.ts'

async function createConfigPath(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rate-guard-config-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'config.json')
}

test('a valid limit in the config file is used', async (t) => {
  const path = await createConfigPath(t)
  await writeFile(path, '{ "maxConcurrentHardSubagents": 4 }')
  assert.equal(await loadHardLimit(path, () => {}), 4)
})

test('a missing config file gives the default limit of 2 and a warning', async (t) => {
  const warnings: string[] = []
  const limit = await loadHardLimit(await createConfigPath(t), (message) => warnings.push(message))
  assert.deepEqual([limit, warnings.length], [2, 1])
})

test('a non-integer limit gives the default limit and a warning naming the file', async (t) => {
  const path = await createConfigPath(t)
  await writeFile(path, '{ "maxConcurrentHardSubagents": "many" }')
  const warnings: string[] = []
  const limit = await loadHardLimit(path, (message) => warnings.push(message))
  assert.deepEqual([limit, warnings[0]?.includes(path)], [2, true])
})

test('a limit above 10 gives the default limit', async (t) => {
  const path = await createConfigPath(t)
  await writeFile(path, '{ "maxConcurrentHardSubagents": 11 }')
  assert.equal(await loadHardLimit(path, () => {}), 2)
})

test('a config file that is not JSON gives the default limit and a warning', async (t) => {
  const path = await createConfigPath(t)
  await writeFile(path, 'not json')
  const warnings: string[] = []
  const limit = await loadHardLimit(path, (message) => warnings.push(message))
  assert.deepEqual([limit, warnings.length], [2, 1])
})

test('an empty argument asks to show the current limit', () => {
  assert.deepEqual(parseLimitArgument('  '), { kind: 'show' })
})

test('a whole number from 1 to 10 sets the limit', () => {
  assert.deepEqual(parseLimitArgument(' 3 '), { kind: 'set', limit: 3 })
})

test('the bounds 1 and 10 are accepted', () => {
  assert.deepEqual(
    [parseLimitArgument('1'), parseLimitArgument('10')],
    [
      { kind: 'set', limit: 1 },
      { kind: 'set', limit: 10 },
    ],
  )
})

test('zero, eleven, decimals and words are rejected', () => {
  const kinds = ['0', '11', '2.5', 'two', '-1', '1e1'].map((text) => parseLimitArgument(text).kind)
  assert.deepEqual(kinds, ['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid'])
})

test('saving a limit writes it to the config file', async (t) => {
  const path = await createConfigPath(t)
  await saveLimit(path, 6)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).maxConcurrentHardSubagents, 6)
})

test('saving a limit keeps other keys in the config file', async (t) => {
  const path = await createConfigPath(t)
  await writeFile(path, '{ "maxConcurrentHardSubagents": 2, "other": true }')
  await saveLimit(path, 3)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).other, true)
})
