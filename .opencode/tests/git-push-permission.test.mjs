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

function effectiveBashAction(command) {
  const rules = Object.entries(config.permission.bash ?? {})
  const matching = rules.filter(([pattern]) => matchesPattern(pattern, command))
  return matching.length === 0 ? undefined : matching[matching.length - 1][1]
}

test('git push is denied', () => {
  assert.equal(effectiveBashAction('git push'), 'deny')
})

test('git push to a named remote and branch is denied', () => {
  assert.equal(effectiveBashAction('git push origin main'), 'deny')
})

test('git push with the force flag is denied', () => {
  assert.equal(effectiveBashAction('git push --force'), 'deny')
})

test('git status is not denied', () => {
  assert.notEqual(effectiveBashAction('git status'), 'deny')
})
