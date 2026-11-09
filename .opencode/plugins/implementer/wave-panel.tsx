/** @jsxImportSource @opentui/solid */
import { useKeyboard } from '@opentui/solid'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { Accessor, JSX } from 'solid-js'
import { gateRow, phaseRows, stepRows } from './progress-view.ts'
import type { GateRow, PanelPhase, StepRow } from './progress-view.ts'
import type { ProgressStep, StepState, WaveProgress } from './progress.ts'
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
  readonly stepIndex: number
}

interface StepLine {
  readonly text: string
  readonly stepIndex: number
}

const LEFT_COLUMN_WIDTH = 22
const NO_ENTRY: Entry = { phase: 'implement', stepIndex: -1 }
export const NO_SESSION: StepSession = { messages: [], agent: undefined }
const STATE_MARKERS: Readonly<Record<StepState, string>> = { running: '[RUN]', done: '[OK]', failed: '[FAIL]' }

function entriesOf(progress: WaveProgress | undefined): readonly Entry[] {
  if (progress === undefined) {
    return []
  }
  return phaseRows(progress).flatMap((row) => {
    const count = row.phase === 'gate' ? 1 : Math.max(row.total, 1)
    return Array.from({ length: count }, (_, stepIndex) => ({ phase: row.phase, stepIndex }))
  })
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
  return `${markerOf(isSelected)} ${STATE_MARKERS[row.state]} ${row.label}  ${row.model} · ${row.tokens}  ${row.duration}`
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
  const [cursor, setCursor] = createSignal(0)
  const entry = createMemo(() => entries()[cursor()] ?? NO_ENTRY)

  function moveBy(delta: number): void {
    setCursor(Math.max(0, Math.min(entries().length - 1, cursor() + delta)))
  }

  function moveUp(): void {
    moveBy(-1)
  }

  function moveDown(): void {
    moveBy(1)
  }

  function selectStep(stepIndex: number): void {
    const index = entries().findIndex((candidate) => candidate.phase === entry().phase && candidate.stepIndex === stepIndex)
    setCursor(Math.max(index, 0))
  }

  return { entry, moveUp, moveDown, selectStep }
}

function createCardState(props: WavePanelProps, entry: Accessor<Entry>): CardState {
  const [isOpen, setIsOpen] = createSignal(false)
  const [session, setSession] = createSignal<StepSession>(NO_SESSION)
  let latestLoad = 0
  const step = createMemo(() => (isOpen() ? stepOf(props.progress, entry()) : undefined))

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

  function handleKey(key: { name: string }): void {
    if (!props.isFocused()) {
      return
    }
    if (!card.isOpen()) {
      listActions[key.name]?.()
    } else if (key.name === 'escape') {
      card.leave()
    }
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
