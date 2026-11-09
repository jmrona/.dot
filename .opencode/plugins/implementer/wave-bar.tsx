/** @jsxImportSource @opentui/solid */
import { Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { barLabel } from './progress-view.ts'
import type { WaveProgress } from './progress.ts'

export interface WaveBarProps {
  readonly progress: WaveProgress | undefined
  readonly tokens: ReadonlyMap<string, number>
  readonly now: number
  readonly onOpen: () => void
}

export default function WaveBar(props: WaveBarProps): JSX.Element {
  function labelOf(): string {
    return props.progress === undefined ? '' : `o ${barLabel(props.progress, props.tokens, props.now)}`
  }

  return (
    <Show when={props.progress !== undefined}>
      <box onMouseUp={props.onOpen}>
        <text>{labelOf()}</text>
      </box>
    </Show>
  )
}
