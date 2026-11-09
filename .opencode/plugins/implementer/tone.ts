import type { GateState, StepState } from './progress.ts'

export type Tone = 'base' | 'muted' | 'info' | 'success' | 'warning' | 'error'
export interface Segment {
  readonly text: string
  readonly tone: Tone
}
export type ThemeColour = string | object

interface FeedbackToken {
  readonly base?: ThemeColour
}

export interface ThemeTokens {
  readonly text: {
    readonly base?: ThemeColour
    readonly muted?: ThemeColour
    readonly feedback?: {
      readonly success?: FeedbackToken
      readonly warning?: FeedbackToken
      readonly error?: FeedbackToken
      readonly info?: FeedbackToken
    }
  }
}

export const STEP_STATE_TONES: Readonly<Record<StepState, Tone>> = {
  running: 'warning',
  done: 'success',
  failed: 'error',
}

export const GATE_STATE_TONES: Readonly<Record<GateState, Tone>> = {
  pending: 'muted',
  running: 'warning',
  passed: 'success',
  failed: 'error',
  skipped: 'muted',
}

export function colourOf(theme: ThemeTokens, tone: Tone): ThemeColour | undefined {
  if (tone === 'base') {
    return theme.text.base
  }
  if (tone === 'muted') {
    return theme.text.muted
  }
  return theme.text.feedback?.[tone]?.base
}
