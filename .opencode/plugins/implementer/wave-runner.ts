import type { ChildRunResult, ChildRunSpec } from './child-session.ts'
import type { GateInput, GateResult } from './gate.ts'
import type { WaveArgs, WavePlan, WaveTask } from './wave-plan.ts'

export const DEFAULT_PROOF_TIMEOUT_SECONDS = 1200
export const MAX_CORRECTION_ROUNDS = 2
export const SUBAGENT_PREAMBLE =
  'You are a subagent dispatched by the implement_wave tool. The user has already approved the design and this task, so the Subagent Exemption of the skills policy applies. Do not run brainstorming, the design router or any other workflow skill, and do not ask the user anything, because nobody can answer. Do the task below and report in the required format.'
export const IMPLEMENTER_FIELDS = ['status', 'summary', 'tddEvidence', 'concerns', 'environmentFailures'] as const
export const REVIEWER_FIELDS = ['verdict', 'findings'] as const
export interface ReviewVerdict { readonly verdict: 'PASS' | 'FAIL'; readonly findings: readonly string[] }
export interface TaskOutcome { readonly state: 'verified' | 'reviewed' | 'blocked' | 'stopped'; readonly rounds: number; readonly reviews: readonly ReviewVerdict[]; readonly report: Readonly<Record<string, unknown>> | null; readonly reason?: string }
export interface WaveResult { readonly status: 'completed' | 'gate-failed' | 'aborted'; readonly wave: readonly string[]; readonly tasks: Readonly<Record<string, TaskOutcome>>; readonly gate: GateResult | null; readonly held: readonly string[]; readonly remaining: readonly string[]; readonly reason?: string }
export interface PromptTemplates { readonly implementer: string; readonly reviewer: string }
export interface WaveRunnerDependencies { readonly prompts: PromptTemplates; readonly runChild: (spec: ChildRunSpec) => Promise<ChildRunResult>; readonly runGate: (input: GateInput) => Promise<GateResult>; readonly directory: string; readonly rootSessionID: string; readonly signal?: AbortSignal }

type WaveKind = Extract<WavePlan, { kind: 'wave' }>
type Report = Readonly<Record<string, unknown>>
type ImplementAttempt = { readonly report: Report; readonly failure: null } | { readonly report: Report | null; readonly failure: string }
type ReviewStep = { readonly verdict: ReviewVerdict } | { readonly failure: string }

interface RunContext {
  readonly args: WaveArgs
  readonly dependencies: WaveRunnerDependencies
}

const GIT_RULE =
  'You must not commit, push, merge, stash or run any other git write. Leave every change uncommitted. Read-only git commands are allowed.'
const IMPLEMENTATION_STATUSES: readonly unknown[] = ['DONE', 'DONE_WITH_CONCERNS']
const IMPLEMENTER_REPLY_INSTRUCTION =
  'End the reply with one fenced json block holding status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED or BLOCKED_BY_SIBLING), summary, tddEvidence, concerns (array of strings) and environmentFailures (array of strings).'
const REVIEWER_REPLY_INSTRUCTION =
  'End the reply with one fenced json block holding verdict (PASS or FAIL) and findings (array of strings).'
const NO_VALID_VERDICT: ReviewVerdict = { verdict: 'FAIL', findings: ['The reviewer returned no valid verdict.'] }

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

function correctionSections(findings: readonly string[]): string[] {
  if (findings.length === 0) return []
  return [
    '## Correction round',
    'A reviewer rejected the earlier attempt. Your earlier edits are still in the working tree. Fix these findings and keep the rest.',
    bulletList(findings),
  ]
}

function buildImplementPrompt(args: WaveArgs, prompts: PromptTemplates, task: WaveTask, findings: readonly string[]): string {
  return [
    SUBAGENT_PREAMBLE,
    prompts.implementer,
    '## Task',
    `Id: ${task.id}`,
    `Title: ${task.title}`,
    `Brief:\n${task.brief}`,
    `Writes: ${task.writes.join(', ')}`,
    `Acceptance criteria:\n${bulletList(task.acceptance)}`,
    `Base SHA: ${args.baseSha}`,
    ...correctionSections(findings),
    GIT_RULE,
    IMPLEMENTER_REPLY_INSTRUCTION,
  ].join('\n\n')
}

function buildReviewPrompt(args: WaveArgs, prompts: PromptTemplates, task: WaveTask, report: Report): string {
  return [
    SUBAGENT_PREAMBLE,
    prompts.reviewer,
    '## Task under review',
    `Id: ${task.id}`,
    `Title: ${task.title}`,
    `Brief:\n${task.brief}`,
    `Acceptance criteria:\n${bulletList(task.acceptance)}`,
    `Implementer report:\n${JSON.stringify(report, null, 2)}`,
    `Base SHA: ${args.baseSha}`,
    `Writes: ${task.writes.join(', ')}`,
    `Read the change with: git diff ${args.baseSha} -- ${task.writes.join(' ')}`,
    'Edit nothing. Report a verdict and findings only.',
    GIT_RULE,
    REVIEWER_REPLY_INSTRUCTION,
  ].join('\n\n')
}

