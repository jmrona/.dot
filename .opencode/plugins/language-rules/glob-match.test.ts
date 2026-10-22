import assert from 'node:assert/strict'
import { test } from 'node:test'

import { referenceMatchesGlobs } from './glob-match.ts'

const TYPESCRIPT_GLOBS = ['**/*.ts', '**/*.tsx', '**/*.d.ts']
const PHP_TEST_GLOBS = ['**/tests/**/*.php', '**/*Test.php', '**/phpunit.xml']

test('matches an absolute path by extension', () => {
  assert.equal(referenceMatchesGlobs('/repo/src/app.tsx', TYPESCRIPT_GLOBS), true)
})

test('matches a bare filename against a recursive glob', () => {
  assert.equal(referenceMatchesGlobs('app.ts', TYPESCRIPT_GLOBS), true)
})

test('does not match a path with another extension', () => {
  assert.equal(referenceMatchesGlobs('/repo/main.go', TYPESCRIPT_GLOBS), false)
})

test('matches a path under a tests directory', () => {
  assert.equal(referenceMatchesGlobs('/repo/tests/Feature/UserTest.php', PHP_TEST_GLOBS), true)
})

test('matches an exact filename glob', () => {
  assert.equal(referenceMatchesGlobs('/repo/phpunit.xml', PHP_TEST_GLOBS), true)
})

test('matches a star extension pattern when files with that extension would match', () => {
  assert.equal(referenceMatchesGlobs('*.ts', TYPESCRIPT_GLOBS), true)
})

test('matches a recursive extension pattern', () => {
  assert.equal(referenceMatchesGlobs('src/**/*.tsx', TYPESCRIPT_GLOBS), true)
})

test('does not match a star extension pattern of another language', () => {
  assert.equal(referenceMatchesGlobs('**/*.go', TYPESCRIPT_GLOBS), false)
})

test('matches every alternative of a brace pattern', () => {
  assert.equal(referenceMatchesGlobs('*.{go,tsx}', TYPESCRIPT_GLOBS), true)
})

test('does not match a directory path without an extension', () => {
  assert.equal(referenceMatchesGlobs('/repo/src', TYPESCRIPT_GLOBS), false)
})

test('matches a file inside a dot directory', () => {
  assert.equal(referenceMatchesGlobs('/Users/x/.config/opencode/a.ts', TYPESCRIPT_GLOBS), true)
})

test('matches an absolute path that passes through a worktrees dot directory', () => {
  assert.equal(referenceMatchesGlobs('/Users/x/.worktrees/a/src/a.ts', TYPESCRIPT_GLOBS), true)
})

test('matches a dotfile against the JavaScript globs', () => {
  assert.equal(referenceMatchesGlobs('/r/.eslintrc.js', ['**/*.js', '**/*.mjs']), true)
})

test('matches a recursive pattern that starts inside a dot directory', () => {
  assert.equal(referenceMatchesGlobs('.claude/**/*.ts', TYPESCRIPT_GLOBS), true)
})
