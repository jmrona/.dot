/** @jsxImportSource @opentui/solid */
import { useKeyboard } from '@opentui/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import type { ProgressStep } from './progress.ts'
import SegmentLine from './segment-line.tsx'
import { buildStepDetail, countsSegments, headerSegments, visibleBlocks } from './step-detail.ts'
import type { BlockView, CardBlocks } from './step-detail.ts'
import type { Segment, ThemeTokens } from './tone.ts'

export interface StepCardProps {
  readonly step: ProgressStep
  readonly messages: readonly unknown[]
  readonly agent: string | undefined
  readonly tokens: number | undefined
  readonly now: number
  readonly theme: () => ThemeTokens
  readonly isFocused: () => boolean
  readonly onOpenSession: () => void
}

interface ScrollHandle {
  scrollBy(amount: number): void
  scrollTo(position: number): void
}

interface ScrollControls {
  readonly assign: (handle: ScrollHandle) => void
  readonly down: () => void
  readonly up: () => void
  readonly toTop: () => void
}

type KeyActions = Readonly<Record<string, (() => void) | undefined>>

const SCROLL_STEP = 1
const OPEN_SESSION_SEGMENTS: readonly Segment[] = [{ text: 'open session', tone: 'info' }]

function blockList(blocks: CardBlocks): readonly BlockView[] {
  return [blocks.prompt, blocks.activity, blocks.outcome]
}

function hiddenNotice(hidden: number): readonly Segment[] {
  return [{ text: `... ${hidden} more lines`, tone: 'muted' }]
}

function durationOf(step: ProgressStep, now: number): number {
  return (step.endedAt ?? now) - step.startedAt
}

function createScrollControls(): ScrollControls {
  let scrollHandle: ScrollHandle | undefined
  function assign(handle: ScrollHandle): void {
    scrollHandle = handle
  }
  function down(): void {
    scrollHandle?.scrollBy(SCROLL_STEP)
  }
  function up(): void {
    scrollHandle?.scrollBy(-SCROLL_STEP)
  }
  function toTop(): void {
    scrollHandle?.scrollTo(0)
  }
  return { assign, down, up, toTop }
}

function useFocusedKeys(isFocused: () => boolean, actions: KeyActions): void {
  function handleKey(key: { name: string }): void {
    if (isFocused()) {
      actions[key.name]?.()
    }
  }
  useKeyboard(handleKey)
}

export default function StepCard(props: StepCardProps): JSX.Element {
  const [isExpanded, setIsExpanded] = createSignal(false)
  const scroll = createScrollControls()
  const detail = createMemo(() => buildStepDetail(props.step, props.messages, props.agent))
  const blocks = createMemo(() => blockList(visibleBlocks(detail(), isExpanded())))

  function toggleExpansion(): void {
    setIsExpanded(!isExpanded())
    scroll.toTop()
  }

  useFocusedKeys(props.isFocused, { j: scroll.down, k: scroll.up, return: toggleExpansion, o: props.onOpenSession })

  return (
    <box flexDirection="column" flexGrow={1}>
      <SegmentLine segments={headerSegments(detail())} theme={props.theme} />
      <SegmentLine
        segments={countsSegments(detail(), props.tokens, durationOf(props.step, props.now))}
        theme={props.theme}
      />
      <scrollbox ref={scroll.assign} flexGrow={1}>
        <For each={blocks()}>
          {(block) => (
            <box flexDirection="column">
              <SegmentLine segments={block.heading} theme={props.theme} />
              <For each={block.lines}>{(line) => <text>{line}</text>}</For>
              <Show when={block.hidden > 0}>
                <SegmentLine segments={hiddenNotice(block.hidden)} theme={props.theme} />
              </Show>
            </box>
          )}
        </For>
      </scrollbox>
      <box onMouseUp={props.onOpenSession}>
        <SegmentLine segments={OPEN_SESSION_SEGMENTS} theme={props.theme} />
      </box>
    </box>
  )
}
