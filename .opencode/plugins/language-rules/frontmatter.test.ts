import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseGlobs } from './frontmatter.ts'

test('parses comma-separated globs from the frontmatter', () => {
  const text = '---\nglobs: **/*.ts, **/*.tsx, **/*.d.ts\n---\n\n# Rules\n'

  assert.deepEqual(parseGlobs(text), ['**/*.ts', '**/*.tsx', '**/*.d.ts'])
})

test('skips lines before the opening frontmatter delimiter', () => {
  const text = '---\n# noinspection YAMLUnresolvedAlias\nglobs: **/*.go\n---\nbody'
  const withLeadingLine = `# noinspection YAMLUnresolvedAlias\n${text}`

  assert.deepEqual(parseGlobs(withLeadingLine), ['**/*.go'])
})

test('returns no globs when the frontmatter has no globs line', () => {
  assert.deepEqual(parseGlobs('---\ntitle: x\n---\nbody'), [])
})

test('ignores a globs line that appears after the frontmatter closes', () => {
  assert.deepEqual(parseGlobs('---\ntitle: x\n---\nglobs: **/*.go\n'), [])
})

test('returns no globs when the file has no frontmatter', () => {
  assert.deepEqual(parseGlobs('# Rules\nglobs: **/*.go\n'), [])
})
