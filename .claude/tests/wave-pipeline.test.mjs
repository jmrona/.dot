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
const decomposition = () => section(development(), '## Task Decomposition')

test('development skill names the per-wave pipeline', () => {
  assert.match(development(), /per-wave pipeline/i, 'the pipeline is per wave')
})

test('development skill no longer describes a per-task pipeline', () => {
  assert.doesNotMatch(development(), /per-task pipeline/i, 'the pipeline is per wave')
})

test('development skill no longer runs tasks one at a time', () => {
  assert.doesNotMatch(development(), /one at a time/i, 'waves replace one-at-a-time execution')
})

test('development skill names the BLOCKED_BY_SIBLING status', () => {
  assert.match(development(), /BLOCKED_BY_SIBLING/, 'status handling covers sibling blocks')
})

test('development skill records the wave base from porcelain status', () => {
  assert.match(development(), /git status --porcelain -uall/, 'wave base lists dirty and untracked paths')
})

test('development skill records the wave base file hashes', () => {
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

test('development skill stages each task limited to its own paths', () => {
  assert.match(development(), /git add -A -- <paths>/, 'staging is limited to task paths')
})

test('development skill commits each task limited to its own paths', () => {
  assert.match(development(), /git commit -m "<subject>" -- <paths>/, 'commit is limited to task paths')
})

test('development skill forbids bypassing commit hooks', () => {
  assert.match(development(), /never[^.\n]*--no-verify/i, 'hooks always run')
})

test('task decomposition sends an unsure task to the standard escalation tier', () => {
  assert.match(decomposition(), /unsure[^.\n]*Standard escalation/i, 'unsure means the Standard escalation tier')
})

test('task decomposition gives bounded work the low-cost default tier', () => {
  const prose = decomposition().split('\n### ')[0]
  assert.match(prose, /Bounded work goes to the Low-cost default tier/, 'bounded work stays cheap')
})

test('task decomposition asks each task for its writes', () => {
  assert.match(decomposition(), /`writes`/, 'each task declares writes')
})

test('task decomposition asks each task for what it produces', () => {
  assert.match(decomposition(), /`produces`/, 'each task declares produces')
})

test('task decomposition asks each task for what it consumes', () => {
  assert.match(decomposition(), /`consumes`/, 'each task declares consumes')
})

test('task decomposition assigns a wave number to each task', () => {
  assert.match(decomposition(), /wave number/i, 'each task has a wave number')
})

test('task decomposition assigns a model tier to each task', () => {
  assert.match(decomposition(), /model tier/i, 'each task has a model tier')
})

test('task decomposition assigns a subagent type to each task', () => {
  assert.match(decomposition(), /subagent type/i, 'each task has a subagent type')
})

test('task decomposition puts tasks in separate waves when unsure', () => {
  assert.match(decomposition(), /unsure[^.\n]*separate waves/i, 'unsure tasks go in separate waves')
})

test('development skill does not mention a stack planner', () => {
  assert.doesNotMatch(development(), /stack-planner/i, 'Claude has no planner agent')
})

test('development skill has a wave formation section under task decomposition', () => {
  assert.match(decomposition(), /^### Wave Formation$/m, 'wave formation heading')
})

test('development skill has a per-wave pipeline section', () => {
  assert.match(development(), /^## Per-Wave Pipeline$/m, 'pipeline heading')
})

test('development skill has a wave gate section', () => {
  assert.match(development(), /^## Wave Gate$/m, 'gate heading')
})

test('development skill runs waves of one in projects without git', () => {
  assert.match(development(), /non-git[^.\n]*waves of one/i, 'no-git projects stay sequential')
})

test('development skill keeps the no-git-flow instruction', () => {
  assert.match(development(), /\.\.\/_shared\/no-git-flow\.md/, 'non-git projects follow no-git-flow')
})

test('wave gate lists touched paths including deletions', () => {
  const gate = section(development(), '## Wave Gate')
  assert.match(gate, /git diff --name-only/, 'gate states its own touched-list command')
  assert.doesNotMatch(gate, /--diff-filter=d/, 'deletions stay visible')
})

test('development skill dispatches a harder-than-expected task again one tier up in the same wave', () => {
  assert.match(development(), /new `Agent` dispatch one tier up[^.\n]*same wave/i, 'SendMessage cannot change the model')
})

test('development skill continues an agent through SendMessage', () => {
  assert.match(development(), /through `SendMessage`/, 'continuation uses SendMessage')
  assert.doesNotMatch(development(), /sessionID/, 'sessionID is an opencode term')
})

test('development skill dispatches the wave in the background', () => {
  assert.match(development(), /every implementer of the wave in one message[^.\n]*background/i, 'wave runs in parallel')
})

test('development skill asks the checkpoint with AskUserQuestion', () => {
  assert.match(section(development(), '## User Checkpoint'), /`AskUserQuestion`/, 'the checkpoint uses AskUserQuestion')
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

const gateStepSix = () => section(development(), '## Wave Gate').split('\n').find((line) => line.startsWith('6. ')) ?? ''

test('gate step 6 excludes a task the user stopped', () => {
  assert.match(gateStepSix(), /Skip a stopped task/, 'a stopped task is never continued')
})

test('gate step 6 points a stopped task to step 9', () => {
  assert.match(gateStepSix(), /stopped task[^\n]*step 9/, 'step 9 reports the stopped task')
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

test('every status-aware prompt names BLOCKED_BY_SIBLING', () => {
  for (const path of [
    'skills/subagent-driven-development/SKILL.md',
    'skills/subagent-driven-development/implementer-prompt.md',
    'skills/fast-path-implementation/SKILL.md',
  ]) {
    assert.match(read(path), /BLOCKED_BY_SIBLING/, path)
  }
})
