import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applySwitch, type ModeSwitchApi } from '../mode-switch/index.ts'
import { loadHardLimit } from '../rate-guard/config.ts'
import { createSlotSemaphore, type SlotSemaphore } from '../rate-guard/semaphore.ts'
import { createChildSessionRunner, type ChildSessionApi } from './child-session.ts'
import { runGate, type GateInput, type GateResult } from './gate.ts'
import { planWave, type WavePlan } from './wave-plan.ts'
import { runWave, type PromptTemplates } from './wave-runner.ts'

export const HARD_MODEL = 'openai/hard'
export const DEFAULT_CHILD_TIMEOUT_SECONDS = 1800
export const PROMPT_TEMPLATE_DIRECTORY = fileURLToPath(new URL('../../skills/subagent-driven-development/', import.meta.url))

export async function readPromptTemplates(directory: string): Promise<PromptTemplates> {
  const [implementer, reviewer] = await Promise.all([
    readFile(join(directory, 'implementer-prompt.md'), 'utf8'),
    readFile(join(directory, 'reviewer-prompt.md'), 'utf8'),
  ])
  return { implementer, reviewer }
}

const IMPLEMENT_WAVE_DESCRIPTION =
  'Run one wave of the approved implementation plan. Call it once per wave of the subagent-driven-development skill, after the user approved the design. It blocks until the wave ends and returns the wave result as JSON.'

export interface ImplementWaveContext {
  readonly sessionID: string
  readonly agent: string
  readonly signal?: AbortSignal
}

export interface ImplementWaveOutput {
  readonly output: string
  readonly content: string
  readonly metadata: { readonly status: string }
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly input: unknown
  readonly output: unknown
  readonly execute: (args: unknown, ctx: ImplementWaveContext) => Promise<ImplementWaveOutput>
}

export interface ImplementerApi {
  readonly session: ModeSwitchApi['session'] &
    ChildSessionApi['session'] & {
      get(input: { sessionID: string }): Promise<{ id: string; parentID?: string; location?: { directory: string } }>
    }
  readonly agent: ModeSwitchApi['agent']
  readonly tool: ModeSwitchApi['tool'] & {
    transform(callback: (draft: { add(tool: ToolDefinition): void }) => void): Promise<unknown>
  }
}

export interface ImplementWaveDependencies {
  readonly api: ImplementerApi
  readonly semaphore: SlotSemaphore
  readonly prompts: PromptTemplates
  readonly runGate: (input: GateInput) => Promise<GateResult>
}

type WaveKind = Extract<WavePlan, { kind: 'wave' }>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toOutput(result: Record<string, unknown> & { status: string }): ImplementWaveOutput {
  const text = JSON.stringify(result, null, 2)
  return { output: text, content: text, metadata: { status: result.status } }
}

async function switchRootToBuild(api: ImplementerApi, context: ImplementWaveContext): Promise<string> {
  let failure: string | undefined
  const recordingApi: ImplementerApi = {
    ...api,
    session: {
      ...api.session,
      switchAgent: async (input) => {
        try {
          await api.session.switchAgent(input)
        } catch (error) {
          failure = errorMessage(error)
          throw error
        }
      },
    },
  }
  await applySwitch(recordingApi, context.sessionID, context.agent, 'build', 'implement_wave')
  if (failure !== undefined) return `failed: ${failure}`
  return context.agent === 'build' ? 'already-build' : 'switched'
}

async function rootDirectory(api: ImplementerApi, sessionID: string): Promise<string | undefined> {
  return (await api.session.get({ sessionID })).location?.directory
}

const MISSING_DIRECTORY_REASON =
  'The root session reports no working directory in session.get location.directory. Start the wave from a session that has a project directory.'

