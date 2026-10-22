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
  assert.match(repeat, /the orchestrator runs the PRUNE once for the whole feature, before the final review/)
})

test('test-driven-development skill tells an implementer subagent not to run the prune', () => {
  const repeat = section(tdd, '## Repeat')

  assert.match(repeat, /An implementer subagent does not run it\./)
})

test('test-driven-development skill keeps the Phase 7 prune sentence', () => {
  const repeat = section(tdd, '## Repeat')

  assert.match(repeat, /Inside `debugging` Phase 7/)
})

test('test-driven-development prune uses the feature baseline diff instead of asking in a no-git orchestration', () => {
  const procedure = section(tdd, '### Procedure')

  assert.match(procedure, /diff -ruN "\$FEATURE_BASELINE_DIR" "\$WORKING_DIR"/)
  assert.match(procedure, /instead of asking/)
})

test('test-driven-development prune still asks for the touched-file list outside an orchestration', () => {
  const procedure = section(tdd, '### Procedure')

  assert.match(procedure, /ask your human partner for the touched-file list/)
})
