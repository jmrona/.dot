import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function section(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const level = heading.match(/^#+/)[0].length
  const rest = text.slice(start + heading.length)
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'))
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next)
}

const reusingSection = () =>
  section(read('rules/php/coding-style.md'), '## Reusing Existing Functions')

test('php reuse rule requires searching for existing code by behaviour', () => {
  assert.ok(
    reusingSection().includes('Search by behaviour'),
    'the reuse section asks to search by behaviour',
  )
})

test('php reuse rule forbids writing a method that repeats existing logic', () => {
  assert.ok(
    reusingSection().includes(
      'You **MUST NOT** write a method that repeats the logic of an existing one',
    ),
    'the reuse section forbids repeating the logic of an existing method',
  )
})

test('php reuse rule extends a near match only with a parameter the current task needs', () => {
  assert.ok(
    reusingSection().includes('add a parameter that the current task needs'),
    'the reuse section limits extensions to parameters the current task needs',
  )
})

test('php reuse rule places extracted code under the nearest directory shared by every caller', () => {
  assert.ok(
    reusingSection().includes('nearest directory that contains every caller'),
    'the reuse section places extracted code under the nearest shared directory',
  )
})

test('php reuse rule asks before creating a shared directory the project does not define', () => {
  assert.ok(
    reusingSection().includes(
      'If the project defines no shared directory, or its rules forbid the dependency, ask before you create one',
    ),
    'the reuse section asks before creating a shared directory the project does not define',
  )
})

test('php reuse rule lets the extraction override the YAGNI section', () => {
  assert.ok(
    reusingSection().includes('this section takes precedence over the YAGNI section of'),
    'the reuse section lets the extraction override the YAGNI section',
  )
})

test('php reuse rule lets the extraction override the Follow Existing Patterns section', () => {
  assert.ok(
    reusingSection().includes('the Follow Existing Patterns section of'),
    'the reuse section lets the extraction override the Follow Existing Patterns section',
  )
})

test('php reuse rule limits the search to duplicates the current task needs', () => {
  assert.ok(
    reusingSection().includes(
      'Do not hunt for duplicates that the current task does not need',
    ),
    'the reuse section limits the search to duplicates the current task needs',
  )
})
