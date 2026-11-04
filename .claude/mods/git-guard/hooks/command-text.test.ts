import { expect, test } from 'claude-code/testing'
import { gitSubcommand, segmentsOf, unquotedSegmentsOf } from './command-text'

test('unquoted segments include the command after an && separator', async () => {
  expect(unquotedSegmentsOf('cd x && git push origin main')).toContain('git push origin main')
})

test('unquoted segments drop a double-quoted argument so its words are not matched', async () => {
  const segments = unquotedSegmentsOf('git commit -m "push it"')
  expect(segments.some(segment => segment.includes('push'))).toBe(false)
})

test('unquoted segments match a push after an escaped space in a directory option', async () => {
  const segments = unquotedSegmentsOf('git -C my\\ dir push')
  expect(segments.some(segment => gitSubcommand('push').test(segment))).toBe(true)
})

test('segments split on a lone ampersand', async () => {
  expect(segmentsOf('git restore --staged f & git restore g')).toContain('git restore g')
})

test('segments keep a stderr redirection in one piece', async () => {
  expect(segmentsOf('git status 2>&1')).toEqual(['git status 2>&1'])
})

test('segments keep a combined redirection in one piece', async () => {
  expect(segmentsOf('ls &> out')).toEqual(['ls &> out'])
})

test('segments keep a redirection to a descriptor in one piece', async () => {
  expect(segmentsOf('ls >&2')).toEqual(['ls >&2'])
})

test('segments split a pipe-ampersand as a pipe with no lone ampersand left', async () => {
  expect(segmentsOf('git status |& cat')).toEqual(['git status', 'cat'])
})

test('unquoted segments list a plain command once', async () => {
  expect(unquotedSegmentsOf('git rebase main')).toEqual(['git rebase main'])
})
