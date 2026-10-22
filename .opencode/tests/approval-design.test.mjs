import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function stepBody(skill, title) {
  const pattern = new RegExp(`\\*\\*${title}\\.\\*\\*([\\s\\S]*?)(?=\\n\\d+\\. \\*\\*|\\n## |$)`)
  return skill.match(pattern)?.[1] ?? ''
}

const standardPath = 'skills/brainstorming-standard/SKILL.md'
const modeSkills = [
  standardPath,
  'skills/brainstorming-skip/SKILL.md',
  'skills/brainstorming-committee/SKILL.md',
]

test('standard mode asks the approach choice as a separate question before the sections', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /approach choice[^.]*separate, earlier question/i)
  assert.ok(step.search(/approach choice/i) < step.search(/every section/i))
})

test('standard mode presents every section in one message', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /every section \([^)]*testing\) in one message/)
})

test('standard mode approves sections with one multiSelect question', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /one `question` with `multiSelect: true`/)
  assert.match(step, /one option per section/)
  assert.match(step, /selected section is approved/i)
})

test('standard mode tells the user to write changes in the custom answer', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /tells the user to write what to change/)
})

test('standard mode reworks each unselected section from the custom answer', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /Rework each unselected section using that custom answer/)
})

test('standard mode asks one plain follow-up when the user left no custom answer', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /left no custom answer, ask one plain follow-up/)
})

test('standard mode asks again only about the reworked sections', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /ask again only about the reworked sections/i)
})

test('standard mode has the planner draft all sections in one call when delegating', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /`stack-planner` drafts all sections in one call/)
  assert.match(step, /present each one verbatim/)
})

for (const path of modeSkills) {
  test(`${path} hands off without a next-step question in a ticket run`, () => {
    const step = stepBody(read(path), 'Decide the next step')

    assert.match(step, /`Source: work-on-ticket`/)
    assert.match(step, /invoke `subagent-driven-development` without asking/)
  })

  test(`${path} saves the plan before the ticket-run handoff`, () => {
    const step = stepBody(read(path), 'Decide the next step')

    assert.ok(step.indexOf('`write`') >= 0)
    assert.ok(step.indexOf('`write`') < step.indexOf('without asking'))
  })

  test(`${path} keeps the create tickets or implement question without a ticket`, () => {
    const step = stepBody(read(path), 'Decide the next step')

    assert.match(step, /does not have `Source: work-on-ticket`, use `question` to ask whether/)
  })

  test(`${path} hands off to create-tickets when a ticket run asks for more tickets`, () => {
    const step = stepBody(read(path), 'Decide the next step')

    assert.match(step, /asks for more tickets at final approval[^.]*`create-tickets` instead/)
  })
}

test('committee restates the brief in one line in a ticket run', () => {
  const step = stepBody(read('skills/brainstorming-committee/SKILL.md'), 'Confirm the brief')

  assert.match(step, /`Source: work-on-ticket`[^.]*confirmed scope/)
  assert.match(step, /restate the brief in one line and do not ask again/)
})

test('committee confirms the brief with a question when there is no ticket run', () => {
  const step = stepBody(read('skills/brainstorming-committee/SKILL.md'), 'Confirm the brief')

  assert.match(step, /Otherwise, restate what you understand[\s\S]*confirm via `question`/)
})

test('standard worked example shows the multiSelect section step instead of per-section approval', () => {
  const example = read(standardPath).match(/## Worked Example([\s\S]*?)(?=\n## )/)?.[1] ?? ''

  assert.doesNotMatch(example, /approval on each section/)
  assert.match(example, /\*\*Sections\.\*\*[^\n]*one `multiSelect` question/)
  assert.match(example, /asks again about data flow only/)
})

test('skip completion gate requires the next-step question only without a ticket run', () => {
  const gate = read('skills/brainstorming-skip/SKILL.md').match(/## Completion Gate([\s\S]*?)(?=\n## )/)?.[1] ?? ''
  const bullet = gate.split('\n').find((line) => /implementation next step/.test(line)) ?? ''

  assert.match(bullet, /Source: work-on-ticket/)
  assert.match(bullet, /^- Without a `Source: work-on-ticket` line/)
})

test('skip hand-off follows step 5 instead of an unconditional user choice', () => {
  const step = stepBody(read('skills/brainstorming-skip/SKILL.md'), 'Hand off via `skill`')

  assert.match(step, /step 5/)
  assert.doesNotMatch(step, /per the user's choice/)
  assert.doesNotMatch(step, /If the user picks implementation/)
})

test('no mode skill saves the plan with wording that presupposes a question', () => {
  for (const path of modeSkills) {
    assert.doesNotMatch(read(path), /Before you ask, save/, path)
  }
})

test('mode skills do not join the downstream skill clauses with a semicolon', () => {
  for (const path of modeSkills) {
    assert.doesNotMatch(read(path), /`subagent-driven-development`; invoke whichever/, path)
  }
})

test('standard worked example splits the no-ticket next step into two sentences', () => {
  const line = read(standardPath).match(/\*\*Next step \(no `Source: work-on-ticket`\)\.\*\*[^\n]*/)?.[0] ?? ''

  assert.ok(line.length > 0)
  assert.doesNotMatch(line, /;/)
})

test('standard mode returns the chosen approach to the same planner before it drafts sections', () => {
  const step = stepBody(read(standardPath), 'Present approaches and approve sections')

  assert.match(step, /return the chosen approach to the same `stack-planner` with its `sessionID`\. It then drafts the sections/i)
})
