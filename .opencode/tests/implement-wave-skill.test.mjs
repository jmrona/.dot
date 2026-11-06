import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

const skill = () => read('skills/subagent-driven-development/SKILL.md')
const implementer = () => read('skills/subagent-driven-development/implementer-prompt.md')
const reviewer = () => read('skills/subagent-driven-development/reviewer-prompt.md')

test('skill tells the orchestrator to call implement_wave once per wave', () => {
  assert.match(skill(), /MUST[^.]*call the `implement_wave` tool for each wave/i)
})

test('skill names the implement_wave section before the per-wave pipeline', () => {
  const body = skill()
  const section = body.indexOf('## Running a Wave with implement_wave')
  assert.ok(section >= 0, 'section exists')
  assert.ok(section < body.indexOf('## Per-Wave Pipeline'), 'section comes first')
})

test('skill keeps the per-wave pipeline as the fallback when implement_wave is unavailable', () => {
  assert.match(skill(), /not available[^.]*Per-Wave Pipeline/i)
})

test('skill does not ask for background true', () => {
  assert.doesNotMatch(skill(), /background: true/)
})

test('implementer prompt does not ask for background true', () => {
  assert.doesNotMatch(implementer(), /background: true/)
})

test('reviewer prompt does not ask for background true', () => {
  assert.doesNotMatch(reviewer(), /background: true/)
})

test('skill lets implement_wave read the prompt templates instead of passing them as arguments', () => {
  const body = skill()
  const section = body.slice(body.indexOf('## Running a Wave with implement_wave'), body.indexOf('## Per-Wave Pipeline'))
  assert.doesNotMatch(section, /`prompts`:/)
  assert.match(section, /`implement_wave` reads `\.\/implementer-prompt\.md` and `\.\/reviewer-prompt\.md` itself/)
})
