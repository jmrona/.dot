export const MAX_WAVE_SIZE = 4

export interface WaveTask {
  readonly id: string
  readonly title: string
  readonly brief: string
  readonly writes: readonly string[]
  readonly dependsOn: readonly string[]
  readonly acceptance: readonly string[]
  readonly tier: string
  readonly agentType: string
}

export interface WaveArgs {
  readonly baseSha: string
  readonly dirtyAtBase: readonly string[]
  readonly models: Readonly<Record<string, string>>
  readonly proofCommands: readonly string[]
  readonly completed: readonly string[]
  readonly stopped: readonly string[]
  readonly tasks: readonly WaveTask[]
  readonly proofTimeoutSeconds?: number
  readonly childTimeoutSeconds?: number
}

export type WavePlan =
  | { readonly kind: 'invalid'; readonly problem: string }
  | { readonly kind: 'nothing-to-run'; readonly held: readonly string[]; readonly remaining: readonly string[] }
  | {
      readonly kind: 'wave'
      readonly args: WaveArgs
      readonly wave: readonly WaveTask[]
      readonly held: readonly string[]
      readonly remaining: readonly string[]
    }

type FieldKind = 'string' | 'array' | 'object'
type FieldRule = readonly [string, FieldKind]
type UnknownRecord = Readonly<Record<string, unknown>>

const ARTICLED_KIND: Readonly<Record<FieldKind, string>> = {
  array: 'an array',
  string: 'a string',
  object: 'an object',
}

const TOP_LEVEL_SHAPE: readonly FieldRule[] = [
  ['baseSha', 'string'],
  ['dirtyAtBase', 'array'],
  ['models', 'object'],
  ['proofCommands', 'array'],
  ['completed', 'array'],
  ['stopped', 'array'],
  ['tasks', 'array'],
]

const TASK_SHAPE: readonly FieldRule[] = [
  ['id', 'string'],
  ['title', 'string'],
  ['brief', 'string'],
  ['writes', 'array'],
  ['dependsOn', 'array'],
  ['acceptance', 'array'],
  ['tier', 'string'],
  ['agentType', 'string'],
]

const OPTIONAL_TIMEOUT_FIELDS: readonly string[] = ['proofTimeoutSeconds', 'childTimeoutSeconds']

interface PlanGraph {
  readonly tasks: readonly WaveTask[]
  readonly tasksById: ReadonlyMap<string, WaveTask>
}

function isKind(value: unknown, kind: FieldKind): boolean {
  if (kind === 'array') return Array.isArray(value)
  if (kind === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return typeof value === kind
}

function findShapeViolation(record: UnknownRecord, shape: readonly FieldRule[]): FieldRule | undefined {
  return shape.find(([field, kind]) => !isKind(record[field], kind))
}

function fieldMessage(path: string, kind: FieldKind): string {
  const hint = kind === 'array' ? ' Pass an empty array when nothing applies.' : ''
  return `${path} must be ${ARTICLED_KIND[kind]}.${hint}`
}

function taskRequirement(field: string, kind: FieldKind): string {
  return kind === 'array' ? `a ${field} array` : `a ${kind} ${field}`
}

function taskMessage(label: string, [field, kind]: FieldRule, task: UnknownRecord): string {
  const requirement = `Give every task ${taskRequirement(field, kind)}.`
  if (task[field] === undefined) return `Task ${label} has no ${field}. ${requirement}`
  return `Task ${label} field ${field} must be ${ARTICLED_KIND[kind]}. ${requirement}`
}

function taskLabel(task: UnknownRecord, index: number): string {
  return isKind(task.id, 'string') ? `"${task.id}"` : `at position ${index + 1}`
}

function findTaskProblem(tasks: readonly unknown[]): string | null {
  for (const [index, task] of tasks.entries()) {
    if (!isKind(task, 'object')) return `Task at position ${index + 1} must be an object.`
    const record = task as UnknownRecord
    const violation = findShapeViolation(record, TASK_SHAPE)
    if (violation) return taskMessage(taskLabel(record, index), violation, record)
  }
  return null
}

function isPositiveFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function findTimeoutProblem(args: UnknownRecord): string | null {
  const field = OPTIONAL_TIMEOUT_FIELDS.find(
    (name) => args[name] !== undefined && !isPositiveFiniteNumber(args[name]),
  )
  if (field === undefined) return null
  return `args.${field} must be a positive, finite number of seconds when present. Pass a number above zero, or omit the field to use the default.`
}

function findArgsProblem(input: unknown): string | null {
  if (typeof input === 'string') {
    return 'args must be a JSON object, not a string. Pass the plan as an object, not as serialised JSON.'
  }
  if (!isKind(input, 'object')) {
    return 'args must be a JSON object. Pass the plan as an object with the fields the workflow contract lists.'
  }
  const args = input as UnknownRecord
  const topLevelViolation = findShapeViolation(args, TOP_LEVEL_SHAPE)
  if (topLevelViolation) return fieldMessage(`args.${topLevelViolation[0]}`, topLevelViolation[1])
  return findTaskProblem(args.tasks as readonly unknown[]) ?? findTimeoutProblem(args)
}

function indexById(tasks: readonly WaveTask[]): ReadonlyMap<string, WaveTask> {
  return new Map(tasks.map((task) => [task.id, task] as const))
}

function ancestorIds(graph: PlanGraph, task: WaveTask): Set<string> {
  const seen = new Set<string>()
  const pending = [...task.dependsOn]
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const dependency = graph.tasksById.get(id)
    if (seen.has(id) || !dependency) continue
    seen.add(id)
    pending.push(...dependency.dependsOn)
  }
  return seen
}

