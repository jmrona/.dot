export const meta = {
  name: 'implementation-wave',
  description: 'Runs one wave of an approved implementation plan: implement, review, correct and gate.',
  phases: ['Implement', 'Review', 'Gate'],
}

const tasksById = new Map(args.tasks.map((task) => [task.id, task]))

function ancestorIds(task) {
  const seen = new Set()
  const pending = [...task.dependsOn]
  while (pending.length > 0) {
    const id = pending.pop()
    if (seen.has(id) || !tasksById.has(id)) continue
    seen.add(id)
    pending.push(...tasksById.get(id).dependsOn)
  }
  return seen
}

function findWriteConflict() {
  for (const [index, first] of args.tasks.entries()) {
    for (const second of args.tasks.slice(index + 1)) {
      const sharedPath = first.writes.find((path) => second.writes.includes(path))
      const ordered = ancestorIds(first).has(second.id) || ancestorIds(second).has(first.id)
      if (sharedPath && !ordered) {
        return `Tasks "${first.id}" and "${second.id}" both write "${sharedPath}" and neither depends on the other. Make one depend on the other, or give them separate paths.`
      }
    }
  }
  return null
}

function findCycle() {
  const member = args.tasks.find((task) => ancestorIds(task).has(task.id))
  return member && `Task "${member.id}" depends on itself through a cycle. Remove one dependency to break the cycle.`
}

function findDuplicateId() {
  const seen = new Set()
  for (const task of args.tasks) {
    if (seen.has(task.id)) return `Task id "${task.id}" appears more than once. Give every task a unique id.`
    seen.add(task.id)
  }
  return null
}

function findUnknownDependency() {
  for (const task of args.tasks) {
    const unknown = task.dependsOn.find((id) => !tasksById.has(id))
    if (unknown) return `Task "${task.id}" depends on "${unknown}", which is not in the plan. Correct the dependency or add the task.`
  }
  return null
}

function findMissingModel() {
  const task = args.tasks.find((candidate) => !args.models[candidate.tier])
  return task && `Task "${task.id}" has tier "${task.tier}", which has no model in args.models. Resolve a model for that tier.`
}

const planProblem = findDuplicateId() ?? findUnknownDependency() ?? findCycle() ?? findWriteConflict() ?? findMissingModel()
if (planProblem) return { status: 'aborted', reason: planProblem }

const MAX_WAVE_SIZE = 4

const finished = new Set([...args.completed, ...args.stopped])
const pendingTasks = args.tasks.filter((task) => !finished.has(task.id))
const heldTasks = pendingTasks.filter((task) => [...ancestorIds(task)].some((id) => args.stopped.includes(id)))
const heldIds = heldTasks.map((task) => task.id)
const runnableTasks = pendingTasks.filter(
  (task) => !heldIds.includes(task.id) && task.dependsOn.every((id) => args.completed.includes(id)),
)
const waveTasks = runnableTasks.slice(0, MAX_WAVE_SIZE)
const waveIds = waveTasks.map((task) => task.id)
const remainingIds = pendingTasks.map((task) => task.id).filter((id) => !heldIds.includes(id) && !waveIds.includes(id))

if (waveTasks.length === 0) return { status: 'nothing-to-run', held: heldIds, remaining: remainingIds }

