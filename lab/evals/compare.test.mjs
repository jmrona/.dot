import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertComparable, findRegressions, findUncomparedCases } from './compare.mjs'

function caseResult(passes, { safety = false, runs = 3 } = {}) {
  return { safety, passes, runs, environmentFailures: 0, details: [] }
}

function summary(cases, overrides = {}) {
  return { claudeCodeVersion: '2.1.0', model: 'sonnet', cases, ...overrides }
}

test('findRegressions flags a safety case that fails any run', () => {
  const baseline = summary({ safe: caseResult(3, { safety: true }) })
  const current = summary({ safe: caseResult(2, { safety: true }) })
  assert.deepEqual(findRegressions({ baseline, current }), ['safe'])
})

test('findRegressions accepts a safety case that passes every run', () => {
  const baseline = summary({ safe: caseResult(3, { safety: true }) })
  const current = summary({ safe: caseResult(3, { safety: true }) })
  assert.deepEqual(findRegressions({ baseline, current }), [])
})

test('findRegressions flags a non-safety case that loses two passes', () => {
  const baseline = summary({ soft: caseResult(3) })
  const current = summary({ soft: caseResult(1) })
  assert.deepEqual(findRegressions({ baseline, current }), ['soft'])
})

test('findRegressions tolerates a non-safety case that loses one pass', () => {
  const baseline = summary({ soft: caseResult(3) })
  const current = summary({ soft: caseResult(2) })
  assert.deepEqual(findRegressions({ baseline, current }), [])
})

test('findRegressions ignores ids that are not in both summaries', () => {
  const baseline = summary({ only_baseline: caseResult(3, { safety: true }) })
  const current = summary({ only_current: caseResult(0, { safety: true }) })
  assert.deepEqual(findRegressions({ baseline, current }), [])
})

test('findRegressions returns ids sorted', () => {
  const baseline = summary({ b: caseResult(3), a: caseResult(3) })
  const current = summary({ b: caseResult(0), a: caseResult(0) })
  assert.deepEqual(findRegressions({ baseline, current }), ['a', 'b'])
})

test('findUncomparedCases lists ids missing from the current run', () => {
  const baseline = summary({ a: caseResult(3), b: caseResult(3) })
  const current = summary({ a: caseResult(3) })
  assert.deepEqual(findUncomparedCases({ baseline, current }).missing, ['b'])
})

test('findUncomparedCases lists ids added in the current run', () => {
  const baseline = summary({ a: caseResult(3) })
  const current = summary({ a: caseResult(3), c: caseResult(3) })
  assert.deepEqual(findUncomparedCases({ baseline, current }).added, ['c'])
})

test('assertComparable accepts summaries with the same version and model', () => {
  assert.doesNotThrow(() => assertComparable({ baseline: summary({}), current: summary({}) }))
})

test('assertComparable rejects a different Claude Code version and says to recapture', () => {
  const current = summary({}, { claudeCodeVersion: '2.2.0' })
  assert.throws(
    () => assertComparable({ baseline: summary({}), current }),
    /2\.1\.0.*2\.2\.0.*recapture/s,
  )
})

test('assertComparable rejects a different model and says to recapture', () => {
  const current = summary({}, { model: 'opus' })
  assert.throws(
    () => assertComparable({ baseline: summary({}), current }),
    /sonnet.*opus.*recapture/s,
  )
})

test('findRegressions flags a safety case that has no scored runs', () => {
  const baseline = summary({ safe: caseResult(3, { safety: true }) })
  const current = summary({ safe: caseResult(0, { safety: true, runs: 0 }) })
  assert.deepEqual(findRegressions({ baseline, current }), ['safe'])
})

test('findRegressions flags a non-safety case that has no scored runs', () => {
  const baseline = summary({ soft: caseResult(1) })
  const current = summary({ soft: caseResult(0, { runs: 0 }) })
  assert.deepEqual(findRegressions({ baseline, current }), ['soft'])
})
