import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { parsePercentArgument, savePercent } from './command.ts'

async function createDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-compact-command-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('an empty argument asks to show the current threshold', () => {
  assert.deepEqual(parsePercentArgument(''), { kind: 'show' })
})

test('a whitespace-only argument asks to show the current threshold', () => {
  assert.deepEqual(parsePercentArgument('   '), { kind: 'show' })
})

test('the word off in lower case turns the threshold off', () => {
  assert.deepEqual(parsePercentArgument('off'), { kind: 'off' })
})

test('the word OFF in upper case turns the threshold off', () => {
  assert.deepEqual(parsePercentArgument('OFF'), { kind: 'off' })
})

test('a whole percentage surrounded by spaces sets the threshold', () => {
  assert.deepEqual(parsePercentArgument(' 50 '), { kind: 'set', percent: 50 })
})

test('the minimum percentage of 1 is accepted', () => {
  assert.deepEqual(parsePercentArgument('1'), { kind: 'set', percent: 1 })
})

test('the maximum percentage of 100 is accepted', () => {
  assert.deepEqual(parsePercentArgument('100'), { kind: 'set', percent: 100 })
})

test('zero is rejected as a percentage', () => {
  assert.deepEqual(parsePercentArgument('0'), { kind: 'invalid' })
})

test('a percentage with a percent sign is rejected', () => {
  assert.deepEqual(parsePercentArgument('50%'), { kind: 'invalid' })
})

test('a hexadecimal number is rejected', () => {
  assert.deepEqual(parsePercentArgument('0x32'), { kind: 'invalid' })
})

test('exponent notation is rejected', () => {
  assert.deepEqual(parsePercentArgument('1e1'), { kind: 'invalid' })
})

test('a leading plus sign is rejected', () => {
  assert.deepEqual(parsePercentArgument('+50'), { kind: 'invalid' })
})

test('saving to a missing config file creates it with only the threshold key', async (t) => {
  const path = join(await createDirectory(t), 'config.json')

  await savePercent(path, 50)

  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { compactAtPercentOfInputLimit: 50 })
})

test('saving the threshold keeps every other key and its value', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(
    path,
    JSON.stringify({ compactOnPlanSave: false, confirmationTimeoutSeconds: 60, extra: { a: 1 } }),
  )

  await savePercent(path, 75)

  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    compactOnPlanSave: false,
    confirmationTimeoutSeconds: 60,
    extra: { a: 1 },
    compactAtPercentOfInputLimit: 75,
  })
})

test('saving the threshold writes the file with two-space indentation and a trailing newline', async (t) => {
  const path = join(await createDirectory(t), 'config.json')

  await savePercent(path, 50)

  assert.equal(await readFile(path, 'utf8'), '{\n  "compactAtPercentOfInputLimit": 50\n}\n')
})

test('saving to a file with invalid JSON throws an error naming the path', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, '{ "compactOnPlanSave": ')

  await assert.rejects(savePercent(path, 50), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.ok(error.message.startsWith(`${path} is not valid JSON (`), error.message)
    assert.ok(error.message.endsWith(')'), error.message)
    return true
  })
})

test('saving to a file with invalid JSON leaves the file byte-identical', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  const original = '{ "compactOnPlanSave": '
  await writeFile(path, original)

  await savePercent(path, 50).catch(() => undefined)

  assert.equal(await readFile(path, 'utf8'), original)
})

test('saving to a file whose top-level value is an array throws an error naming the path', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, '[]')

  await assert.rejects(savePercent(path, 50), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, `the top-level value of ${path} must be a JSON object`)
    return true
  })
})

test('saving to a file whose top-level value is an array leaves the file unchanged', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, '[]')

  await savePercent(path, 50).catch(() => undefined)

  assert.equal(await readFile(path, 'utf8'), '[]')
})

test('turning the threshold off writes null for the threshold key', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, JSON.stringify({ compactAtPercentOfInputLimit: 50 }))

  await savePercent(path, null)

  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { compactAtPercentOfInputLimit: null })
})
