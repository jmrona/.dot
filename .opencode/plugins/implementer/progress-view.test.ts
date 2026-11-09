import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import {
  PROGRESS_VERSION,
  attachSession,
  finishGate,
  finishStep,
  startGate,
  startStep,
  startWave,
} from './progress.ts'
import type { ProgressPhase, StepKey, StepStart, WaveProgress } from './progress.ts'
import {
  barLabel,
  collectSessionTokens,
  formatDuration,
  formatTokens,
  gateRow,
  phaseRows,
  readWaveProgress,
  rootSessionOf,
  sessionTokens,
  stepRows,
} from './progress-view.ts'
import type { ProgressData } from './progress-view.ts'

let directory = ''

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'implementer-progress-view-'))
})

after(async () => {
  await rm(directory, { recursive: true, force: true })
})

function startOf(taskID: string, phase: ProgressPhase = 'implement', attempt = 1): StepStart {
  return { taskID, phase, attempt, title: `Title of ${taskID}`, model: 'model-one' }
}

function keyOf(start: StepStart): StepKey {
  return { taskID: start.taskID, phase: start.phase, attempt: start.attempt }
}

function oneStepWave(): WaveProgress {
  return startStep(startWave('root', 100), startOf('task-a'), 110)
}

function tokensOf(input: number): unknown {
  return { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
}

function waveWithSteps(stepCount: number, finishedCount: number): WaveProgress {
  let progress = startWave('root', 0)
  for (let index = 0; index < stepCount; index += 1) {
    const start = startOf(`task-${index}`)
    progress = attachSession(startStep(progress, start, 0), keyOf(start), `session-${index}`)
    if (index < finishedCount) {
      progress = finishStep(progress, keyOf(start), 'done', 0)
    }
  }
  return progress
}

function createData(
  sessions: Readonly<Record<string, unknown>>,
  messages: Readonly<Record<string, unknown>> = {},
): ProgressData {
  return {
    session: {
      async get(sessionID: string): Promise<unknown> {
        return sessions[sessionID]
      },
      message: {
        async list(sessionID: string): Promise<unknown> {
          return messages[sessionID]
        },
      },
    },
  }
}

function createFailingData(): ProgressData {
  return {
    session: {
      get(): unknown {
        throw new Error('lookup failed')
      },
      message: {
        list(): unknown {
          throw new Error('listing failed')
        },
      },
    },
  }
}

async function writeFixture(name: string, text: string): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, text)
  return path
}

describe('readWaveProgress', () => {
  it('returns the progress stored in the file', async () => {
    const progress = oneStepWave()
    const path = await writeFixture('valid.json', JSON.stringify(progress))
    assert.deepEqual(await readWaveProgress(path), progress)
  })

  it('returns undefined when the file does not exist', async () => {
    assert.equal(await readWaveProgress(join(directory, 'missing.json')), undefined)
  })

  it('returns undefined when the file holds invalid JSON', async () => {
    const path = await writeFixture('invalid.json', '{"version": 1,')
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when the progress version differs from the current version', async () => {
    const path = await writeFixture(
      'other-version.json',
      JSON.stringify({ ...oneStepWave(), version: PROGRESS_VERSION + 1 }),
    )
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when the root session identifier is not a string', async () => {
    const path = await writeFixture('root-id.json', JSON.stringify({ ...oneStepWave(), rootSessionID: 7 }))
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when the steps value is not an array', async () => {
    const path = await writeFixture('steps.json', JSON.stringify({ ...oneStepWave(), steps: 'none' }))
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when a step phase is not a known phase', async () => {
    const progress = oneStepWave()
    const path = await writeFixture(
      'phase.json',
      JSON.stringify({ ...progress, steps: [{ ...progress.steps[0], phase: 'deploy' }] }),
    )
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when a step session identifier is neither a string nor null', async () => {
    const progress = oneStepWave()
    const path = await writeFixture(
      'session.json',
      JSON.stringify({ ...progress, steps: [{ ...progress.steps[0], sessionID: 5 }] }),
    )
    assert.equal(await readWaveProgress(path), undefined)
  })

  it('returns undefined when the gate state is not a known state', async () => {
    const path = await writeFixture(
      'gate.json',
      JSON.stringify({ ...oneStepWave(), gate: { startedAt: null, endedAt: null, state: 'paused' } }),
    )
    assert.equal(await readWaveProgress(path), undefined)
  })
})

