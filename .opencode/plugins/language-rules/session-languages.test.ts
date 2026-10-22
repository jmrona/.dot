import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSessionLanguages } from './session-languages.ts'

test('returns the languages added for a session', () => {
  const registry = createSessionLanguages()

  registry.add('s1', ['go', 'php'])

  assert.deepEqual([...registry.get('s1')].sort(), ['go', 'php'])
})

test('keeps languages added by earlier calls for the same session', () => {
  const registry = createSessionLanguages()

  registry.add('s1', ['go'])
  registry.add('s1', ['php'])

  assert.deepEqual([...registry.get('s1')].sort(), ['go', 'php'])
})

test('returns an empty set for a session that was never seen', () => {
  const registry = createSessionLanguages()

  assert.equal(registry.get('unknown').size, 0)
})

test('does not share languages between sessions', () => {
  const registry = createSessionLanguages()

  registry.add('s1', ['go'])

  assert.equal(registry.get('s2').has('go'), false)
})

test('forgets the languages of a deleted session', () => {
  const registry = createSessionLanguages()
  registry.add('s1', ['go'])

  registry.forget('s1')

  assert.equal(registry.get('s1').size, 0)
})