async function runPlannedWave(
  dependencies: ImplementWaveDependencies,
  plan: WaveKind,
  context: ImplementWaveContext,
  directory: string,
) {
  const runner = createChildSessionRunner({
    api: dependencies.api,
    semaphore: dependencies.semaphore,
    hardModel: HARD_MODEL,
    timeoutSeconds: plan.args.childTimeoutSeconds ?? DEFAULT_CHILD_TIMEOUT_SECONDS,
  })
  return runWave(plan, {
    prompts: dependencies.prompts,
    runChild: (spec) => runner.run(spec),
    runGate: dependencies.runGate,
    directory,
    rootSessionID: context.sessionID,
    signal: context.signal,
  })
}

async function executeWave(
  dependencies: ImplementWaveDependencies,
  plan: WaveKind,
  context: ImplementWaveContext,
): Promise<ImplementWaveOutput> {
  const rootAgentSwitch = await switchRootToBuild(dependencies.api, context)
  const directory = await rootDirectory(dependencies.api, context.sessionID)
  if (directory === undefined) {
    return toOutput({ status: 'aborted', reason: MISSING_DIRECTORY_REASON, rootAgentSwitch })
  }
  const result = await runPlannedWave(dependencies, plan, context, directory)
  return toOutput({ ...result, rootAgentSwitch })
}

export async function executeImplementWave(
  dependencies: ImplementWaveDependencies,
  input: unknown,
  context: ImplementWaveContext,
): Promise<ImplementWaveOutput> {
  const plan = planWave(input)
  if (plan.kind === 'invalid') return toOutput({ status: 'invalid-args', problem: plan.problem })
  if (plan.kind === 'nothing-to-run') {
    return toOutput({ status: 'nothing-to-run', held: plan.held, remaining: plan.remaining })
  }
  return executeWave(dependencies, plan, context)
}

export function registerImplementWave(
  dependencies: ImplementWaveDependencies,
  schemas: { readonly input: unknown; readonly output: unknown },
): Promise<unknown> {
  return dependencies.api.tool.transform((draft) =>
    draft.add({
      name: 'implement_wave',
      description: IMPLEMENT_WAVE_DESCRIPTION,
      input: schemas.input,
      output: schemas.output,
      execute: (args, ctx) => executeImplementWave(dependencies, args, ctx),
    }),
  )
}

export interface SchemaModule {
  Struct(fields: Record<string, unknown>): unknown
  String: unknown
  Number: unknown
  Array(item: unknown): unknown
  Record(key: unknown, value: unknown): unknown
  optional(schema: unknown): unknown
}

export function buildImplementWaveSchemas(schema: SchemaModule): { input: unknown; output: unknown } {
  const strings = schema.Array(schema.String)
  const task = schema.Struct({
    id: schema.String,
    title: schema.String,
    brief: schema.String,
    tier: schema.String,
    agentType: schema.String,
    writes: strings,
    dependsOn: strings,
    acceptance: strings,
  })
  const input = schema.Struct({
    baseSha: schema.String,
    dirtyAtBase: strings,
    models: schema.Record(schema.String, schema.String),
    proofCommands: strings,
    completed: strings,
    stopped: strings,
    tasks: schema.Array(task),
    proofTimeoutSeconds: schema.optional(schema.Number),
    childTimeoutSeconds: schema.optional(schema.Number),
  })
  return { input, output: schema.String }
}

async function isSessionAlive(api: ImplementerApi, sessionID: string): Promise<boolean> {
  try {
    await api.session.get({ sessionID })
    return true
  } catch {
    return false
  }
}

async function setup(api: ImplementerApi): Promise<void> {
  const configPath = fileURLToPath(new URL('../rate-guard/config.json', import.meta.url))
  const limit = await loadHardLimit(configPath, console.warn)
  const semaphore = createSlotSemaphore(limit, (sessionID) => isSessionAlive(api, sessionID))
  const prompts = await readPromptTemplates(PROMPT_TEMPLATE_DIRECTORY)
  const { Schema } = await import('effect')
  await registerImplementWave({ api, semaphore, prompts, runGate }, buildImplementWaveSchemas(Schema as unknown as SchemaModule))
}

export default { id: 'implementer', setup }
