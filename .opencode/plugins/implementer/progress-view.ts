import { readFile } from 'node:fs/promises'

import { contextTokensOf } from '../auto-compact/context-usage.ts'
import type { StepTokens } from '../auto-compact/context-usage.ts'
import {
  BAR_EMPTY,
  BAR_FILLED,
  BAR_ICON,
  GATE_STATE_GLYPHS,
  PHASE_GLYPHS,
  SELECTED_GLYPH,
  STEP_STATE_GLYPHS,
  UNSELECTED_GLYPH,
} from './glyphs.ts'
import { PROGRESS_VERSION } from './progress.ts'
import type {
  GateProgress,
  GateState,
  ProgressPhase,
  ProgressStep,
  StepKey,
  StepState,
  WaveProgress,
} from './progress.ts'
import { GATE_STATE_TONES, STEP_STATE_TONES } from './tone.ts'
import type { Segment } from './tone.ts'

export interface ProgressData {
  readonly session: { get(sessionID: string): unknown; message: { list(sessionID: string): unknown } }
}
export type PanelPhase = ProgressPhase | 'gate'
export interface PhaseRow {
  readonly phase: PanelPhase
  readonly label: 'Implement' | 'Review' | 'Correct' | 'Gate'
  readonly done: number
  readonly total: number
}
export interface StepRow {
  readonly key: StepKey
  readonly label: string
  readonly model: string
  readonly tokens: string
  readonly duration: string
  readonly state: StepState
  readonly sessionID: string | null
}
export interface GateRow {
  readonly label: 'gate'
  readonly state: GateState
  readonly duration: string
}

interface MessageRecord {
  readonly type?: unknown
  readonly tokens?: unknown
}

interface AssistantMessage extends MessageRecord {
  readonly type: 'assistant'
  readonly tokens: StepTokens
}

const STEP_PHASES: readonly ProgressPhase[] = ['implement', 'review', 'correct']
const PHASE_LABELS: Readonly<Record<ProgressPhase, 'Implement' | 'Review' | 'Correct'>> = {
  implement: 'Implement',
  review: 'Review',
  correct: 'Correct',
}
const STEP_STATES: readonly string[] = ['running', 'done', 'failed']
const GATE_STATES: readonly string[] = ['pending', 'running', 'passed', 'failed', 'skipped']
const BAR_WIDTH = 10
const MAX_PARENT_LOOKUPS = 10

export async function readWaveProgress(path: string): Promise<WaveProgress | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isWaveProgress(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export async function rootSessionOf(data: ProgressData, sessionID: string): Promise<string> {
  let currentID = sessionID
  for (let lookup = 0; lookup < MAX_PARENT_LOOKUPS; lookup += 1) {
    const parentID = await readParentID(data, currentID)
    if (parentID === undefined) {
      return currentID
    }
    currentID = parentID
  }
  return currentID
}

export async function sessionTokens(data: ProgressData, sessionID: string): Promise<number | undefined> {
  try {
    const messages: unknown = await data.session.message.list(sessionID)
    return Array.isArray(messages) ? sumAssistantTokens(messages) : undefined
  } catch {
    return undefined
  }
}

export async function collectSessionTokens(
  data: ProgressData,
  progress: WaveProgress,
): Promise<ReadonlyMap<string, number>> {
  const sessionIDs = new Set(progress.steps.flatMap(sessionIDsOfStep))
  const totals = await Promise.all(
    [...sessionIDs].map(async (sessionID) => ({ sessionID, tokens: await sessionTokens(data, sessionID) })),
  )
  return new Map(
    totals.flatMap(({ sessionID, tokens }) => (tokens === undefined ? [] : [[sessionID, tokens] as const])),
  )
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}m${padTwoDigits(totalSeconds % 60)}s`
  }
  return `${Math.floor(totalMinutes / 60)}h${padTwoDigits(totalMinutes % 60)}m`
}

export function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined) {
    return '- tok'
  }
  if (tokens < 1000) {
    return `${tokens} tok`
  }
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}k tok`
  }
  return `${(tokens / 1_000_000).toFixed(1)}m tok`
}

