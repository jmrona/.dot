import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

import {
  attachSession,
  clearProgressFiles,
  createProgressRecorder,
  finishGate,
  finishStep,
  progressFilePath,
  startGate,
  startStep,
  startWave,
} from './progress.ts'
import type { StepKey, StepStart, WaveProgress } from './progress.ts'

const implementStep: StepStart = {
  taskID: 'task-a',
  phase: 'implement',
  attempt: 1,
  title: 'Task A',
  model: 'model-one',
}
const implementKey: StepKey = { taskID: 'task-a', phase: 'implement', attempt: 1 }
const reviewKey: StepKey = { taskID: 'task-a', phase: 'review', attempt: 1 }

const createdDirectories: string[] = []

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'implementer-progress-'))
  createdDirectories.push(directory)
  return directory
}

async function readProgress(path: string): Promise<WaveProgress> {
  return JSON.parse(await readFile(path, 'utf8')) as WaveProgress
}

async function waitForFile(path: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      await sleep(10)
    }
  }
  throw new Error(`The file ${path} never appeared`)
}

function withStarted(): WaveProgress {
  return startStep(startWave('root', 100), implementStep, 110)
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('progressFilePath', () => {
  it('joins the directory and the root session ID with a json extension', () => {
    assert.equal(progressFilePath('/state', 'ses_1'), join('/state', 'ses_1.json'))
  })
})

describe('startWave', () => {
  it('creates a running wave with no steps and a pending gate', () => {
    assert.deepEqual(startWave('root', 100), {
      version: 1,
      rootSessionID: 'root',
      startedAt: 100,
      status: 'running',
      steps: [],
      gate: { startedAt: null, endedAt: null, state: 'pending' },
    })
  })
})

describe('startStep', () => {
  it('appends a running step without a session', () => {
    assert.deepEqual(withStarted().steps, [
      { ...implementStep, sessionID: null, startedAt: 110, endedAt: null, state: 'running' },
    ])
  })

  it('does not mutate the input progress', () => {
    const before = startWave('root', 100)
    const snapshot = JSON.stringify(before)

    const after = startStep(before, implementStep, 110)

    assert.notEqual(after, before)
    assert.equal(JSON.stringify(before), snapshot)
  })
})

describe('attachSession', () => {
  it('sets the session ID on the matching step only', () => {
    const progress = startStep(withStarted(), { ...implementStep, phase: 'review' }, 120)

    const attached = attachSession(progress, reviewKey, 'child-1')

    assert.deepEqual(
      attached.steps.map((step) => step.sessionID),
      [null, 'child-1'],
    )
  })

  it('does not match a step with another attempt', () => {
    const progress = withStarted()

    assert.equal(attachSession(progress, { ...implementKey, attempt: 2 }, 'child-1'), progress)
  })

  it('does not mutate the input progress', () => {
    const before = withStarted()
    const snapshot = JSON.stringify(before)

    attachSession(before, implementKey, 'child-1')

    assert.equal(JSON.stringify(before), snapshot)
  })
})

describe('finishStep', () => {
  it('sets the state and end time on the matching step', () => {
    const finished = finishStep(withStarted(), implementKey, 'done', 150)

    assert.equal(finished.steps[0]?.state, 'done')
    assert.equal(finished.steps[0]?.endedAt, 150)
  })

  it('records a failed step', () => {
    assert.equal(finishStep(withStarted(), implementKey, 'failed', 150).steps[0]?.state, 'failed')
  })

  it('returns the progress unchanged when no step matches', () => {
    const progress = withStarted()

    assert.equal(finishStep(progress, reviewKey, 'done', 150), progress)
  })

  it('does not mutate the input progress', () => {
    const before = withStarted()
    const snapshot = JSON.stringify(before)

    finishStep(before, implementKey, 'done', 150)

    assert.equal(JSON.stringify(before), snapshot)
  })
})

describe('gate transitions', () => {
  it('startGate marks the gate running from the given time', () => {
    assert.deepEqual(startGate(startWave('root', 100), 200).gate, {
      startedAt: 200,
      endedAt: null,
      state: 'running',
    })
  })

  it('finishGate keeps the start time and records the end time and state', () => {
    const finished = finishGate(startGate(startWave('root', 100), 200), 'passed', 300)

    assert.deepEqual(finished.gate, { startedAt: 200, endedAt: 300, state: 'passed' })
  })

  it('finishGate leaves the start time null when the gate never started', () => {
    const finished = finishGate(startWave('root', 100), 'skipped', 300)

    assert.deepEqual(finished.gate, { startedAt: null, endedAt: 300, state: 'skipped' })
  })

  it('finishGate does not mutate the input progress', () => {
    const before = startGate(startWave('root', 100), 200)
    const snapshot = JSON.stringify(before)

    finishGate(before, 'failed', 300)

    assert.equal(JSON.stringify(before), snapshot)
  })
})

describe('createProgressRecorder', () => {
  it('writes the initial state without any update', async () => {
    const path = join(await createDirectory(), 'nested', 'root.json')

    createProgressRecorder(path, startWave('root', 100), () => undefined)

    assert.equal((JSON.parse(await waitForFile(path)) as WaveProgress).rootSessionID, 'root')
  })

  it('writes two-space indented JSON with a trailing newline', async () => {
    const path = join(await createDirectory(), 'root.json')
    const initial = startWave('root', 100)
    const recorder = createProgressRecorder(path, initial, () => undefined)

    await recorder.update((progress) => progress)

    assert.equal(await readFile(path, 'utf8'), `${JSON.stringify(initial, null, 2)}\n`)
  })

  it('applies each update to the latest state', async () => {
    const path = join(await createDirectory(), 'root.json')
    const recorder = createProgressRecorder(path, startWave('root', 100), () => undefined)

    await recorder.update((progress) => startStep(progress, implementStep, 110))
    await recorder.update((progress) => finishStep(progress, implementKey, 'done', 120))

    const written = await readProgress(path)
    assert.equal(written.steps[0]?.state, 'done')
  })

  it('leaves the last state in the file when updates are not awaited', async () => {
    const path = join(await createDirectory(), 'root.json')
    const recorder = createProgressRecorder(path, startWave('root', 100), () => undefined)

    const updates = [1, 2, 3, 4, 5].map((attempt) =>
      recorder.update((progress) => startStep(progress, { ...implementStep, attempt }, attempt)),
    )
    await Promise.all(updates)

    assert.equal((await readProgress(path)).steps.length, 5)
  })

  it('leaves no temporary files behind after writing', async () => {
    const directory = await createDirectory()
    const recorder = createProgressRecorder(join(directory, 'root.json'), startWave('root', 100), () => undefined)

    await recorder.update((progress) => startGate(progress, 200))

    assert.deepEqual(await readdir(directory), ['root.json'])
  })

  it('warns with the path and never rejects when a write fails', async () => {
    const directory = await createDirectory()
    const blocker = join(directory, 'blocker')
    await writeFile(blocker, 'a file where a directory is needed')
    const path = join(blocker, 'root.json')
    const warnings: string[] = []
    const recorder = createProgressRecorder(path, startWave('root', 100), (message) => warnings.push(message))

    await recorder.update((progress) => startGate(progress, 200))

    assert.ok(warnings.length > 0)
    assert.ok(warnings.every((message) => message.includes(path)))
  })

  it('removes the file on remove', async () => {
    const directory = await createDirectory()
    const path = join(directory, 'root.json')
    const recorder = createProgressRecorder(path, startWave('root', 100), () => undefined)
    await recorder.update((progress) => progress)

    await recorder.remove()

    assert.deepEqual(await readdir(directory), [])
  })

  it('writes nothing for updates made after remove', async () => {
    const directory = await createDirectory()
    const recorder = createProgressRecorder(join(directory, 'root.json'), startWave('root', 100), () => undefined)
    await recorder.remove()

    await recorder.update((progress) => startGate(progress, 200))

    assert.deepEqual(await readdir(directory), [])
  })

  it('waits for pending writes before removing the file', async () => {
    const directory = await createDirectory()
    const recorder = createProgressRecorder(join(directory, 'root.json'), startWave('root', 100), () => undefined)
    void recorder.update((progress) => startGate(progress, 200))

    await recorder.remove()

    assert.deepEqual(await readdir(directory), [])
  })

  it('warns with the path and never rejects when remove fails', async () => {
    const directory = await createDirectory()
    const path = join(directory, 'root.json')
    await mkdir(path)
    await writeFile(join(path, 'inner'), 'content')
    const warnings: string[] = []
    const recorder = createProgressRecorder(path, startWave('root', 100), (message) => warnings.push(message))

    await recorder.remove()

    assert.ok(warnings.at(-1)?.includes(path))
  })
})

describe('clearProgressFiles', () => {
  it('removes every json and temporary file', async () => {
    const directory = await createDirectory()
    await writeFile(join(directory, 'one.json'), '{}')
    await writeFile(join(directory, 'two.json.123.1.tmp'), '{}')
    await writeFile(join(directory, 'keep.txt'), 'kept')

    await clearProgressFiles(directory, () => undefined)

    assert.deepEqual(await readdir(directory), ['keep.txt'])
  })

  it('accepts a missing directory without warning', async () => {
    const directory = await createDirectory()
    const warnings: string[] = []

    await clearProgressFiles(join(directory, 'missing'), (message) => warnings.push(message))

    assert.deepEqual(warnings, [])
  })

  it('warns with the path and never rejects when the directory cannot be read', async () => {
    const directory = await createDirectory()
    const file = join(directory, 'plain-file')
    await writeFile(file, 'not a directory')
    const warnings: string[] = []

    await clearProgressFiles(file, (message) => warnings.push(message))

    assert.ok(warnings[0]?.includes(file))
  })
})
