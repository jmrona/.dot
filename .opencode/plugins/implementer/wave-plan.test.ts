import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planWave, type WavePlan, type WaveTask } from './wave-plan.ts'

type PlanInput = Record<string, unknown>
type WaveResult = Extract<WavePlan, { kind: 'wave' }>
type InvalidResult = Extract<WavePlan, { kind: 'invalid' }>

function task(id: string, overrides: Partial<WaveTask> = {}): WaveTask {
  return {
    id,
    title: `Task ${id}`,
    brief: `Brief for ${id}`,
    writes: [`src/${id}.ts`],
    dependsOn: [],
    acceptance: [`${id} works`],
    tier: 'standard',
    agentType: 'implementer',
    ...overrides,
  }
}

function planInput(overrides: PlanInput = {}): PlanInput {
  return {
    baseSha: '1fe894b3b1b8131520b3aa0bc4af0d331ee04b35',
    dirtyAtBase: [],
    models: { standard: 'model-standard' },
    prompts: { implementer: 'Implement the task.', reviewer: 'Review the task.' },
    proofCommands: ['node --test'],
    completed: [],
    stopped: [],
    tasks: [],
    ...overrides,
  }
}

function withoutField(input: PlanInput, field: string): PlanInput {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== field))
}

function problemOf(input: unknown): string {
  const plan = planWave(input)
  assert.equal(plan.kind, 'invalid')
  return (plan as InvalidResult).problem
}

function waveOf(input: PlanInput): WaveResult {
  const plan = planWave(input)
  assert.equal(plan.kind, 'wave')
  return plan as WaveResult
}

function idsOf(tasks: readonly WaveTask[]): string[] {
  return tasks.map((candidate) => candidate.id)
}

test('planWave rejects args that arrive as a JSON string', () => {
  assert.equal(
    problemOf(JSON.stringify(planInput())),
    'args must be a JSON object, not a string. Pass the plan as an object, not as serialised JSON.',
  )
})

test('planWave rejects a missing top-level string field and names it', () => {
  assert.equal(problemOf(withoutField(planInput(), 'baseSha')), 'args.baseSha must be a string.')
})

test('planWave rejects a top-level field of the wrong type', () => {
  assert.equal(problemOf(planInput({ models: ['standard'] })), 'args.models must be an object.')
})

test('planWave rejects a missing array field and suggests an empty array', () => {
  assert.equal(
    problemOf(withoutField(planInput(), 'dirtyAtBase')),
    'args.dirtyAtBase must be an array. Pass an empty array when nothing applies.',
  )
})

test('planWave rejects a missing prompt field and names it', () => {
  assert.equal(
    problemOf(planInput({ prompts: { implementer: 'Implement the task.' } })),
    'args.prompts.reviewer must be a string.',
  )
})

test('planWave rejects a task that is not an object and gives its position', () => {
  assert.equal(problemOf(planInput({ tasks: ['T1'] })), 'Task at position 1 must be an object.')
})

test('planWave rejects a task with a missing field and names the task', () => {
  const taskWithoutTier = withoutField(task('T1'), 'tier') as unknown as WaveTask
  assert.equal(
    problemOf(planInput({ tasks: [taskWithoutTier] })),
    'Task "T1" has no tier. Give every task a string tier.',
  )
})

test('planWave rejects a task field of the wrong type and names the task', () => {
  assert.equal(
    problemOf(planInput({ tasks: [task('T1', { writes: 'src/T1.ts' as unknown as string[] })] })),
    'Task "T1" field writes must be an array. Give every task a writes array.',
  )
})

test('planWave rejects a duplicate task id', () => {
  assert.equal(
    problemOf(planInput({ tasks: [task('T1'), task('T1')] })),
    'Task id "T1" appears more than once. Give every task a unique id.',
  )
})

test('planWave rejects a dependency on a task that is neither planned nor completed', () => {
  assert.equal(
    problemOf(planInput({ tasks: [task('T1', { dependsOn: ['T9'] })] })),
    'Task "T1" depends on "T9", which is not in the plan. Correct the dependency or add the task.',
  )
})

test('planWave accepts a dependency on a task that is already completed', () => {
  assert.equal(
    waveOf(planInput({ completed: ['T0'], tasks: [task('T1', { dependsOn: ['T0'] })] })).kind,
    'wave',
  )
})

test('planWave rejects a dependency cycle and names a task in it', () => {
  assert.equal(
    problemOf(
      planInput({
        tasks: [task('T1', { dependsOn: ['T2'] }), task('T2', { dependsOn: ['T1'] })],
      }),
    ),
    'Task "T1" depends on itself through a cycle. Remove one dependency to break the cycle.',
  )
})

test('planWave rejects two runnable tasks that write the same path', () => {
  assert.equal(
    problemOf(
      planInput({
        tasks: [
          task('T1', { writes: ['src/shared.ts'] }),
          task('T2', { writes: ['src/shared.ts'] }),
        ],
      }),
    ),
    'Tasks "T1" and "T2" both write "src/shared.ts" and neither depends on the other. Make one depend on the other, or give them separate paths.',
  )
})