export function barSegments(
  progress: WaveProgress,
  tokensBySession: ReadonlyMap<string, number>,
  now: number,
): readonly Segment[] {
  const started = progress.steps.length
  const done = progress.steps.filter(isFinishedStep).length
  const elapsed = formatDuration(now - progress.startedAt)
  const total = formatTokens(totalTokens(progress, tokensBySession))
  const filled = filledCells(done, started)
  return withoutEmptySegments([
    { text: BAR_ICON, tone: 'info' },
    { text: ' implementation-wave ', tone: 'base' },
    { text: BAR_FILLED.repeat(filled), tone: 'success' },
    { text: BAR_EMPTY.repeat(BAR_WIDTH - filled), tone: 'muted' },
    { text: ` ${done}/${started} ${elapsed} ${total}`, tone: 'muted' },
  ])
}

export function phaseLineSegments(row: PhaseRow, isSelected: boolean): readonly Segment[] {
  return [
    markerSegment(isSelected),
    { text: ` ${PHASE_GLYPHS[row.phase]} ${row.label}`, tone: 'base' },
    { text: ` ${row.done}/${row.total}`, tone: 'muted' },
  ]
}

export function stepLineSegments(row: StepRow, isSelected: boolean): readonly Segment[] {
  return [
    markerSegment(isSelected),
    { text: ` ${STEP_STATE_GLYPHS[row.state]}`, tone: STEP_STATE_TONES[row.state] },
    { text: ` ${row.label}`, tone: 'base' },
    { text: `  ${row.model} - ${row.tokens}  ${row.duration}`, tone: 'muted' },
  ]
}

export function cardStepLineSegments(row: StepRow, isSelected: boolean): readonly Segment[] {
  return [markerSegment(isSelected), { text: ` ${row.label}`, tone: 'base' }]
}

export function gateLineSegments(row: GateRow, isSelected: boolean): readonly Segment[] {
  const stateTone = GATE_STATE_TONES[row.state]
  return [
    markerSegment(isSelected),
    { text: ` ${GATE_STATE_GLYPHS[row.state]}`, tone: stateTone },
    { text: ` ${row.label}`, tone: 'base' },
    { text: `  ${row.state}`, tone: stateTone },
    { text: `  ${row.duration}`, tone: 'muted' },
  ]
}

export function phaseRows(progress: WaveProgress): readonly PhaseRow[] {
  return [...STEP_PHASES.map((phase) => stepPhaseRow(progress, phase)), gatePhaseRow(progress)]
}

export function stepRows(
  progress: WaveProgress,
  phase: ProgressPhase,
  tokensBySession: ReadonlyMap<string, number>,
  now: number,
): readonly StepRow[] {
  return stepsOfPhase(progress, phase).map((step) => stepRowOf(step, tokensBySession, now))
}

