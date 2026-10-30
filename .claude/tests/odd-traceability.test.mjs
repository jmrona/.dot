import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pasteInstruction =
  'Paste the original user request verbatim above the design summary, split into numbered requirements (`S1`, `S2`, ...).'
const pasteOnceInstruction =
  'If the summary already starts with the numbered request, paste that block once.'
const requestPlaceholder = '[PASTE THE NUMBERED REQUIREMENTS S1..Sn HERE]'
const designPlaceholder = '[PASTE THE FULL DESIGN SUMMARY HERE'
const traceabilityRow =
  '| Traceability | Every design element cites an S# or is marked derived with its reason; every S# is covered by the design. An element that is neither cited nor marked derived, or an S# the design does not cover, is an issue. |'
const skillTraceabilityText =
  'Every design element cites an S# or is marked derived with its reason; every S# is covered'

function readSkillFile(name) {
  return readFileSync(new URL(`../skills/design-review/${name}`, import.meta.url), 'utf8')
}

function dispatchStep() {
  const match = readSkillFile('SKILL.md').match(/^2\. \*\*Dispatch the reviewer\.\*\*.*$/m)
  assert.ok(match, 'SKILL.md has no dispatch step')
  return match[0]
}

function whatToCheckRows() {
  const section = readSkillFile('design-reviewer-prompt.md').split('## What to Check')[1]
  return section
    .split('## Calibration')[0]
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
}

test('dispatch step tells the orchestrator to paste the numbered request above the design summary', () => {
  assert.ok(dispatchStep().includes(pasteInstruction))
})

test('dispatch step pastes an already numbered request once', () => {
  assert.ok(dispatchStep().includes(`${pasteInstruction} ${pasteOnceInstruction}`))
})

test('reviewer prompt places the numbered requirements before the design to review', () => {
  const prompt = readSkillFile('design-reviewer-prompt.md')
  assert.ok(prompt.includes(requestPlaceholder))
  assert.ok(prompt.indexOf(requestPlaceholder) < prompt.indexOf(designPlaceholder))
})

test('reviewer prompt labels the numbered requirements as the original request', () => {
  const prompt = readSkillFile('design-reviewer-prompt.md')
  assert.ok(
    prompt.indexOf('**Original request (verbatim):**') < prompt.indexOf('**Design to review:**'),
  )
})

test('reviewer prompt ends the What to Check table with the Traceability row', () => {
  const rows = whatToCheckRows()
  assert.equal(rows[rows.length - 1].trim(), traceabilityRow)
})

test('skill table lists the Traceability check', () => {
  const row = readSkillFile('SKILL.md')
    .split('\n')
    .find((line) => line.startsWith('| Traceability'))
  assert.ok(row, 'SKILL.md has no Traceability row')
  assert.ok(row.includes(skillTraceabilityText))
})

test('dispatch step starts the reviewer at the Standard escalation tier', () => {
  const step = dispatchStep()
  assert.ok(step.includes('Start at the Standard escalation tier'))
  assert.ok(!step.includes('Start at the Low-cost default tier'))
})

test('shared dispatch escalation triggers records the design-review Standard tier exception', () => {
  const triggers = readFileSync(
    new URL('../skills/_shared/subagent-dispatch.md', import.meta.url),
    'utf8',
  )
    .split('### Escalation Triggers')[1]
    .split('\n### ')[0]
  assert.ok(
    triggers.includes(
      'Within `design-review`, the reviewer starts at the Standard escalation tier, as a second scoped exception, because the Low-cost default tier blocked clean designs.',
    ),
  )
})

test('reviewer prompt starts the reviewer at the Standard escalation tier', () => {
  const prompt = readSkillFile('design-reviewer-prompt.md')
  assert.ok(prompt.includes('Start at the Standard escalation tier'))
  assert.ok(!prompt.includes('Start at the Low-cost default tier'))
})
