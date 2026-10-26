import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const skill = () => readFileSync(new URL('../skills/todo-lists/SKILL.md', import.meta.url), 'utf8')

test('todo-lists skill does not mention priority', () => {
  assert.doesNotMatch(skill(), /priority/i)
})

test('todo-lists skill does not mention todoread', () => {
  assert.doesNotMatch(skill(), /todoread/i)
})

test('todo-lists skill does not mention the session todo endpoint', () => {
  assert.doesNotMatch(skill(), /\/session\/:id\/todo/)
})

test('todo-lists skill says the list is rebuilt from the last completed todowrite call', () => {
  assert.match(skill(), /last completed `todowrite` call/i)
})

test('todo-lists skill describes wave parents', () => {
  assert.match(skill(), /W1\. Wave 1/)
})

test('todo-lists skill allows several in_progress children within the active wave', () => {
  assert.match(skill(), /several `in_progress` children within the active wave/i)
})

test('todo-lists skill names the gate child', () => {
  assert.match(skill(), /Gate, checkpoint and commits/)
})

test('todo-lists skill contains no em-dash or en-dash', () => {
  assert.doesNotMatch(skill(), /[–—]/)
})
