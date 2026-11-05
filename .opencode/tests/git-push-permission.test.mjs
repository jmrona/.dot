import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(
  readFileSync(new URL('../opencode.json', import.meta.url), 'utf8'),
)

function matchesPattern(pattern, command) {
  const source = pattern
    .split('')
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '.'
      return character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${source}$`, 's').test(command)
}

function effectiveShellEffect(command) {
  const matching = (config.permissions ?? []).filter(
    (rule) => rule.action === 'shell' && matchesPattern(rule.resource, command),
  )
  return matching.at(-1)?.effect
}

test('git push is denied', () => {
  assert.equal(effectiveShellEffect('git push'), 'deny')
})

test('git push to a named remote and branch is denied', () => {
  assert.equal(effectiveShellEffect('git push origin main'), 'deny')
})

test('git push with the force flag is denied', () => {
  assert.equal(effectiveShellEffect('git push --force'), 'deny')
})

test('git status falls back to the default shell permission', () => {
  assert.equal(effectiveShellEffect('git status'), undefined)
})

test('shell rules do not use the deprecated permission bash key', () => {
  assert.equal(config.permission?.bash, undefined)
})
