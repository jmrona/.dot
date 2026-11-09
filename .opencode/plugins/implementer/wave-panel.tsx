/** @jsxImportSource @opentui/solid */
import { useKeyboard } from '@opentui/solid'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { Accessor, JSX } from 'solid-js'
import { gateRow, phaseRows, stepRows } from './progress-view.ts'
import type { GateRow, PanelPhase, StepRow } from './progress-view.ts'
import type { ProgressStep, StepKey, StepState, WaveProgress } from './progress.ts'
import StepCard from './step-card.tsx'

export const PANEL_NAME = 'implementer.wave'

export interface StepSession {
  readonly messages: readonly unknown[]
  readonly agent: string | undefined
}

export interface WavePanelProps {
  readonly progress: WaveProgress | undefined
  readonly tokens: ReadonlyMap<string, number>
  readonly now: number
  readonly isFocused: () => boolean
  readonly onClose: () => void
  readonly loadSession: (sessionID: string) => Promise<StepSession>
  readonly onOpenSession: (sessionID: string) => void
}

interface Entry {
  readonly phase: PanelPhase
  readonly key: StepKey | undefined
  readonly stepIndex: number
}

interface StepLine {
  readonly text: string
  readonly stepIndex: number
}

const LEFT_COLUMN_WIDTH = 22
const NO_ENTRY: Entry = { phase: 'implement', key: undefined, stepIndex: -1 }
const INITIAL_SELECTION: Entry = { phase: 'implement', key: undefined, stepIndex: 0 }
export const NO_SESSION: StepSession = { messages: [], agent: undefined }
const STATE_MARKERS: Readonly<Record<StepState, string>> = { running: '[RUN]', done: '[OK]', failed: '[FAIL]' }

function entriesOf(progress: WaveProgress | undefined): readonly Entry[] {
  if (progress === undefined) {
    return []
  }
  return phaseRows(progress).flatMap((row) => entriesOfPhase(progress, row.phase))
}

function keyOf(step: ProgressStep): StepKey {
  return { taskID: step.taskID, phase: step.phase, attempt: step.attempt }
}

function entriesOfPhase(progress: WaveProgress, phase: PanelPhase): readonly Entry[] {
  const steps = progress.steps.filter((step) => step.phase === phase)
  if (steps.length === 0) {
    return [{ phase, key: undefined, stepIndex: 0 }]
  }
  return steps.map((step, stepIndex) => ({ phase, key: keyOf(step), stepIndex }))
}

function keysMatch(first: StepKey | undefined, second: StepKey | undefined): boolean {
  if (first === undefined || second === undefined) {
    return first === second
  }
  return first.taskID === second.taskID && first.phase === second.phase && first.attempt === second.attempt
}

function resolveEntry(entries: readonly Entry[], selection: Entry): Entry {
  const entriesOfSelectedPhase = entries.filter((candidate) => candidate.phase === selection.phase)
  const exactMatch = entriesOfSelectedPhase.find((candidate) => keysMatch(candidate.key, selection.key))
  const nearestIndex = Math.min(selection.stepIndex, entriesOfSelectedPhase.length - 1)
  return exactMatch ?? entriesOfSelectedPhase[nearestIndex] ?? entries[0] ?? NO_ENTRY
}

function neighbourOf(candidates: readonly Entry[], current: Entry, delta: number): Entry | undefined {
  const index = candidates.indexOf(current)
  if (index === -1) {
    return undefined
  }
  return candidates[Math.max(0, Math.min(candidates.length - 1, index + delta))]
}

function stepOf(progress: WaveProgress | undefined, entry: Entry): ProgressStep | undefined {
  if (progress === undefined || entry.phase === 'gate') {
    return undefined
  }
  return progress.steps.filter((step) => step.phase === entry.phase)[entry.stepIndex]
}

function markerOf(isSelected: boolean): string {
  return isSelected ? '>' : ' '
}

function stepListText(row: StepRow, isSelected: boolean): string {
  return `${markerOf(isSelected)} ${STATE_MARKERS[row.state]} ${row.label}  ${row.model} - ${row.tokens}  ${row.duration}`
}

function gateListText(row: GateRow): string {
  return `> ${row.label}  ${row.state}  ${row.duration}`
}

function listLinesOf(props: WavePanelProps, entry: Entry): readonly StepLine[] {
  if (props.progress === undefined) {
    return []
  }
  if (entry.phase === 'gate') {
    return [{ text: gateListText(gateRow(props.progress, props.now)), stepIndex: 0 }]
  }
  return stepRows(props.progress, entry.phase, props.tokens, props.now).map((row, stepIndex) => ({
    text: stepListText(row, stepIndex === entry.stepIndex),
    stepIndex,
  }))
}

function phaseLinesOf(progress: WaveProgress | undefined, entry: Entry): readonly string[] {
  if (progress === undefined) {
    return []
  }
  return phaseRows(progress).map((row) => `${markerOf(row.phase === entry.phase)} ${row.label} ${row.done}/${row.total}`)
}

function cardLinesOf(props: WavePanelProps, entry: Entry): readonly string[] {
  if (props.progress === undefined || entry.phase === 'gate') {
    return []
  }
  return stepRows(props.progress, entry.phase, props.tokens, props.now).map(
    (row, stepIndex) => `${markerOf(stepIndex === entry.stepIndex)} ${row.label}`,
  )
}

interface CursorState {
  readonly entry: Accessor<Entry>
  readonly moveUp: () => void
  readonly moveDown: () => void
  readonly moveStepUp: () => void
  readonly moveStepDown: () => void
  readonly selectStep: (stepIndex: number) => void
}

