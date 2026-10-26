import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('enables the experimental todowrite tool so the todo sidebar has a list to show', () => {
  const config = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf8'))
  assert.equal(config.experimental?.todo, true)
})
