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

const tdd = read('skills/test-driven-development/SKILL.md')

test('test-driven-development skill makes the orchestrator run the prune once for an orchestrated feature', () => {
  const repeat = section(tdd, '## Repeat')

  assert.match(repeat, /`subagent-driven-development`/)
  assert.match(repeat, /`fast-path-implementation`/)
  assert.match(repeat, /orchestrator runs the PRUNE once for the whole feature, before the final review/)
})

test('test-driven-development skill tells an implementer subagent not to run the prune', () => {
  const repeat = section(tdd, '## Repeat')

  assert.match(repeat, /implementer subagent does not run it/)
})

test('test-driven-development skill keeps the Phase 7 prune sentence', () => {
  const repeat = section(tdd, '## Repeat')

  assert.match(repeat, /Inside `debugging` Phase 7/)
})

test('test-driven-development prune uses the feature baseline diff instead of asking in a no-git orchestration', () => {
  const procedure = section(tdd, '### Procedure')

  assert.match(procedure, /diff -rqN "\$FEATURE_BASELINE_DIR" "\$WORKING_DIR"/)
  assert.match(procedure, /every path named in the lines that `diff -rqN/)
  assert.match(procedure, /`\$WORKING_DIR` path of each line\. Leave out files that exist only in `\$FEATURE_BASELINE_DIR`/)
  assert.doesNotMatch(procedure, /diff -ruN/)
  assert.match(procedure, /instead of asking/)
})

test('test-driven-development prune still asks for the touched-file list outside an orchestration', () => {
  const procedure = section(tdd, '### Procedure')

  assert.match(procedure, /ask your human partner for the touched-file list/)
})

test('test-driven-development first-RED recording names the orchestration exception for a non-git project', () => {
  const recording = section(tdd, '## Before the First RED')

  assert.match(recording, /inside an orchestration[^.]*prune base that the orchestrator recorded/i)
})

test('test-driven-development completion gate leaves the prune box to the orchestrator in an orchestration', () => {
  const gate = tdd.slice(tdd.indexOf('The prune ran, and its audit'))

  assert.match(gate, /`fast-path-implementation`[^.]*orchestrator checks this box/)
  assert.match(gate, /implementer leaves it to the orchestrator/)
})

test('test-driven-development uncovered behaviour step points an orchestrated prune to a new single-task wave', () => {
  const procedure = section(tdd, '### Procedure')

  assert.match(procedure, /new single-task wave/)
  assert.match(procedure, /orchestrator does not write the test/)
})