interface CardState {
  readonly step: Accessor<ProgressStep | undefined>
  readonly session: Accessor<StepSession>
  readonly enter: () => void
  readonly leave: () => void
  readonly isOpen: Accessor<boolean>
}

interface PanelLines {
  readonly left: Accessor<readonly string[]>
  readonly list: Accessor<readonly StepLine[]>
}

function createCursor(entries: Accessor<readonly Entry[]>): CursorState {
  const [selection, setSelection] = createSignal<Entry>(INITIAL_SELECTION)
  const entry = createMemo(() => resolveEntry(entries(), selection()))

  function entriesOfSelectedPhase(): readonly Entry[] {
    return entries().filter((candidate) => candidate.phase === entry().phase)
  }

  function moveAmong(candidates: () => readonly Entry[], delta: number): () => void {
    return function move(): void {
      const target = neighbourOf(candidates(), entry(), delta)
      if (target !== undefined) {
        setSelection(target)
      }
    }
  }

  function selectStep(stepIndex: number): void {
    const target = entriesOfSelectedPhase().find((candidate) => candidate.stepIndex === stepIndex)
    if (target !== undefined) {
      setSelection(target)
    }
  }

  return {
    entry,
    moveUp: moveAmong(entries, -1),
    moveDown: moveAmong(entries, 1),
    moveStepUp: moveAmong(entriesOfSelectedPhase, -1),
    moveStepDown: moveAmong(entriesOfSelectedPhase, 1),
    selectStep,
  }
}

function createCardState(props: WavePanelProps, entry: Accessor<Entry>): CardState {
  const [isOpen, setIsOpen] = createSignal(false)
  const [session, setSession] = createSignal<StepSession>(NO_SESSION)
  let latestLoad = 0
  const step = createMemo(() => (isOpen() ? stepOf(props.progress, entry()) : undefined))
  const sessionIDOfStep = createMemo(() => step()?.sessionID ?? undefined)

  async function loadSession(sessionID: string): Promise<void> {
    const thisLoad = ++latestLoad
    const loaded = await props.loadSession(sessionID)
    if (thisLoad === latestLoad) {
      setSession(loaded)
    }
  }

  function loadSessionOfStep(): void {
    const sessionID = step()?.sessionID
    if (sessionID !== undefined && sessionID !== null) {
      void loadSession(sessionID)
    }
  }

  function discardLoadedSession(): void {
    sessionIDOfStep()
    latestLoad += 1
    setSession(NO_SESSION)
  }

  function enter(): void {
    if (stepOf(props.progress, entry())?.sessionID) {
      setSession(NO_SESSION)
      setIsOpen(true)
    }
  }

  function leave(): void {
    latestLoad += 1
    setIsOpen(false)
  }

  createEffect(discardLoadedSession)
  createEffect(loadSessionOfStep)
  return { step, session, enter, leave, isOpen }
}

function createLines(props: WavePanelProps, entry: Accessor<Entry>, cardStep: Accessor<ProgressStep | undefined>): PanelLines {
  const left = createMemo(() =>
    cardStep() === undefined ? phaseLinesOf(props.progress, entry()) : cardLinesOf(props, entry()),
  )
  const list = createMemo(() => listLinesOf(props, entry()))
  return { left, list }
}

function useListAndCardKeys(props: WavePanelProps, cursor: CursorState, card: CardState): void {
  function enterAfterKeyDispatch(): void {
    queueMicrotask(card.enter)
  }

  const listActions: Readonly<Record<string, (() => void) | undefined>> = {
    up: cursor.moveUp,
    down: cursor.moveDown,
    return: enterAfterKeyDispatch,
    escape: props.onClose,
  }

  const cardActions: Readonly<Record<string, (() => void) | undefined>> = {
    up: cursor.moveStepUp,
    down: cursor.moveStepDown,
    escape: card.leave,
  }

  function handleKey(key: { name: string }): void {
    if (!props.isFocused()) {
      return
    }
    const actions = card.isOpen() ? cardActions : listActions
    actions[key.name]?.()
  }

  useKeyboard(handleKey)
}

export default function WavePanel(props: WavePanelProps): JSX.Element {
  const entries = createMemo(() => entriesOf(props.progress))
  const cursor = createCursor(entries)
  const card = createCardState(props, cursor.entry)
  const lines = createLines(props, cursor.entry, card.step)

  function stepSelector(stepIndex: number): () => void {
    return function selectAndEnterCard(): void {
      cursor.selectStep(stepIndex)
      card.enter()
    }
  }

  function openSelectedSession(): void {
    const sessionID = card.step()?.sessionID
    if (sessionID !== undefined && sessionID !== null) {
      props.onOpenSession(sessionID)
    }
  }

  useListAndCardKeys(props, cursor, card)

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <text>implementation-wave</text>
      <box flexDirection="row" flexGrow={1}>
        <box flexDirection="column" width={LEFT_COLUMN_WIDTH}>
          <For each={lines.left()}>{(line) => <text>{line}</text>}</For>
        </box>
        <box flexDirection="column" flexGrow={1} paddingLeft={2}>
          <Show
            when={card.step()}
            fallback={
              <For each={lines.list()}>
                {(line) => (
                  <box onMouseUp={stepSelector(line.stepIndex)}>
                    <text>{line.text}</text>
                  </box>
                )}
              </For>
            }
          >
            {(step) => (
              <StepCard
                step={step()}
                messages={card.session().messages}
                agent={card.session().agent}
                tokens={props.tokens.get(step().sessionID ?? '')}
                now={props.now}
                isFocused={props.isFocused}
                onOpenSession={openSelectedSession}
              />
            )}
          </Show>
        </box>
      </box>
    </box>
  )
}
