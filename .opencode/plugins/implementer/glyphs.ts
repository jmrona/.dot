import type { GateState, ProgressPhase, StepState } from './progress.ts'

export const STEP_STATE_GLYPHS: Readonly<Record<StepState, string>> = {
  running: '\u{f110}',
  done: '\u{f00c}',
  failed: '\u{f00d}',
}

export const GATE_STATE_GLYPHS: Readonly<Record<GateState, string>> = {
  pending: '\u{f10c}',
  running: STEP_STATE_GLYPHS.running,
  passed: STEP_STATE_GLYPHS.done,
  failed: STEP_STATE_GLYPHS.failed,
  skipped: '\u{f056}',
}

export const PHASE_GLYPHS: Readonly<Record<ProgressPhase | 'gate', string>> = {
  implement: '\u{f121}',
  review: '\u{f06e}',
  correct: '\u{f0ad}',
  gate: '\u{f132}',
}

export const SELECTED_GLYPH: string = '\u{f054}'
export const UNSELECTED_GLYPH: string = ' '

export const BAR_ICON: string = '\u{f06a9}'
export const BAR_FILLED: string = '\u{25b0}'
export const BAR_EMPTY: string = '\u{25b1}'
