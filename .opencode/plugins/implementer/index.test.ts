import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import implementerPlugin, {
  buildImplementWaveSchemas,
  DEFAULT_CHILD_TIMEOUT_SECONDS,
  executeImplementWave,
  PROMPT_TEMPLATE_DIRECTORY,
  readPromptTemplates,
  registerImplementWave,
  type ImplementWaveContext,
  type ImplementWaveDependencies,
  type ImplementerApi,
} from './index.ts'
import type { GateInput, GateResult } from './gate.ts'
import { createSlotSemaphore } from '../rate-guard/semaphore.ts'

interface RecordedCall {
  readonly method: string
  readonly args: unknown
}

interface FakeApiOptions {
  readonly failures?: Readonly<Record<string, string>>
  readonly replies?: readonly string[]
  readonly directory?: string | null
}

interface RegisteredTool {
  readonly name: string
  readonly description: string
  readonly input: unknown
  readonly output: unknown
  readonly execute: (args: unknown, ctx: ImplementWaveContext) => Promise<unknown>
}

const DONE_REPLY = fenced({ status: 'DONE', summary: 'ok', tddEvidence: 'red to green', concerns: [], environmentFailures: [] })
const PASS_REPLY = fenced({ verdict: 'PASS', findings: [] })
const PASSING_GATE: GateResult = { passed: true, headMoved: false, headSha: 'base000', commands: [], changedPaths: ['src/T1.ts'], unattributed: [] }

function fenced(value: unknown): string {
  return '```json\n' + JSON.stringify(value) + '\n```'
}

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const task = {
    id: 'T1', title: 'Title', brief: 'Brief', writes: ['src/T1.ts'], dependsOn: [],
    acceptance: ['works'], tier: 'standard', agentType: 'implementer',
  }
  return {
    baseSha: 'base000', dirtyAtBase: [], models: { standard: 'openai/routine' },
    proofCommands: ['npm test'],
    completed: [], stopped: [], tasks: [task], ...overrides,
  }
}

function createFakeApi(options: FakeApiOptions = {}) {
  const calls: RecordedCall[] = []
  const tools: RegisteredTool[] = []
  const replies = [...(options.replies ?? [])]
  const childReplies = new Map<string, string>()
  const record = async (method: string, args: unknown): Promise<void> => {
    calls.push({ method, args })
    const failureMessage = options.failures?.[method]
    if (failureMessage !== undefined) throw new Error(failureMessage)
  }
  const api: ImplementerApi = {
    session: {
      get: async (input) => {
        await record('session.get', input)
        const directory = options.directory === undefined ? '/repo' : options.directory
        return directory === null ? { id: input.sessionID } : { id: input.sessionID, location: { directory } }
      },
      switchAgent: (input) => record('session.switchAgent', input),
      switchModel: (input) => record('session.switchModel', input),
      synthetic: (input) => record('session.synthetic', input),
      hook: async () => undefined,
      create: async (input) => {
        await record('session.create', input)
        const id = `child-${childReplies.size + 1}`
        childReplies.set(id, replies.shift() ?? '')
        return { id }
      },
      prompt: (input) => record('session.prompt', input),
      wait: (input) => record('session.wait', input),
      context: async ({ sessionID }) => [
        { type: 'assistant', content: [{ type: 'text', text: childReplies.get(sessionID) }] },
      ],
      interrupt: (input) => record('session.interrupt', input),
    },
    agent: { get: async () => ({ data: { model: { id: 'build-model', providerID: 'openai' } } }) },
    tool: {
      hook: async () => undefined,
      transform: async (callback) => {
        callback({ add: (tool) => tools.push(tool as RegisteredTool) })
      },
    },
  }
  return { api, calls, tools }
}

function createDependencies(options: FakeApiOptions = {}) {
  const fake = createFakeApi(options)
  const gateInputs: GateInput[] = []
  const dependencies: ImplementWaveDependencies = {
    api: fake.api,
    semaphore: createSlotSemaphore(2, async () => true),
    prompts: { implementer: 'TEMPLATE IMPLEMENTER', reviewer: 'TEMPLATE REVIEWER' },
    runGate: async (input) => {
      gateInputs.push(input)
      return PASSING_GATE
    },
  }
  return { ...fake, dependencies, gateInputs }
}

function rootContext(agent = 'build'): ImplementWaveContext {
  return { sessionID: 'root', agent }
}

async function runWaveToResult(options: FakeApiOptions, agent = 'build', input: unknown = validInput()) {
  const fixture = createDependencies(options)
  const output = await executeImplementWave(fixture.dependencies, input, rootContext(agent))
  return { ...fixture, output, result: JSON.parse(output.output) }
}

test('executeImplementWave returns invalid-args with the problem for invalid input', async () => {
  const { output, result, calls } = await runWaveToResult({}, 'build', { baseSha: 5 })

  assert.equal(result.status, 'invalid-args')
  assert.equal(typeof result.problem, 'string')
  assert.equal(output.metadata.status, 'invalid-args')
  assert.deepEqual(calls, [])
})

test('executeImplementWave returns nothing-to-run with held and remaining when no task can run', async () => {
  const base = (validInput().tasks as object[])[0]
  const blocked = validInput({
    stopped: ['T0'],
    tasks: [{ ...base, id: 'T0' }, { ...base, dependsOn: ['T0'] }],
  })

  const { result, calls } = await runWaveToResult({}, 'build', blocked)

  assert.equal(result.status, 'nothing-to-run')
  assert.deepEqual(result.held, ['T1'])
  assert.ok(Array.isArray(result.remaining))
  assert.equal(calls.some((call) => call.method === 'session.create'), false)
})

