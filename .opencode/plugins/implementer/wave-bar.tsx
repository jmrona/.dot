/** @jsxImportSource @opentui/solid */
import { Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { barSegments } from './progress-view.ts'
import type { WaveProgress } from './progress.ts'
import SegmentLine from './segment-line.tsx'
import type { ThemeTokens } from './tone.ts'

export interface WaveBarProps {
  readonly progress: WaveProgress | undefined
  readonly tokens: ReadonlyMap<string, number>
  readonly now: number
  readonly theme: () => ThemeTokens
  readonly onOpen: () => void
}

export default function WaveBar(props: WaveBarProps): JSX.Element {
  return (
    <Show when={props.progress}>
      {(progress) => (
        <box onMouseUp={props.onOpen}>
          <SegmentLine segments={barSegments(progress(), props.tokens, props.now)} theme={props.theme} />
        </box>
      )}
    </Show>
  )
}
