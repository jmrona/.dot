import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GATE_STATE_TONES, STEP_STATE_TONES, colourOf } from './tone.ts'
import type { ThemeTokens } from './tone.ts'

const FULL_THEME: ThemeTokens = {
  text: {
    base: 'base-colour',
    muted: 'muted-colour',
    feedback: {
      info: { base: 'info-colour' },
      success: { base: 'success-colour' },
      warning: { base: 'warning-colour' },
      error: { base: 'error-colour' },
    },
  },
}

const THEME_WITHOUT_FEEDBACK: ThemeTokens = {
  text: {
    base: 'base-colour',
    muted: 'muted-colour',
  },
}

test('colourOf returns the base text token for the base tone', () => {
  assert.equal(colourOf(FULL_THEME, 'base'), 'base-colour')
})

test('colourOf returns the muted text token for the muted tone', () => {
  assert.equal(colourOf(FULL_THEME, 'muted'), 'muted-colour')
})

test('colourOf returns the info feedback token for the info tone', () => {
  assert.equal(colourOf(FULL_THEME, 'info'), 'info-colour')
})

test('colourOf returns the success feedback token for the success tone', () => {
  assert.equal(colourOf(FULL_THEME, 'success'), 'success-colour')
})

test('colourOf returns the warning feedback token for the warning tone', () => {
  assert.equal(colourOf(FULL_THEME, 'warning'), 'warning-colour')
})

test('colourOf returns the error feedback token for the error tone', () => {
  assert.equal(colourOf(FULL_THEME, 'error'), 'error-colour')
})

test('colourOf returns undefined for a feedback tone when the feedback tokens are missing', () => {
  assert.equal(colourOf(THEME_WITHOUT_FEEDBACK, 'success'), undefined)
})

test('colourOf returns undefined for a feedback tone when only its own token is missing', () => {
  const themeWithoutWarning: ThemeTokens = {
    text: {
      ...FULL_THEME.text,
      feedback: { ...FULL_THEME.text.feedback, warning: undefined },
    },
  }
  assert.equal(colourOf(themeWithoutWarning, 'warning'), undefined)
})

test('STEP_STATE_TONES maps running steps to the warning tone', () => {
  assert.equal(STEP_STATE_TONES.running, 'warning')
})

test('STEP_STATE_TONES maps done steps to the success tone', () => {
  assert.equal(STEP_STATE_TONES.done, 'success')
})

test('STEP_STATE_TONES maps failed steps to the error tone', () => {
  assert.equal(STEP_STATE_TONES.failed, 'error')
})

test('GATE_STATE_TONES maps pending gates to the muted tone', () => {
  assert.equal(GATE_STATE_TONES.pending, 'muted')
})

test('GATE_STATE_TONES maps running gates to the warning tone', () => {
  assert.equal(GATE_STATE_TONES.running, 'warning')
})

test('GATE_STATE_TONES maps passed gates to the success tone', () => {
  assert.equal(GATE_STATE_TONES.passed, 'success')
})

test('GATE_STATE_TONES maps failed gates to the error tone', () => {
  assert.equal(GATE_STATE_TONES.failed, 'error')
})

test('GATE_STATE_TONES maps skipped gates to the muted tone', () => {
  assert.equal(GATE_STATE_TONES.skipped, 'muted')
})