describe('rootSessionOf', () => {
  it('returns the session itself when it has no parent', async () => {
    assert.equal(await rootSessionOf(createData({ root: {} }), 'root'), 'root')
  })

  it('returns the top of the parent chain', async () => {
    const data = createData({
      child: { parentID: 'middle' },
      middle: { parentID: 'root' },
      root: {},
    })
    assert.equal(await rootSessionOf(data, 'child'), 'root')
  })

  it('returns the session itself when the lookup throws', async () => {
    assert.equal(await rootSessionOf(createFailingData(), 'child'), 'child')
  })

  it('returns the parent identifier when the parent session cannot be read', async () => {
    const data = createData({ child: { parentID: 'missing' } })
    assert.equal(await rootSessionOf(data, 'child'), 'missing')
  })

  it('stops after ten parent lookups when the chain is longer', async () => {
    const sessions: Record<string, unknown> = {}
    for (let index = 0; index < 15; index += 1) {
      sessions[`session-${index}`] = { parentID: `session-${index + 1}` }
    }
    assert.equal(await rootSessionOf(createData(sessions), 'session-0'), 'session-10')
  })
})

describe('sessionTokens', () => {
  it('sums the context tokens of assistant messages that carry tokens', async () => {
    const messages = [
      { type: 'user' },
      { type: 'assistant', tokens: tokensOf(100) },
      { type: 'assistant', tokens: tokensOf(250) },
      { type: 'assistant' },
    ]
    assert.equal(await sessionTokens(createData({}, { 'session-a': messages }), 'session-a'), 350)
  })

  it('returns undefined when listing the messages throws', async () => {
    assert.equal(await sessionTokens(createFailingData(), 'session-a'), undefined)
  })
})

describe('collectSessionTokens', () => {
  it('maps each step session to its total and omits sessions without a readable total', async () => {
    let progress = startStep(startWave('root', 0), startOf('task-a'), 0)
    progress = attachSession(progress, keyOf(startOf('task-a')), 'known')
    progress = startStep(progress, startOf('task-b'), 0)
    progress = attachSession(progress, keyOf(startOf('task-b')), 'unreadable')
    progress = startStep(progress, startOf('task-c'), 0)
    const data = createData({}, { known: [{ type: 'assistant', tokens: tokensOf(640) }] })

    const totals = await collectSessionTokens(data, progress)

    assert.deepEqual(Object.fromEntries(totals), { known: 640 })
  })
})

describe('formatDuration', () => {
  it('shows whole seconds below one minute', () => {
    assert.equal(formatDuration(52_999), '52s')
  })

  it('shows zero seconds for a zero duration', () => {
    assert.equal(formatDuration(0), '0s')
  })

  it('pads the seconds when showing minutes', () => {
    assert.equal(formatDuration(65_000), '1m05s')
    assert.equal(formatDuration(272_000), '4m32s')
  })

  it('shows hours with padded minutes', () => {
    assert.equal(formatDuration(3_720_000), '1h02m')
  })
})

describe('formatTokens', () => {
  it('shows a dash when the token total is unknown', () => {
    assert.equal(formatTokens(undefined), '- tok')
  })

  it('shows the exact count below one thousand', () => {
    assert.equal(formatTokens(999), '999 tok')
  })

  it('shows thousands with one decimal place', () => {
    assert.equal(formatTokens(103_100), '103.1k tok')
  })

  it('shows millions with one decimal place', () => {
    assert.equal(formatTokens(1_400_000), '1.4m tok')
  })
})

describe('barLabel', () => {
  it('shows the wave bar, finished count, duration and total tokens', () => {
    const tokens = new Map([
      ['session-0', 400_000],
      ['session-1', 240_000],
    ])
    assert.equal(
      barLabel(waveWithSteps(14, 9), tokens, 130_000),
      'implementation-wave ======---- 9/14 2m10s 640.0k tok',
    )
  })

  it('shows no total tokens when no step session has a known total', () => {
    assert.equal(barLabel(waveWithSteps(2, 1), new Map(), 0), 'implementation-wave =====----- 1/2 0s - tok')
  })

  it('shows an empty bar and no total tokens when the wave has no steps', () => {
    assert.equal(barLabel(waveWithSteps(0, 0), new Map(), 5_000), 'implementation-wave ---------- 0/0 5s - tok')
  })
})

