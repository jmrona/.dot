/** @jsxImportSource @opentui/solid */
import { TextAttributes } from '@opentui/core'
import { For } from 'solid-js'
import type { JSX } from 'solid-js'
import { colourOf } from './tone.ts'
import type { Segment, ThemeTokens } from './tone.ts'

export interface SegmentLineProps {
  readonly segments: readonly Segment[]
  readonly theme: () => ThemeTokens
  readonly isBold?: boolean
}

export default function SegmentLine(props: SegmentLineProps): JSX.Element {
  function attributesOf(): number {
    return props.isBold === true ? TextAttributes.BOLD : TextAttributes.NONE
  }

  return (
    <box flexDirection="row">
      <For each={props.segments}>
        {(segment) => (
          <text fg={colourOf(props.theme(), segment.tone)} attributes={attributesOf()}>
            {segment.text}
          </text>
        )}
      </For>
    </box>
  )
}