test('planWave accepts a shared write path when one task depends on the other', () => {
  const plan = waveOf(
    planInput({
      tasks: [
        task('T1', { writes: ['src/shared.ts'] }),
        task('T2', { writes: ['src/shared.ts'], dependsOn: ['T1'] }),
      ],
    }),
  )
  assert.deepEqual(idsOf(plan.wave), ['T1'])
})

test('planWave rejects a task whose tier has no model', () => {
  assert.equal(
    problemOf(planInput({ tasks: [task('T1', { tier: 'hard' })] })),
    'Task "T1" has tier "hard", which has no model in args.models. Resolve a model for that tier.',
  )
})

test('planWave rejects a tier that only matches an inherited object property', () => {
  assert.equal(
    problemOf(planInput({ tasks: [task('T1', { tier: 'toString' })] })),
    'Task "T1" has tier "toString", which has no model in args.models. Resolve a model for that tier.',
  )
})

test('planWave rejects a proof timeout that is not a positive finite number', () => {
  for (const value of [0, -5, Number.POSITIVE_INFINITY, Number.NaN, '600']) {
    assert.match(problemOf(planInput({ proofTimeoutSeconds: value })), /^args\.proofTimeoutSeconds must be/, String(value))
  }
})

test('planWave rejects a child timeout that is not a positive finite number', () => {
  for (const value of [0, -5, Number.POSITIVE_INFINITY, Number.NaN, '1800']) {
    assert.match(problemOf(planInput({ childTimeoutSeconds: value })), /^args\.childTimeoutSeconds must be/, String(value))
  }
})

test('planWave accepts positive timeouts when both are present', () => {
  const plan = planWave(planInput({ proofTimeoutSeconds: 600, childTimeoutSeconds: 1800 }))
  assert.equal(plan.kind, 'nothing-to-run')
})

test('planWave holds pending tasks that depend transitively on a stopped task', () => {
  const plan = waveOf(
    planInput({
      stopped: ['T1'],
      tasks: [
        task('T1'),
        task('T2', { dependsOn: ['T1'] }),
        task('T3', { dependsOn: ['T2'] }),
        task('T4'),
      ],
    }),
  )
  assert.deepEqual(plan.held, ['T2', 'T3'])
  assert.deepEqual(idsOf(plan.wave), ['T4'])
})

test('planWave starts a pending task once all its dependencies are completed', () => {
  const plan = waveOf(
    planInput({
      completed: ['T1'],
      tasks: [task('T1'), task('T2', { dependsOn: ['T1'] }), task('T3', { dependsOn: ['T2'] })],
    }),
  )
  assert.deepEqual(idsOf(plan.wave), ['T2'])
})

test('planWave lists a pending task whose dependency is still pending in remaining', () => {
  const plan = waveOf(
    planInput({
      completed: ['T1'],
      tasks: [task('T1'), task('T2', { dependsOn: ['T1'] }), task('T3', { dependsOn: ['T2'] })],
    }),
  )
  assert.deepEqual(plan.remaining, ['T3'])
})

test('planWave caps the wave at four tasks in plan order', () => {
  const plan = waveOf(
    planInput({
      tasks: [task('T1'), task('T2'), task('T3'), task('T4'), task('T5')],
    }),
  )
  assert.deepEqual(idsOf(plan.wave), ['T1', 'T2', 'T3', 'T4'])
})

test('planWave lists tasks beyond the wave cap in remaining', () => {
  const plan = waveOf(
    planInput({
      tasks: [task('T1'), task('T2'), task('T3'), task('T4'), task('T5')],
    }),
  )
  assert.deepEqual(plan.remaining, ['T5'])
})

test('planWave never lists completed or stopped tasks in remaining or in the wave', () => {
  const plan = waveOf(
    planInput({
      completed: ['T1'],
      stopped: ['T2'],
      tasks: [task('T1'), task('T2'), task('T3')],
    }),
  )
  assert.deepEqual(idsOf(plan.wave), ['T3'])
  assert.deepEqual(plan.remaining, [])
})

test('planWave returns the validated args alongside the wave', () => {
  const plan = waveOf(planInput({ tasks: [task('T1')], proofCommands: ['node --test'] }))
  assert.deepEqual(plan.args.proofCommands, ['node --test'])
})

test('planWave returns nothing-to-run with held ids when every pending task is held', () => {
  assert.deepEqual(
    planWave(
      planInput({
        stopped: ['T1'],
        tasks: [task('T1'), task('T2', { dependsOn: ['T1'] }), task('T3', { dependsOn: ['T2'] })],
      }),
    ),
    { kind: 'nothing-to-run', held: ['T2', 'T3'], remaining: [] },
  )
})

test('planWave returns nothing-to-run when every task is already finished', () => {
  assert.deepEqual(
    planWave(planInput({ completed: ['T1'], stopped: ['T2'], tasks: [task('T1'), task('T2')] })),
    { kind: 'nothing-to-run', held: [], remaining: [] },
  )
})
