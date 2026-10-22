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

const development = () => read('skills/subagent-driven-development/SKILL.md')
const fastPath = () => read('skills/fast-path-implementation/SKILL.md')
const implementerPrompt = () => read('skills/subagent-driven-development/implementer-prompt.md')
const commitPreference = () => section(development(), '## Commit Preference')
const featurePrune = () => section(development(), '## Feature Test Prune')

test('commit preference compares the git dir with the git common dir', () => {
  assert.match(commitPreference(), /git rev-parse --git-dir/, 'reads the git dir')
  assert.match(commitPreference(), /git rev-parse --git-common-dir/, 'reads the common dir')
})

test('commit preference resolves both git dirs to absolute paths before comparing', () => {
  assert.match(commitPreference(), /absolute paths/, 'relative output is resolved first')
})

test('commit preference chooses auto-commit without asking in a linked worktree', () => {
  assert.match(
    commitPreference(),
    /linked worktree[^.]*\. Choose "Auto-commit after each wave" without asking/i,
    'a linked worktree skips the commit question',
  )
})

test('commit preference announces the automatic choice in one line', () => {
  assert.match(commitPreference(), /Linked worktree: auto-commit after each wave\./, 'the announcement is quoted')
})

test('commit preference still asks the commit question in the main worktree', () => {
  assert.match(commitPreference(), /main worktree[^.]*\. Ask the user how commits should be handled/i)
})

test('commit preference asks as in the main worktree when a worktree command fails', () => {
  assert.match(commitPreference(), /fails or (its|gives) unexpected output[^.]*ask[^.]*main worktree/i)
})

test('process overview no longer says the commit preference is always asked', () => {
  const overview = section(development(), '## Process Overview')
  assert.doesNotMatch(overview, /1\. Ask the commit preference/, 'linked worktrees settle it without asking')
  assert.match(overview, /1\. Settle the commit preference/)
})

test('development skill records the prune base at session start as test-driven-development defines it', () => {
  assert.match(commitPreference(), /prune base/, 'the base is recorded alongside the commit preference')
  assert.match(commitPreference(), /"Before the First RED"/, 'the base follows the TDD definition')
})

test('development skill uses the feature baseline as the prune base in the no-git flow', () => {
  assert.match(commitPreference(), /FEATURE_BASELINE_DIR/)
  assert.match(commitPreference(), /diff -ruN "\$FEATURE_BASELINE_DIR" "\$WORKING_DIR"/)
})

test('feature test prune section sits before the final feature-level review', () => {
  const text = development()
  const pruneIndex = text.indexOf('## Feature Test Prune')
  const checkpointIndex = text.indexOf('## User Checkpoint')
  const finalIndex = text.indexOf('## Final Feature-Level Review')
  assert.ok(pruneIndex > checkpointIndex, 'the prune follows the wave checkpoint')
  assert.ok(pruneIndex < finalIndex, 'the prune precedes the final review')
})

test('feature test prune runs the test-driven-development prune once over every touched file of the feature', () => {
  assert.match(featurePrune(), /PRUNE/, 'the TDD stage is named')
  assert.match(featurePrune(), /once/, 'one prune per feature')
  assert.match(featurePrune(), /every touched file of the feature/)
})

test('feature test prune re-runs the full test command and linter after approved removals', () => {
  assert.match(featurePrune(), /re-run the project's full test command and linter/)
})

test('feature test prune commits the removals as one extra commit under the commit preference', () => {
  assert.match(featurePrune(), /one extra commit/)
  assert.match(featurePrune(), /auto-commit[^.]*without asking/i)
  assert.match(featurePrune(), /"Ask me each time"[^.]*one commit question/)
})

test('feature test prune restores the removed tests when the re-run fails', () => {
  assert.match(featurePrune(), /restore the removed tests from the restore record/)
  assert.match(featurePrune(), /continue to the final review without the removals/)
})

test('feature test prune asks nothing when the audit has no removal', () => {
  assert.match(featurePrune(), /no REMOVE, nothing changes and nothing is asked/)
})

test('feature test prune is skipped and reported when no test file was touched', () => {
  assert.match(featurePrune(), /no touched test file[^.]*skip the prune[^.]*completion report/i)
})

test('final review captures the feature range only after the prune is resolved', () => {
  const finalReview = section(development(), '## Final Feature-Level Review')
  assert.match(finalReview, /1\. \*\*Identify the feature range\.\*\*[^\n]*after the feature test prune is resolved/)
})

test('fast path relies on a settled commit preference', () => {
  assert.match(fastPath(), /responsible for having settled the commit preference before arriving here/)
  assert.doesNotMatch(fastPath(), /having asked the commit preference question/)
})

test('fast path worked example shows the automatic choice in a linked worktree', () => {
  const example = section(fastPath(), '## Worked Example')
  assert.match(example, /Linked worktree: auto-commit after each wave\./)
})

test('fast path runs the feature test prune of the development skill', () => {
  assert.match(fastPath(), /`## Feature Test Prune` section of `\.\.\/subagent-driven-development\/SKILL\.md`/)
})

test('fast path runs the feature test prune after its user checkpoint', () => {
  const text = fastPath()
  const checkpointIndex = text.indexOf('### 4. User Checkpoint')
  const pruneIndex = text.indexOf('### 5. Feature Test Prune')
  assert.ok(pruneIndex > checkpointIndex, 'the prune follows the checkpoint')
})

test('implementer prompt says the implementer does not run the test prune', () => {
  assert.match(implementerPrompt(), /You do not run the test prune/)
  assert.match(implementerPrompt(), /orchestrator runs it once per feature/)
})
