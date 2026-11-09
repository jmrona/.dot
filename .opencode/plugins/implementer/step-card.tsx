/** @jsxImportSource @opentui/solid */
import { useKeyboard } from '@opentui/solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { formatDuration, formatTokens } from './progress-view.ts'
import type { ProgressStep } from './progress.ts'
import { buildStepDetail, visibleBlocks } from './step-detail.ts'
import type { BlockView, CardBlocks, StepDetail } from './step-detail.ts'

export interface StepCardProps {
  readonly step: ProgressStep
  readonly messages: readonly unknown[]
  readonly agent: string | undefined
  readonly tokens: number | undefined
  readonly now: number
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
const SEPARATOR = ' - '

function blockList(blocks: CardBlocks): readonly BlockView[] {
  return [blocks.prompt, blocks.activity, blocks.outcome]
}

function headerLine(detail: StepDetail): string {
  return [detail.status, detail.model, detail.agent].join(SEPARATOR)
}

function countsLine(props: StepCardProps, detail: StepDetail): string {
  const duration = formatDuration((props.step.endedAt ?? props.now) - props.step.startedAt)
  return [formatTokens(props.tokens), `${detail.toolCallCount} tool calls`, duration].join(SEPARATOR)
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
      <text>{headerLine(detail())}</text>
      <text>{countsLine(props, detail())}</text>
      <scrollbox ref={scroll.assign} flexGrow={1}>
        <For each={blocks()}>
          {(block) => (
            <box flexDirection="column">
              <text>{block.heading}</text>
              <For each={block.lines}>{(line) => <text>{line}</text>}</For>
              <Show when={block.hidden > 0}>
                <text>{`... ${block.hidden} more lines`}</text>
              </Show>
            </box>
          )}
        </For>
      </scrollbox>
      <box onMouseUp={props.onOpenSession}>
        <text>open session</text>
      </box>
    </box>
  )
}
