import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { loadAutoCompactConfig, type AutoCompactConfig } from './config.ts'

const DEFAULT_CONFIG: AutoCompactConfig = {
  compactOnPlanSave: true,
  compactAtPercentOfInputLimit: null,
  confirmationTimeoutMs: 300_000,
}

async function createDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-compact-config-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function writeConfigFile(t: TestContext, contents: string): Promise<string> {
  const path = join(await createDirectory(t), 'config.json')
  await writeFile(path, contents)
  return path
}

function recordLogs(): { readonly messages: string[]; readonly log: (message: string) => void } {
  const messages: string[] = []
  return { messages, log: (message: string) => messages.push(message) }
}

function assertSingleLogNames(messages: string[], key: string, path: string): void {
  assert.equal(messages.length, 1)
  assert.ok(messages[0].includes(key), `log names ${key}`)
  assert.ok(messages[0].includes(path), `log names ${path}`)
}

test('a missing config file gives the defaults without logging', async (t) => {
  const path = join(await createDirectory(t), 'config.json')
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.deepEqual(messages, [])
})

test('invalid JSON gives the defaults with one log line naming the file', async (t) => {
  const path = await writeConfigFile(t, '{ "compactOnPlanSave": ')
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.equal(messages.length, 1)
  assert.ok(messages[0].includes(path))
})

test('an invalid compactOnPlanSave falls back to true while other keys are kept', async (t) => {
  const path = await writeConfigFile(
    t,
    JSON.stringify({ compactOnPlanSave: 'no', compactAtPercentOfInputLimit: 50, confirmationTimeoutSeconds: 60 }),
  )
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, {
    compactOnPlanSave: true,
    compactAtPercentOfInputLimit: 50,
    confirmationTimeoutMs: 60_000,
  })
  assertSingleLogNames(messages, 'compactOnPlanSave', path)
})

test('a non-numeric compactAtPercentOfInputLimit switches the threshold off while other keys are kept', async (t) => {
  const path = await writeConfigFile(
    t,
    JSON.stringify({ compactOnPlanSave: false, compactAtPercentOfInputLimit: '50', confirmationTimeoutSeconds: 60 }),
  )
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, {
    compactOnPlanSave: false,
    compactAtPercentOfInputLimit: null,
    confirmationTimeoutMs: 60_000,
  })
  assertSingleLogNames(messages, 'compactAtPercentOfInputLimit', path)
})

test('an invalid confirmationTimeoutSeconds falls back to 300 seconds while other keys are kept', async (t) => {
  const path = await writeConfigFile(
    t,
    JSON.stringify({ compactOnPlanSave: false, compactAtPercentOfInputLimit: 40, confirmationTimeoutSeconds: 'abc' }),
  )
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, {
    compactOnPlanSave: false,
    compactAtPercentOfInputLimit: 40,
    confirmationTimeoutMs: 300_000,
  })
  assertSingleLogNames(messages, 'confirmationTimeoutSeconds', path)
})

test('an unreadable config path gives the defaults with one log line naming the file', async (t) => {
  const path = await createDirectory(t)
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.equal(messages.length, 1)
  assert.ok(messages[0].includes(path))
})

test('a fractional confirmationTimeoutSeconds falls back to 300 seconds', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ confirmationTimeoutSeconds: 1.5 }))
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.equal(config.confirmationTimeoutMs, 300_000)
  assertSingleLogNames(messages, 'confirmationTimeoutSeconds', path)
})

test('a null compactAtPercentOfInputLimit switches the threshold off without logging', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ compactAtPercentOfInputLimit: null }))
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.equal(config.compactAtPercentOfInputLimit, null)
  assert.deepEqual(messages, [])
})

test('a config file whose top-level value is not an object gives the defaults with one log line', async (t) => {
  for (const contents of ['[]', '42', 'null']) {
    const path = await writeConfigFile(t, contents)
    const { messages, log } = recordLogs()

    const config = await loadAutoCompactConfig(path, log)

    assert.deepEqual(config, DEFAULT_CONFIG, `top-level ${contents}`)
    assert.equal(messages.length, 1, `top-level ${contents}`)
    assert.ok(messages[0].includes(path), `top-level ${contents}`)
  }
})

test('a fractional compactAtPercentOfInputLimit is kept', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ compactAtPercentOfInputLimit: 37.5 }))
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.equal(config.compactAtPercentOfInputLimit, 37.5)
  assert.deepEqual(messages, [])
})

test('compactAtPercentOfInputLimit at the bounds 1 and 100 is kept', async (t) => {
  for (const percent of [1, 100]) {
    const path = await writeConfigFile(t, JSON.stringify({ compactAtPercentOfInputLimit: percent }))
    const { messages, log } = recordLogs()

    const config = await loadAutoCompactConfig(path, log)

    assert.equal(config.compactAtPercentOfInputLimit, percent, `bound ${percent}`)
    assert.deepEqual(messages, [], `bound ${percent}`)
  }
})

test('a compactAtPercentOfInputLimit outside 1 to 100 switches the threshold off with a log line', async (t) => {
  for (const percent of [0, 101]) {
    const path = await writeConfigFile(t, JSON.stringify({ compactAtPercentOfInputLimit: percent }))
    const { messages, log } = recordLogs()

    const config = await loadAutoCompactConfig(path, log)

    assert.equal(config.compactAtPercentOfInputLimit, null, `value ${percent}`)
    assertSingleLogNames(messages, 'compactAtPercentOfInputLimit', path)
  }
})

test('a confirmationTimeoutSeconds of 0 falls back to 300 seconds', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ confirmationTimeoutSeconds: 0 }))
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.equal(config.confirmationTimeoutMs, 300_000)
  assertSingleLogNames(messages, 'confirmationTimeoutSeconds', path)
})

test('unknown keys are ignored without logging', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ someUnknownKey: 5 }))
  const { messages, log } = recordLogs()

  const config = await loadAutoCompactConfig(path, log)

  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.deepEqual(messages, [])
})

test('an invalid key log line names the value received', async (t) => {
  const path = await writeConfigFile(t, JSON.stringify({ confirmationTimeoutSeconds: 'abc' }))
  const { messages, log } = recordLogs()

  await loadAutoCompactConfig(path, log)

  assert.ok(messages[0].includes('"abc"'), messages[0])
})
