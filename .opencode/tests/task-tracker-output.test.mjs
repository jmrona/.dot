import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const skill = readFileSync(
  new URL('../skills/subagent-driven-development/SKILL.md', import.meta.url),
  'utf8',
)

function section(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const level = heading.match(/^#+/)[0].length
  const rest = text.slice(start + heading.length)
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'))
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next)
}

const trackerSection = () => section(skill, '### Task Tracker Output')

test('task tracker output points to the todo-lists skill for the wave layout', () => {
  assert.match(trackerSection(), /`todo-lists` skill/)
})

test('task tracker output uses wave parents', () => {
  assert.match(trackerSection(), /W1\. Wave 1/)
})

test('task tracker output names the gate child', () => {
  assert.match(trackerSection(), /Gate, checkpoint and commits/)
})

test('task tracker output sends the task details to the plan file', () => {
  assert.match(trackerSection(), /plan file/)
})

test('task tracker output keeps content to one short line', () => {
  assert.match(trackerSection(), /one short line/)
})