function childSpec(context: RunContext, task: WaveTask, text: string, requiredFields: readonly string[], slotKey: string): ChildRunSpec {
  return {
    parentID: context.dependencies.rootSessionID,
    agent: task.agentType,
    model: context.args.models[task.tier],
    text,
    requiredFields,
    slotKey,
    signal: context.dependencies.signal,
  }
}

async function implement(context: RunContext, task: WaveTask, findings: readonly string[], attempt: number): Promise<ImplementAttempt> {
  const text = buildImplementPrompt(context.args, context.dependencies.prompts, task, findings)
  const spec = childSpec(context, task, text, IMPLEMENTER_FIELDS, `${task.id}:implement:${attempt}`)
  const result = await context.dependencies.runChild(spec)
  if (!result.ok) return { report: null, failure: result.reason }
  if (!IMPLEMENTATION_STATUSES.includes(result.value.status)) {
    return { report: result.value, failure: `implementer returned ${String(result.value.status)}` }
  }
  return { report: result.value, failure: null }
}

async function review(context: RunContext, task: WaveTask, report: Report, round: number): Promise<ReviewStep> {
  const text = buildReviewPrompt(context.args, context.dependencies.prompts, task, report)
  const result = await context.dependencies.runChild(childSpec(context, task, text, REVIEWER_FIELDS, `${task.id}:review:${round}`))
  if (result.ok) return { verdict: result.value as unknown as ReviewVerdict }
  if (result.reason === 'invalid-report') return { verdict: NO_VALID_VERDICT }
  return { failure: result.reason }
}

function blockedOutcome(report: Report | null, reason: string, rounds: number, reviews: readonly ReviewVerdict[]): TaskOutcome {
  return { state: 'blocked', rounds, reviews, report, reason }
}

async function reviewLoop(context: RunContext, task: WaveTask, firstReport: Report): Promise<TaskOutcome> {
  const reviews: ReviewVerdict[] = []
  let report = firstReport
  for (let round = 0; ; round++) {
    const step = await review(context, task, report, round)
    if ('failure' in step) return blockedOutcome(report, step.failure, round, reviews)
    reviews.push(step.verdict)
    if (step.verdict.verdict === 'PASS') return { state: 'reviewed', rounds: round, reviews, report }
    if (round === MAX_CORRECTION_ROUNDS) return { state: 'stopped', rounds: round, reviews, report, reason: 'review-failed' }
    const attempt = await implement(context, task, step.verdict.findings, round + 1)
    if (attempt.failure !== null) return blockedOutcome(attempt.report, attempt.failure, round + 1, reviews)
    report = attempt.report
  }
}

async function runTask(context: RunContext, task: WaveTask): Promise<TaskOutcome> {
  const attempt = await implement(context, task, [], 0)
  if (attempt.failure !== null) return blockedOutcome(attempt.report, attempt.failure, 0, [])
  return reviewLoop(context, task, attempt.report)
}

function buildResult(plan: WaveKind, status: WaveResult['status'], tasks: WaveResult['tasks'], gate: GateResult | null, reason?: string): WaveResult {
  const result = { status, wave: plan.wave.map((task) => task.id), tasks, gate, held: plan.held, remaining: plan.remaining }
  return reason === undefined ? result : { ...result, reason }
}

function markVerified(tasks: WaveResult['tasks']): WaveResult['tasks'] {
  return Object.fromEntries(
    Object.entries(tasks).map(([id, outcome]) => [id, outcome.state === 'reviewed' ? { ...outcome, state: 'verified' as const } : outcome]),
  )
}

function gateInputFor(plan: WaveKind, directory: string): GateInput {
  const { args } = plan
  return {
    directory,
    baseSha: args.baseSha,
    proofCommands: args.proofCommands,
    proofTimeoutSeconds: args.proofTimeoutSeconds ?? DEFAULT_PROOF_TIMEOUT_SECONDS,
    attributablePaths: [...args.dirtyAtBase, ...plan.wave.flatMap((task) => task.writes)],
  }
}

function headMovedReason(baseSha: string, headSha: string): string {
  return `HEAD moved from ${baseSha} to ${headSha}, so a subagent committed. Only the orchestrator commits. Inspect the new commits before continuing.`
}

async function gateWave(plan: WaveKind, dependencies: WaveRunnerDependencies, tasks: WaveResult['tasks']): Promise<WaveResult> {
  const gate = await dependencies.runGate(gateInputFor(plan, dependencies.directory))
  if (gate.headMoved) return buildResult(plan, 'aborted', tasks, gate, headMovedReason(plan.args.baseSha, gate.headSha))
  if (!gate.passed) return buildResult(plan, 'gate-failed', tasks, gate)
  return buildResult(plan, 'completed', markVerified(tasks), gate)
}

export async function runWave(plan: WaveKind, dependencies: WaveRunnerDependencies): Promise<WaveResult> {
  const context: RunContext = { args: plan.args, dependencies }
  const outcomes = await Promise.all(plan.wave.map((task) => runTask(context, task)))
  const tasks = Object.fromEntries(plan.wave.map((task, index) => [task.id, outcomes[index]]))
  if (dependencies.signal?.aborted) return buildResult(plan, 'aborted', tasks, null, 'cancelled')
  if (!outcomes.some((outcome) => outcome.state === 'reviewed')) return buildResult(plan, 'completed', tasks, null)
  return gateWave(plan, dependencies, tasks)
}
