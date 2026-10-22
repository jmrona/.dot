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

test('commit preference compares the git dir with the git common dir in one command', () => {
  assert.match(
    commitPreference(),
    /git rev-parse --path-format=absolute --git-dir --git-common-dir/,
    'one command reads both dirs',
  )
  assert.match(commitPreference(), /git 2\.31 or later/, 'the minimum git version is named')
})

test('commit preference gets both git dirs as absolute paths without resolving them', () => {
  assert.match(commitPreference(), /prints both absolute paths/, 'the command output is already absolute')
  assert.doesNotMatch(commitPreference(), /Resolve both outputs/, 'no manual resolution step remains')
  assert.doesNotMatch(commitPreference(), /`git rev-parse --git-dir`/, 'the two-command form is gone')
})

test('commit preference chooses auto-commit without asking in a linked worktree', () => {
  assert.match(
    commitPreference(),
    /paths differ[^.]*linked worktree\. Choose "Auto-commit after each wave" without asking/i,
    'a linked worktree skips the commit question',
  )
})

test('commit preference announces the automatic choice in one line', () => {
  assert.match(commitPreference(), /Linked worktree: auto-commit after each wave\./, 'the announcement is quoted')
})

test('commit preference still asks the commit question in the main worktree', () => {
  assert.match(commitPreference(), /paths are equal[^.]*main worktree\. Ask the user how commits should be handled/i)
})

test('commit preference asks as in the main worktree when a worktree command fails', () => {
  assert.match(commitPreference(), /command fails[^.]*ask[^.]*main worktree/i)
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
  assert.match(commitPreference(), /diff -rqN "\$FEATURE_BASELINE_DIR" "\$WORKING_DIR"/)
  assert.match(commitPreference(), /every path named in the lines that `diff -rqN/)
  assert.match(commitPreference(), /`\$WORKING_DIR` path of each line\. Leave out files that exist only in `\$FEATURE_BASELINE_DIR`/)
  assert.doesNotMatch(commitPreference(), /diff -ruN/, 'the touched list needs names, not content')
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
  assert.match(featurePrune(), /no REMOVE[^.]*nothing is asked/)
})

test('feature test prune is skipped and reported when no test file was touched', () => {
  assert.match(featurePrune(), /no touched test file[^.]*skip the prune[^.]*completion report/i)
  assert.match(featurePrune(), /`diff -rqN` reports no test file/)
  assert.doesNotMatch(featurePrune(), /diff -ruN/)
})

test('final review captures the feature range only after the prune is resolved', () => {
  const finalReview = section(development(), '## Final Feature-Level Review')
  assert.match(finalReview, /1\. \*\*Identify the feature range\.\*\*[^\n]*after the feature test prune is resolved/)
})

test('final review range includes prune removals left uncommitted because the user declined the extra commit', () => {
  const finalReview = section(development(), '## Final Feature-Level Review')
  assert.match(finalReview, /1\. \*\*Identify the feature range\.\*\*[^\n]*prune removals[^\n]*uncommitted[^\n]*declined/)
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

test('fast path explains why no review follows the prune', () => {
  const prune = section(fastPath(), '### 5. Feature Test Prune')
  assert.match(prune, /no review follows the prune/i)
  assert.match(prune, /auditor on `openai\/hard`/)
  assert.match(prune, /user's approval/)
  assert.match(prune, /re-run of the tests and the linter/)
})

test('implementer prompt says the implementer does not run the test prune', () => {
  assert.match(implementerPrompt(), /You do not run the test prune/)
  assert.match(implementerPrompt(), /orchestrator runs it once per feature/)
})

test('feature test prune runs an uncovered behaviour as a new single-task wave through an implementer', () => {
  const prune = featurePrune()
  assert.match(prune, /uncovered behaviour/i)
  assert.match(prune, /new single-task wave/)
  assert.match(prune, /implementer/)
  assert.match(prune, /does not write the test itself/)
})

test('feature test prune audits again with the scope limited to the tests the new wave added', () => {
  assert.match(featurePrune(), /\[SCOPE\][^.]*added/)
})

test('user checkpoint refers to the session commit preference instead of a user choice', () => {
  const checkpoint = section(development(), '## User Checkpoint')
  assert.match(checkpoint, /session's commit preference is "Ask me each time"/)
  assert.match(checkpoint, /session's commit preference is auto-commit/)
  assert.doesNotMatch(checkpoint, /If the user chose/)
})