describe('phaseRows', () => {
  it('lists the implement, review, correct and gate rows in panel order', () => {
    assert.deepEqual(phaseRows(startWave('root', 0)), [
      { phase: 'implement', label: 'Implement', done: 0, total: 0 },
      { phase: 'review', label: 'Review', done: 0, total: 0 },
      { phase: 'correct', label: 'Correct', done: 0, total: 0 },
      { phase: 'gate', label: 'Gate', done: 0, total: 1 },
    ])
  })

  it('counts the finished steps of each phase', () => {
    let progress = startStep(startWave('root', 0), startOf('task-a'), 0)
    progress = finishStep(progress, keyOf(startOf('task-a')), 'done', 10)
    progress = startStep(progress, startOf('task-b'), 0)
    progress = startStep(progress, startOf('task-a', 'review'), 0)
    const rows = phaseRows(progress)
    assert.deepEqual(rows.slice(0, 2), [
      { phase: 'implement', label: 'Implement', done: 1, total: 2 },
      { phase: 'review', label: 'Review', done: 0, total: 1 },
    ])
  })

  it('marks the gate row as done once the gate has finished', () => {
    const progress = finishGate(startGate(startWave('root', 0), 1_000), 'skipped', 2_000)
    assert.deepEqual(phaseRows(progress)[3], { phase: 'gate', label: 'Gate', done: 1, total: 1 })
  })
})

describe('stepRows', () => {
  it('lists only the steps of the requested phase in file order', () => {
    let progress = startStep(startWave('root', 0), startOf('task-a'), 0)
    progress = startStep(progress, startOf('task-a', 'review'), 0)
    progress = startStep(progress, startOf('task-b'), 0)
    const labels = stepRows(progress, 'implement', new Map(), 0).map((row) => row.label)
    assert.deepEqual(labels, ['implement:task-a', 'implement:task-b'])
  })

  it('describes each step with its key, model, tokens, duration, state and session', () => {
    let progress = startStep(startWave('root', 0), startOf('task-a'), 100)
    progress = attachSession(progress, keyOf(startOf('task-a')), 'session-a')
    progress = finishStep(progress, keyOf(startOf('task-a')), 'done', 2_100)
    const rows = stepRows(progress, 'implement', new Map([['session-a', 103_100]]), 9_999)
    assert.deepEqual(rows, [
      {
        key: { taskID: 'task-a', phase: 'implement', attempt: 1 },
        label: 'implement:task-a',
        model: 'model-one',
        tokens: '103.1k tok',
        duration: '2s',
        state: 'done',
        sessionID: 'session-a',
      },
    ])
  })

  it('shows a dash for tokens when the step has no session', () => {
    const progress = startStep(startWave('root', 0), startOf('task-a'), 100)
    const [row] = stepRows(progress, 'implement', new Map(), 500)
    assert.equal(row?.tokens, '- tok')
  })

  it('measures a running step up to the given current time', () => {
    const progress = startStep(startWave('root', 0), startOf('task-a'), 100)
    const [row] = stepRows(progress, 'implement', new Map(), 61_100)
    assert.equal(row?.duration, '1m01s')
  })
})

describe('gateRow', () => {
  it('shows an empty duration before the gate starts', () => {
    assert.deepEqual(gateRow(startWave('root', 0), 5_000), {
      label: 'gate',
      state: 'pending',
      duration: '',
    })
  })

  it('measures a running gate up to the given current time', () => {
    const progress = startGate(startWave('root', 0), 1_000)
    assert.deepEqual(gateRow(progress, 66_000), { label: 'gate', state: 'running', duration: '1m05s' })
  })

  it('measures a finished gate up to its end time', () => {
    const progress = finishGate(startGate(startWave('root', 0), 1_000), 'passed', 3_000)
    assert.deepEqual(gateRow(progress, 99_000), { label: 'gate', state: 'passed', duration: '2s' })
  })
})