const IMPLEMENTER_SCHEMA = {
  type: 'object',
  properties: {
    status: { enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED', 'BLOCKED_BY_SIBLING'] },
    summary: { type: 'string' },
    tddEvidence: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    environmentFailures: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'tddEvidence', 'concerns', 'environmentFailures'],
}

const GIT_RULE =
  'You must not commit, push, merge, stash or run any other git write. Leave every change uncommitted. Read-only git commands are allowed.'

const IMPLEMENTATION_STATUSES = ['DONE', 'DONE_WITH_CONCERNS']

function buildImplementPrompt(task, findings) {
  const sections = [
    args.prompts.implementer,
    '## Task',
    `Id: ${task.id}`,
    `Title: ${task.title}`,
    `Brief:\n${task.brief}`,
    `Writes: ${task.writes.join(', ')}`,
    `Acceptance criteria:\n${task.acceptance.map((criterion) => `- ${criterion}`).join('\n')}`,
    `Base SHA: ${args.baseSha}`,
    ...correctionSections(findings),
    GIT_RULE,
  ]
  return sections.join('\n\n')
}

function correctionSections(findings) {
  if (findings.length === 0) return []
  return [
    '## Correction round',
    'A reviewer rejected the earlier attempt. Your earlier edits are still in the working tree. Fix these findings and keep the rest.',
    findings.map((finding) => `- ${finding}`).join('\n'),
  ]
}

function implement(task, findings) {
  return agent(buildImplementPrompt(task, findings), {
    label: `implement:${task.id}`,
    phase: 'Implement',
    model: args.models[task.tier],
    agentType: task.agentType,
    schema: IMPLEMENTER_SCHEMA,
  })
}

function blockedOutcome(report) {
  const status = report?.status ?? 'no report'
  return {
    state: 'blocked',
    rounds: 0,
    reviews: [],
    report,
    reason: report ? `implementer returned ${status}` : 'implementer returned no report',
  }
}

async function implementStage(task) {
  const report = await implement(task, [])
  return { report }
}

const REVIEWER_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { enum: ['PASS', 'FAIL'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings'],
}

const MAX_CORRECTION_ROUNDS = 2

function buildReviewPrompt(task, report) {
  const sections = [
    args.prompts.reviewer,
    '## Task under review',
    `Id: ${task.id}`,
    `Title: ${task.title}`,
    `Brief:\n${task.brief}`,
    `Acceptance criteria:\n${task.acceptance.map((criterion) => `- ${criterion}`).join('\n')}`,
    `Implementer report:\n${JSON.stringify(report, null, 2)}`,
    `Base SHA: ${args.baseSha}`,
    `Writes: ${task.writes.join(', ')}`,
    `Read the change with: git diff ${args.baseSha} -- ${task.writes.join(' ')}`,
    'Edit nothing. Report a verdict and findings only.',
    GIT_RULE,
  ]
  return sections.join('\n\n')
}

async function review(task, report) {
  const verdict = await agent(buildReviewPrompt(task, report), {
    label: `review:${task.id}`,
    phase: 'Review',
    model: args.models[task.tier],
    schema: REVIEWER_SCHEMA,
  })
  return verdict ?? { verdict: 'FAIL', findings: ['The reviewer returned no verdict.'] }
}

function implementationSucceeded(report) {
  return Boolean(report) && IMPLEMENTATION_STATUSES.includes(report.status)
}

async function reviewStage({ report }, task) {
  if (!implementationSucceeded(report)) return blockedOutcome(report)
  const reviews = []
  let currentReport = report
  for (let round = 0; round <= MAX_CORRECTION_ROUNDS; round++) {
    const verdict = await review(task, currentReport)
    reviews.push(verdict)
    if (verdict.verdict === 'PASS') return { state: 'reviewed', rounds: round, reviews, report: currentReport }
    if (round === MAX_CORRECTION_ROUNDS) break
    currentReport = await implement(task, verdict.findings)
    if (!implementationSucceeded(currentReport)) return { ...blockedOutcome(currentReport), rounds: round + 1, reviews }
  }
  return { state: 'stopped', rounds: MAX_CORRECTION_ROUNDS, reviews, report: currentReport, reason: 'review-failed' }
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: { command: { type: 'string' }, exitCode: { type: 'integer' }, summary: { type: 'string' } },
        required: ['command', 'exitCode', 'summary'],
      },
    },
    headSha: { type: 'string' },
    changedPaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['commands', 'headSha', 'changedPaths'],
}

function buildGatePrompt() {
  const commands = args.proofCommands.map((command, index) => `${index + 1}. ${command}`).join('\n')
  return [
    'Run each proof command below serially, from the repository root, and record its exit code and a one-line summary. Run all of them even if one fails.',
    commands,
    'Then run `git rev-parse HEAD` and report it as headSha. Run `git status --porcelain -uall` and report every path it lists as changedPaths.',
    'Edit nothing.',
    GIT_RULE,
  ].join('\n\n')
}

function runGate() {
  return agent(buildGatePrompt(), {
    label: 'gate',
    phase: 'Gate',
    model: args.models.standard,
    schema: GATE_SCHEMA,
  })
}

function judgeGate(report) {
  if (!report) return { passed: false, report: null, unattributed: [], failure: 'The gate agent returned no report.' }
  const attributable = new Set([...args.dirtyAtBase, ...waveTasks.flatMap((task) => task.writes)])
  const unattributed = report.changedPaths.filter((changedPath) => !attributable.has(changedPath))
  const allCommandsPassed =
    report.commands.length === args.proofCommands.length && report.commands.every((entry) => entry.exitCode === 0)
  return { passed: allCommandsPassed && unattributed.length === 0, report, unattributed }
}

function buildResult(status, taskResults, gate, extra = {}) {
  return { status, wave: waveIds, tasks: taskResults, gate, held: heldIds, remaining: remainingIds, ...extra }
}

function markVerified(taskResults) {
  return Object.fromEntries(
    Object.entries(taskResults).map(([id, outcome]) => [id, outcome.state === 'reviewed' ? { ...outcome, state: 'verified' } : outcome]),
  )
}

const outcomes = await pipeline(waveTasks, implementStage, reviewStage)
const taskResults = Object.fromEntries(
  waveTasks.map((task, index) => [task.id, outcomes[index] ?? { state: 'blocked', rounds: 0, reviews: [], report: null, reason: 'workflow-error' }]),
)

if (!Object.values(taskResults).some((outcome) => outcome.state === 'reviewed')) {
  return buildResult('completed', taskResults, null)
}

const gate = judgeGate(await runGate())
if (gate.report && gate.report.headSha !== args.baseSha) {
  return buildResult('aborted', taskResults, gate, {
    reason: `HEAD moved from ${args.baseSha} to ${gate.report.headSha}, so a subagent committed. Only the orchestrator commits. Inspect the new commits before continuing.`,
  })
}
if (!gate.passed) return buildResult('gate-failed', taskResults, gate)

return buildResult('completed', markVerified(taskResults), gate)
