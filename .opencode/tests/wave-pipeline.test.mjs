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

test('development skill no longer describes a per-task pipeline', () => {
  assert.doesNotMatch(development(), /per-task pipeline/i, 'the pipeline is per wave')
})

test('development skill no longer runs tasks one at a time', () => {
  assert.doesNotMatch(development(), /one at a time/i, 'waves replace one-at-a-time execution')
})

test('development skill names the BLOCKED_BY_SIBLING status', () => {
  assert.match(development(), /BLOCKED_BY_SIBLING/, 'status handling covers sibling blocks')
})

test('development skill records the wave base from porcelain status and file hashes', () => {
  assert.match(development(), /git status --porcelain -uall/, 'wave base lists dirty and untracked paths')
  assert.match(development(), /hash-object/, 'wave base hashes already-dirty paths')
})

test('development skill offers the commit all tasks option at the wave checkpoint', () => {
  assert.match(development(), /"Commit all tasks"/, 'one question per wave')
})

test('development skill caps a wave at 4 implementers', () => {
  assert.match(development(), /at most 4 implementers/i, 'wave width is capped')
})

test('development skill requires each task to declare writes', () => {
  assert.match(development(), /declares? `writes`/i, 'writes drive disjointness checks')
})

test('development skill commits each task limited to its own paths', () => {
  assert.match(development(), /git commit -m "<subject>" -- <paths>/, 'commit is limited to task paths')
  assert.match(development(), /git add -A -- <paths>/, 'staging is limited to task paths')
})

test('development skill forbids bypassing commit hooks', () => {
  assert.match(development(), /never[^.\n]*--no-verify/i, 'hooks always run')
})

test('development skill sends an unsure task to complex-worker', () => {
  assert.match(development(), /unsure[^.\n]*`complex-worker`/i, 'unsure means complex-worker')
})

test('development skill has a wave formation section under task decomposition', () => {
  assert.match(development(), /^### Wave Formation$/m, 'Task 2 references this heading')
})

test('development skill has per-wave pipeline and wave gate sections', () => {
  assert.match(development(), /^## Per-Wave Pipeline$/m, 'pipeline heading')
  assert.match(development(), /^## Wave Gate$/m, 'gate heading')
})

test('development skill runs waves of one in projects without git', () => {
  assert.match(development(), /non-git[^.\n]*waves of one/i, 'no-git projects stay sequential')
})

test('wave gate lists touched paths including deletions', () => {
  const gate = section(development(), '## Wave Gate')
  assert.match(gate, /git diff --name-only/, 'gate states its own touched-list command')
  assert.doesNotMatch(gate, /--diff-filter=d/, 'deletions stay visible')
})

test('development skill dispatches a harder-than-expected task again to complex-worker as a new child', () => {
  assert.match(development(), /new child[^.\n]*same wave/i, 'sessionID cannot change role')
})

test('wave checkpoint offers the adjust first option', () => {
  assert.match(section(development(), '## User Checkpoint'), /"Adjust first"/, 'the user can ask for changes before committing')
})

test('wave checkpoint offers the skip commit option', () => {
  assert.match(section(development(), '## User Checkpoint'), /"Skip commit"/, 'the user can defer the commit')
})

test('touched list counts a base-dirty or base-untracked path only when its hash changed', () => {
  const gate = section(development(), '## Wave Gate')
  assert.match(
    gate,
    /already dirty or untracked at the wave base counts as touched only if its `git hash-object` differs/,
    'paths unchanged since the base are not attributed to tasks',
  )
})

test('blocked by sibling task is parked until gate step 1', () => {
  const pipeline = section(development(), '## Per-Wave Pipeline')
  assert.match(pipeline, /Park a task in `BLOCKED_BY_SIBLING`/, 'the gate cannot wait on a parked task')
  assert.match(pipeline, /BLOCKED_BY_SIBLING[^\n]*gate step 1/i, 'gate step 1 resolves the parked task')
})

test('blocked by sibling re-run is reviewed before the gate continues', () => {
  const gate = section(development(), '## Wave Gate')
  assert.match(gate, /re-run child goes through the review step before the gate continues at step 2/, 'the re-run child is reviewed')
  assert.match(gate, /second `BLOCKED_BY_SIBLING` becomes an ordinary `BLOCKED`/, 'no endless sibling loop')
})

test('failures owned by a stopped task do not block the commits of passing tasks', () => {
  assert.match(
    development(),
    /stopped task is reported[^\n]*not fixed[^\n]*\n?[^\n]*does not block the commits of the passing tasks/,
    'passing tasks still commit',
  )
  assert.match(section(development(), '## User Checkpoint'), /checks stay red until the stopped task is resolved/, 'the checkpoint states the red checks')
})

test('every status-aware prompt names BLOCKED_BY_SIBLING', () => {
  for (const path of [
    'skills/subagent-driven-development/SKILL.md',
    'skills/subagent-driven-development/implementer-prompt.md',
    'skills/fast-path-implementation/SKILL.md',
  ]) {
    assert.match(read(path), /BLOCKED_BY_SIBLING/, path)
  }
})

test('gate step 6 excludes a task the user stopped and points to step 9', () => {
  const step = section(development(), '## Wave Gate').split('\n').find((line) => line.startsWith('6. ')) ?? ''
  assert.match(step, /stopped task[^\n]*step 9/, 'a stopped task is never continued')
})

test('checkpoint also runs when the gate reports only failures owned by a stopped task', () => {
  const checkpoint = section(development(), '## User Checkpoint')
  assert.match(checkpoint, /only failures owned by a stopped task/, 'the checkpoint is reachable with red checks')
})

test('gate step 1 also runs when every remaining task is parked', () => {
  const gate = section(development(), '## Wave Gate')
  assert.match(gate, /once every task that is not parked has a reviewer `\[PASS\]` or is a stopped task/, 'two parked tasks cannot deadlock the gate')
  assert.match(gate, /also runs when every remaining task is parked/, 'mutual blocks reach the gate')
})

test('checkpoint asks the commit question under auto-commit when a stopped task leaves the checks red', () => {
  const checkpoint = section(development(), '## User Checkpoint')
  assert.match(checkpoint, /\*\*MUST\*\* ask the commit question even under auto-commit/, 'red checks never commit silently')
})

test('a failure traced to the files of a stopped task goes to gate step 9', () => {
  assert.match(section(development(), '## Wave Gate'), /traced to a stopped task's files to step 9/, 'step 7 does not claim it')
})

test('commit preference states that auto-commit still asks when a stopped task leaves the checks red', () => {
  const preference = section(development(), '## Commit Preference')
  assert.match(preference, /not asked whether to commit, unless a stopped task leaves the checks red/, 'the option text carries the exception')
  assert.match(preference, /skips the commit question unless a stopped task leaves the checks red/, 'the closing paragraph carries the exception')
})