test('executeImplementWave reports already-build and reapplies the model when the root agent is build', async () => {
  const { result, calls } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY] })

  assert.equal(result.rootAgentSwitch, 'already-build')
  assert.ok(calls.some((call) => call.method === 'session.switchModel'))
  assert.equal(calls.some((call) => call.method === 'session.switchAgent'), false)
})

test('executeImplementWave switches a plan root session to build and reports switched', async () => {
  const { result, calls } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY] }, 'plan')

  assert.equal(result.rootAgentSwitch, 'switched')
  assert.deepEqual(calls.find((call) => call.method === 'session.switchAgent')?.args, { sessionID: 'root', agent: 'build' })
})

test('executeImplementWave reports failed with the message when switchAgent throws', async () => {
  const { result } = await runWaveToResult(
    { replies: [DONE_REPLY, PASS_REPLY], failures: { 'session.switchAgent': 'no such agent' } },
    'plan',
  )

  assert.equal(result.rootAgentSwitch, 'failed: no such agent')
  assert.equal(result.status, 'completed')
})

test('executeImplementWave aborts with an actionable reason when the root session has no directory', async () => {
  const { result, calls } = await runWaveToResult({ directory: null })

  assert.equal(result.status, 'aborted')
  assert.match(result.reason, /directory/)
  assert.equal(calls.some((call) => call.method === 'session.create'), false)
})

test('executeImplementWave runs the gate in the directory of the root session', async () => {
  const { gateInputs } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY], directory: '/work/tree' })

  assert.equal(gateInputs[0].directory, '/work/tree')
})

test('executeImplementWave completes a full wave with a verified task', async () => {
  const { result, output } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY] })

  assert.equal(result.status, 'completed')
  assert.equal(result.tasks.T1.state, 'verified')
  assert.equal(output.metadata.status, 'completed')
})

test('executeImplementWave returns identical JSON text as output and content', async () => {
  const { output } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY] })

  assert.equal(output.content, output.output)
  assert.equal(output.output, JSON.stringify(JSON.parse(output.output), null, 2))
})

test('executeImplementWave stops a slow child after childTimeoutSeconds from the arguments', async () => {
  const fixture = createDependencies({ replies: [DONE_REPLY] })
  fixture.api.session.wait = () => new Promise(() => undefined)

  const output = await executeImplementWave(fixture.dependencies, validInput({ childTimeoutSeconds: 0.01 }), rootContext())

  assert.equal(JSON.parse(output.output).tasks.T1.state, 'blocked')
})

test('the default child timeout is 1800 seconds', () => {
  assert.equal(DEFAULT_CHILD_TIMEOUT_SECONDS, 1800)
})

test('registerImplementWave adds implement_wave with the given schemas', async () => {
  const { dependencies, tools } = createDependencies()
  const schemas = { input: { kind: 'input' }, output: { kind: 'output' } }

  await registerImplementWave(dependencies, schemas)

  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'implement_wave')
  assert.equal(tools[0].input, schemas.input)
  assert.equal(tools[0].output, schemas.output)
  assert.match(tools[0].description, /blocks/)
})

test('the registered implement_wave tool delegates to executeImplementWave', async () => {
  const { dependencies, tools } = createDependencies()
  await registerImplementWave(dependencies, { input: {}, output: {} })

  const output = (await tools[0].execute({ baseSha: 5 }, rootContext())) as { metadata: { status: string } }

  assert.equal(output.metadata.status, 'invalid-args')
})

test('the default export is the implementer plugin', () => {
  assert.equal(implementerPlugin.id, 'implementer')
  assert.equal(typeof implementerPlugin.setup, 'function')
})

test('executeImplementWave sends child sessions the implementer template from the dependencies', async () => {
  const { calls } = await runWaveToResult({ replies: [DONE_REPLY, PASS_REPLY] })

  const firstPrompt = calls.find((call) => call.method === 'session.prompt')?.args as { text: string }
  assert.match(firstPrompt.text, /TEMPLATE IMPLEMENTER/)
})

test('readPromptTemplates reads the implementer and reviewer templates of the subagent-driven-development skill', async () => {
  const templates = await readPromptTemplates(PROMPT_TEMPLATE_DIRECTORY)

  assert.match(templates.implementer, /^You are implementing Task N/)
  assert.match(templates.reviewer, /^You are reviewing an implementation/)
  assert.doesNotMatch(templates.implementer, /subagent\(\{/)
  assert.doesNotMatch(templates.reviewer, /subagent\(\{/)
})

test('readPromptTemplates rejects a template without a closed text block and says how to fix it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'templates-'))
  writeFileSync(join(directory, 'implementer-prompt.md'), '# Implementer\n\nNo block here.\n')
  writeFileSync(join(directory, 'reviewer-prompt.md'), '# Reviewer\n\nNo block here.\n')

  await assert.rejects(readPromptTemplates(directory), /has no closed text block holding the child prompt/)

  rmSync(directory, { recursive: true, force: true })
})

test('buildImplementWaveSchemas declares no prompts field in the tool input', () => {
  const fakeSchema = {
    Struct: (fields: Record<string, unknown>) => fields,
    String: 'string',
    Number: 'number',
    Array: (item: unknown) => [item],
    Record: (key: unknown, value: unknown) => ({ key, value }),
    optional: (schema: unknown) => ({ optional: schema }),
  }

  const { input } = buildImplementWaveSchemas(fakeSchema) as { input: Record<string, unknown> }

  assert.ok(Object.hasOwn(input, 'baseSha'))
  assert.equal(Object.hasOwn(input, 'prompts'), false)
})