function areOrdered(graph: PlanGraph, first: WaveTask, second: WaveTask): boolean {
  return ancestorIds(graph, first).has(second.id) || ancestorIds(graph, second).has(first.id)
}

function findDuplicateId(tasks: readonly WaveTask[]): string | null {
  const seen = new Set<string>()
  for (const task of tasks) {
    if (seen.has(task.id)) return `Task id "${task.id}" appears more than once. Give every task a unique id.`
    seen.add(task.id)
  }
  return null
}

function findUnknownDependency(graph: PlanGraph, completed: readonly string[]): string | null {
  for (const task of graph.tasks) {
    const unknown = task.dependsOn.find((id) => !graph.tasksById.has(id) && !completed.includes(id))
    if (unknown !== undefined) {
      return `Task "${task.id}" depends on "${unknown}", which is not in the plan. Correct the dependency or add the task.`
    }
  }
  return null
}

function findCycle(graph: PlanGraph): string | null {
  const member = graph.tasks.find((task) => ancestorIds(graph, task).has(task.id))
  if (member === undefined) return null
  return `Task "${member.id}" depends on itself through a cycle. Remove one dependency to break the cycle.`
}

function findWriteConflict(graph: PlanGraph): string | null {
  for (const [index, first] of graph.tasks.entries()) {
    for (const second of graph.tasks.slice(index + 1)) {
      const sharedPath = first.writes.find((path) => second.writes.includes(path))
      if (sharedPath === undefined || areOrdered(graph, first, second)) continue
      return `Tasks "${first.id}" and "${second.id}" both write "${sharedPath}" and neither depends on the other. Make one depend on the other, or give them separate paths.`
    }
  }
  return null
}

function hasModelForTier(models: Readonly<Record<string, string>>, tier: string): boolean {
  return Object.hasOwn(models, tier) && Boolean(models[tier])
}

function findMissingModel(graph: PlanGraph, models: Readonly<Record<string, string>>): string | null {
  const task = graph.tasks.find((candidate) => !hasModelForTier(models, candidate.tier))
  if (task === undefined) return null
  return `Task "${task.id}" has tier "${task.tier}", which has no model in args.models. Resolve a model for that tier.`
}

function findPlanProblem(args: WaveArgs): string | null {
  const graph: PlanGraph = { tasks: args.tasks, tasksById: indexById(args.tasks) }
  return (
    findDuplicateId(args.tasks) ??
    findUnknownDependency(graph, args.completed) ??
    findCycle(graph) ??
    findWriteConflict(graph) ??
    findMissingModel(graph, args.models)
  )
}

function pendingTasksOf(args: WaveArgs): WaveTask[] {
  const finished = new Set([...args.completed, ...args.stopped])
  return args.tasks.filter((task) => !finished.has(task.id))
}

function dependsOnStopped(graph: PlanGraph, stopped: readonly string[], task: WaveTask): boolean {
  return [...ancestorIds(graph, task)].some((id) => stopped.includes(id))
}

function selectWave(args: WaveArgs): WavePlan {
  const graph: PlanGraph = { tasks: args.tasks, tasksById: indexById(args.tasks) }
  const pendingTasks = pendingTasksOf(args)
  const heldIds = pendingTasks
    .filter((task) => dependsOnStopped(graph, args.stopped, task))
    .map((task) => task.id)
  const wave = pendingTasks
    .filter((task) => !heldIds.includes(task.id) && task.dependsOn.every((id) => args.completed.includes(id)))
    .slice(0, MAX_WAVE_SIZE)
  const waveIds = wave.map((task) => task.id)
  const remaining = pendingTasks
    .map((task) => task.id)
    .filter((id) => !heldIds.includes(id) && !waveIds.includes(id))
  if (wave.length === 0) return { kind: 'nothing-to-run', held: heldIds, remaining }
  return { kind: 'wave', args, wave, held: heldIds, remaining }
}

export function planWave(input: unknown): WavePlan {
  const argsProblem = findArgsProblem(input)
  if (argsProblem) return { kind: 'invalid', problem: argsProblem }
  const args = input as WaveArgs
  const planProblem = findPlanProblem(args)
  if (planProblem) return { kind: 'invalid', problem: planProblem }
  return selectWave(args)
}
