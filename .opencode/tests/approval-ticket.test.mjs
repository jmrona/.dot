import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function section(skill, startMarker, endMarker) {
  const start = skill.indexOf(startMarker)
  const end = skill.indexOf(endMarker, start + startMarker.length)
  return start === -1 || end === -1 ? '' : skill.slice(start, end)
}

const workOnTicketPath = 'skills/work-on-ticket/SKILL.md'
const routerPath = 'skills/brainstorming/SKILL.md'

function scopeStep() {
  return section(read(workOnTicketPath), '7. **Get explicit user confirmation and the mode.**', '8. **Hand off')
}

function handoffStep() {
  return section(read(workOnTicketPath), '8. **Hand off', '## Per-System Fetch')
}

function routerProcedure() {
  return section(read(routerPath), '## Procedure', '## The Mode Question')
}

test('ticket scope question offers one scope-confirmed option per mode', () => {
  const step = scopeStep()

  assert.match(step, /label: "Scope OK, standard/)
  assert.match(step, /label: "Scope OK, committee/)
  assert.match(step, /label: "Scope OK, skip/)
})

test('ticket scope question offers an adjust scope option', () => {
  assert.match(scopeStep(), /label: "Adjust scope"/)
})

test('ticket scope question no longer offers a separate need more context option', () => {
  assert.doesNotMatch(scopeStep(), /label: "Need more context"/)
  assert.doesNotMatch(scopeStep(), /label: "Looks good, proceed"/)
})

test('adjust scope collects what context is missing and asks the question again', () => {
  const step = scopeStep()

  assert.match(step, /what is missing/)
  assert.match(step, /ask again/i)
})

test('ticket scope question puts the recommended mode first with the router suffix rules', () => {
  const step = scopeStep()

  assert.match(step, /recommended mode first/i)
  assert.ok(step.includes(' (Recommended)'))
  assert.ok(step.includes(' (Recomendado)'))
  assert.ok(step.includes('Recommended because'))
  assert.ok(step.includes('step 2 of `skills/brainstorming/SKILL.md`'))
})

test('ticket handoff design input starts with the four contract lines', () => {
  const step = handoffStep()

  assert.ok(step.includes('Source: work-on-ticket'))
  assert.ok(step.includes('Ticket: <TICKET-KEY>'))
  assert.ok(step.includes('Scope: confirmed by the user'))
  assert.ok(step.includes('Mode: <standard | committee | skip>, chosen by the user'))
  assert.ok(step.indexOf('Source: work-on-ticket') < step.indexOf('Ticket: <TICKET-KEY>'))
  assert.ok(step.indexOf('Scope: confirmed by the user') < step.indexOf('Mode: <standard'))
})

test('ticket handoff keeps the four existing design input parts after the contract lines', () => {
  const step = handoffStep()

  assert.ok(step.indexOf('Mode: <standard') < step.indexOf('The design context recovered from the epic'))
  assert.ok(step.includes('Codebase observations from step 5'))
})

test('ticket handoff says the mode skill implements directly after final approval', () => {
  const step = handoffStep()

  assert.match(step, /implements directly after final approval, without a next-step question/)
  assert.doesNotMatch(step, /mark implementation as the recommended option/)
})

test('ticket handoff still forbids invoking subagent-driven-development directly', () => {
  assert.ok(handoffStep().includes('**MUST NOT** invoke `subagent-driven-development` directly'))
})

test('router hands off without asking when a ticket input carries a user-chosen mode', () => {
  const procedure = routerProcedure()

  assert.match(procedure, /`Source: work-on-ticket`/)
  assert.match(procedure, /`Mode:` line/)
  assert.match(procedure, /hand off to that mode without asking/)
})

test('router still enters plan mode before the ticket mode exception applies', () => {
  const procedure = routerProcedure()

  assert.ok(procedure.indexOf('Enter plan mode') < procedure.indexOf('without asking'))
  assert.match(procedure, /plan mode is still mandatory/i)
})

test('router asks the mode question when a ticket input has no Mode line', () => {
  assert.match(routerProcedure(), /no `Mode:` line[^.]*ask/i)
})

test('router common mistakes row for picking a mode names the ticket exception', () => {
  const row = read(routerPath)
    .split('\n')
    .find((line) => line.startsWith('| Picking a mode for the user'))

  assert.ok(row, 'row exists')
  assert.match(row, /work-on-ticket/)
  assert.match(row, /Mode:/)
})