export function gateRow(progress: WaveProgress, now: number): GateRow {
  const { startedAt, endedAt, state } = progress.gate
  const duration = startedAt === null ? '' : formatDuration(durationOf(startedAt, endedAt, now))
  return { label: 'gate', state, duration }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isProgressPhase(value: unknown): value is ProgressPhase {
  return STEP_PHASES.some((phase) => phase === value)
}

function isStepState(value: unknown): value is StepState {
  return STEP_STATES.includes(value as string)
}

function isGateState(value: unknown): value is GateState {
  return GATE_STATES.includes(value as string)
}

function hasStepIdentity(record: Record<string, unknown>): boolean {
  return (
    typeof record.taskID === 'string' &&
    typeof record.title === 'string' &&
    typeof record.model === 'string' &&
    isProgressPhase(record.phase) &&
    typeof record.attempt === 'number'
  )
}

function hasStepTiming(record: Record<string, unknown>): boolean {
  return (
    isNullableString(record.sessionID) &&
    typeof record.startedAt === 'number' &&
    isNullableNumber(record.endedAt) &&
    isStepState(record.state)
  )
}

function isProgressStep(value: unknown): value is ProgressStep {
  return isRecord(value) && hasStepIdentity(value) && hasStepTiming(value)
}

function isGateProgress(value: unknown): value is GateProgress {
  return (
    isRecord(value) &&
    isNullableNumber(value.startedAt) &&
    isNullableNumber(value.endedAt) &&
    isGateState(value.state)
  )
}

function isWaveProgress(value: unknown): value is WaveProgress {
  return (
    isRecord(value) &&
    value.version === PROGRESS_VERSION &&
    typeof value.rootSessionID === 'string' &&
    typeof value.startedAt === 'number' &&
    Array.isArray(value.steps) &&
    value.steps.every(isProgressStep) &&
    isGateProgress(value.gate)
  )
}

function isAssistantWithTokens(message: unknown): message is AssistantMessage {
  return isRecord(message) && message.type === 'assistant' && message.tokens !== undefined
}

function sumAssistantTokens(messages: readonly unknown[]): number {
  return messages
    .filter(isAssistantWithTokens)
    .reduce((total, message) => total + contextTokensOf(message.tokens), 0)
}

async function readParentID(data: ProgressData, sessionID: string): Promise<string | undefined> {
  try {
    const session: unknown = await data.session.get(sessionID)
    const parentID = isRecord(session) ? session.parentID : undefined
    return typeof parentID === 'string' ? parentID : undefined
  } catch {
    return undefined
  }
}

function sessionIDsOfStep(step: ProgressStep): readonly string[] {
  return step.sessionID === null ? [] : [step.sessionID]
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function isFinishedStep(step: ProgressStep): boolean {
  return step.state !== 'running'
}

function filledCells(done: number, started: number): number {
  return started === 0 ? 0 : Math.round((BAR_WIDTH * done) / started)
}

function markerSegment(isSelected: boolean): Segment {
  return { text: isSelected ? SELECTED_GLYPH : UNSELECTED_GLYPH, tone: 'base' }
}

function withoutEmptySegments(segments: readonly Segment[]): readonly Segment[] {
  return segments.filter((segment) => segment.text !== '')
}

function tokensOfStep(step: ProgressStep, tokensBySession: ReadonlyMap<string, number>): number | undefined {
  return step.sessionID === null ? undefined : tokensBySession.get(step.sessionID)
}

function totalTokens(progress: WaveProgress, tokensBySession: ReadonlyMap<string, number>): number | undefined {
  const knownTotals = progress.steps
    .map((step) => tokensOfStep(step, tokensBySession))
    .filter((tokens): tokens is number => tokens !== undefined)
  return knownTotals.length === 0 ? undefined : knownTotals.reduce((total, tokens) => total + tokens, 0)
}

function stepsOfPhase(progress: WaveProgress, phase: ProgressPhase): readonly ProgressStep[] {
  return progress.steps.filter((step) => step.phase === phase)
}

function stepPhaseRow(progress: WaveProgress, phase: ProgressPhase): PhaseRow {
  const steps = stepsOfPhase(progress, phase)
  return { phase, label: PHASE_LABELS[phase], done: steps.filter(isFinishedStep).length, total: steps.length }
}

function gatePhaseRow(progress: WaveProgress): PhaseRow {
  const isGateFinished = ['passed', 'failed', 'skipped'].includes(progress.gate.state)
  return { phase: 'gate', label: 'Gate', done: isGateFinished ? 1 : 0, total: 1 }
}

function stepRowOf(step: ProgressStep, tokensBySession: ReadonlyMap<string, number>, now: number): StepRow {
  return {
    key: { taskID: step.taskID, phase: step.phase, attempt: step.attempt },
    label: `${step.phase}:${step.taskID}`,
    model: step.model,
    tokens: formatTokens(tokensOfStep(step, tokensBySession)),
    duration: formatDuration(durationOf(step.startedAt, step.endedAt, now)),
    state: step.state,
    sessionID: step.sessionID,
  }
}

function durationOf(startedAt: number, endedAt: number | null, now: number): number {
  return (endedAt ?? now) - startedAt
}
