import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

const implementer = () => read('skills/subagent-driven-development/implementer-prompt.md')
const reviewer = () => read('skills/subagent-driven-development/reviewer-prompt.md')

test('implementer prompt names the BLOCKED_BY_SIBLING status', () => {
  assert.match(implementer(), /BLOCKED_BY_SIBLING/)
})

test('implementer prompt requires the blocked report to quote the error line that names a file', () => {
  assert.match(implementer(), /quote the error line that names a file/)
})

test('implementer prompt does not treat BLOCKED_BY_SIBLING as an escalation', () => {
  assert.match(implementer(), /BLOCKED_BY_SIBLING[^\n]*is not an escalation/)
})

test('implementer prompt no longer requires that all other tests still pass', () => {
  assert.doesNotMatch(implementer(), /all other tests still pass/i)
})

test('implementer prompt requires every test file in writes to pass before GREEN', () => {
  assert.match(implementer(), /every test file in `writes` passes/)
})

test('implementer prompt explains that the parent proves the whole suite at the wave gate', () => {
  assert.match(implementer(), /parent proves the whole suite at the wave gate/)
})

test('implementer prompt dispatches in the background', () => {
  assert.match(implementer(), /background: true/)
})

test('implementer prompt asks for an Environment failures field in the report', () => {
  assert.match(implementer(), /Environment failures/)
})

test('implementer prompt never counts a timeout as RED or GREEN evidence', () => {
  assert.match(implementer(), /timeout is never RED or GREEN evidence/)
})

test('implementer prompt forbids whole-project checks such as PHPStan and tsc', () => {
  assert.match(implementer(), /MUST NOT run whole-project checks[^\n]*PHPStan[^\n]*`tsc`/)
})

test('implementer prompt forbids the just pillar check and test recipes', () => {
  assert.match(implementer(), /`just <pillar> check\|test`/)
})

test('implementer prompt limits allowed checks to per-file commands on writes', () => {
  assert.match(implementer(), /`pint <paths>`[\s\S]*`biome check <paths>`[\s\S]*`gofmt -l <paths>`[\s\S]*`rustfmt --check <paths>`/)
})

test('implementer prompt limits edits to the paths in writes', () => {
  assert.match(implementer(), /edit, create and delete only paths in (?:its|your) `writes`/i)
})

test('implementer prompt stops with NEEDS_CONTEXT when another path is needed', () => {
  assert.match(implementer(), /needs? another path[^\n]*NEEDS_CONTEXT[^\n]*names? the path/i)
})

test('implementer prompt defers duplicate extraction outside writes to a later wave', () => {
  assert.match(implementer(), /duplicate to extract outside your `writes`[^\n]*`DONE_WITH_CONCERNS`[^\n]*later wave/)
})

test('implementer prompt keeps the no-git rule', () => {
  assert.match(implementer(), /MUST NOT commit, push, merge/)
})

test('reviewer prompt dispatches in the background', () => {
  assert.match(reviewer(), /background: true/)
})

test('reviewer prompt receives the diff against the wave base limited to writes', () => {
  assert.match(reviewer(), /git diff <wave-base> -- <writes>/)
})

test('reviewer prompt receives the full content of new untracked files in writes', () => {
  assert.match(reviewer(), /full content of new untracked files in `writes`/)
})

test('reviewer prompt receives the list of each sibling writes', () => {
  assert.match(reviewer(), /each sibling's `writes`/)
})

test('reviewer prompt judges only the paths of the task', () => {
  assert.match(reviewer(), /judge only the task's paths/i)
})

test('reviewer prompt forbids flagging sibling files', () => {
  assert.match(reviewer(), /Do not flag sibling files/)
})

test('reviewer prompt forbids relying on the content of sibling files', () => {
  assert.match(reviewer(), /do not rely on their content/)
})

test('reviewer prompt allows relying on stable foundation interfaces', () => {
  assert.match(reviewer(), /foundation interfaces are stable/i)
})

test('implementer prompt routes a harder than expected task to complex-worker on openai/hard', () => {
  assert.match(implementer(), /harder than expected[^\n]*`complex-worker` on `openai\/hard`/)
})

test('implementer prompt retries a timed out command once', () => {
  assert.match(implementer(), /Retry it once/)
})

test('implementer prompt asks a BLOCKED_BY_SIBLING report for partial RED and GREEN evidence', () => {
  assert.match(implementer(), /report partial RED and GREEN evidence/)
})

test('implementer prompt asks a BLOCKED_BY_SIBLING report to state that the file is outside writes', () => {
  assert.match(implementer(), /State that the file is outside the task's `writes`/)
})

test('implementer self-review asks whether every test file in writes passes', () => {
  assert.match(implementer(), /Does every test file in `writes` pass now\?/)
})

test('implementer self-review no longer asks whether all tests pass', () => {
  assert.doesNotMatch(implementer(), /Do all tests pass now/)
})

test('implementer template marks a slot for the writes list', () => {
  assert.match(implementer(), /\[WRITES: exact paths\]/)
})

test('implementer refactor exception limits green tests to the test files in writes', () => {
  assert.match(implementer(), /existing test files in `writes` must stay green/)
})

test('reviewer prompt is dispatched as each implementer returns DONE or DONE_WITH_CONCERNS', () => {
  assert.match(reviewer(), /as soon as that implementer returns `DONE` or `DONE_WITH_CONCERNS`/)
})

test('reviewer prompt receives a diff against the base copy for paths already dirty at the wave base', () => {
  assert.match(reviewer(), /diff against the base copy for paths that were already dirty/)
})

test('reviewer prompt receives the diff -ruN against the task baseline in a non-git project', () => {
  assert.match(reviewer(), /non-git project[^\n]*`diff -ruN` against the task baseline/)
})

test('implementer role selection sends a task of unsure difficulty to complex-worker on openai/hard', () => {
  assert.match(implementer(), /difficulty of a task is unsure[^\n]*`complex-worker` on `openai\/hard`/)
})

test('implementer allowed checks include one Go package or Rust crate that the task owns', () => {
  assert.match(implementer(), /one Go package or one Rust crate that the task owns/)
})

test('implementer allowed checks go no wider than the owned Go package or Rust crate', () => {
  assert.match(implementer(), /one Go package or one Rust crate that the task owns, and nothing wider/)
})

test('implementer prompt does not name a verification gate', () => {
  assert.doesNotMatch(implementer(), /verification gate/)
})

test('implementer prompt names the wave gate as the place that checks evidence', () => {
  assert.match(implementer(), /check this in the wave gate/)
})
