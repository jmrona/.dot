import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
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

test('testing rule places Meaningful Assertions between What Makes a Good Test and Test-Driven Development', () => {
  const testing = read('rules/common/testing.md')
  const meaningfulIndex = testing.indexOf('## Meaningful Assertions')
  const goodTestIndex = testing.indexOf('## What Makes a Good Test')
  const tddIndex = testing.indexOf('## Test-Driven Development')
  const meaningful = section(testing, '## Meaningful Assertions')

  assert.ok(meaningfulIndex >= 0, 'testing.md has the heading ## Meaningful Assertions')
  assert.ok(goodTestIndex >= 0, 'testing.md has the heading ## What Makes a Good Test')
  assert.ok(tddIndex >= 0, 'testing.md has the heading ## Test-Driven Development')
  assert.ok(goodTestIndex < meaningfulIndex, 'Meaningful Assertions comes after What Makes a Good Test')
  assert.ok(meaningfulIndex < tddIndex, 'Meaningful Assertions comes before Test-Driven Development')
  assert.ok(
    meaningful.includes('A test earns its place only when it catches a defect that no other test catches'),
    'Meaningful Assertions contains the earns-its-place sentence',
  )
})

test('TDD record-the-base section names the git commands that capture the base state', () => {
  const skill = read('skills/test-driven-development/SKILL.md')
  const base = section(skill, '## Before the First RED: Record the Base')

  assert.ok(base.includes('git rev-parse HEAD'), 'record-the-base section contains git rev-parse HEAD')
  assert.ok(
    base.includes('git status --porcelain -uall'),
    'record-the-base section contains git status --porcelain -uall',
  )
  assert.ok(base.includes('git hash-object'), 'record-the-base section contains git hash-object')
})

test('TDD prune section dispatches a code-reviewer on the openai/hard model', () => {
  const prune = section(read('skills/test-driven-development/SKILL.md'), '## PRUNE: Every Test Earns Its Place')

  assert.ok(prune.includes('code-reviewer'), 'PRUNE section names the code-reviewer agent')
  assert.ok(prune.includes('openai/hard'), 'PRUNE section names the openai/hard model alias')
})

test('TDD prune section asks the user the removal question before applying approved removals', () => {
  const prune = section(read('skills/test-driven-development/SKILL.md'), '## PRUNE: Every Test Earns Its Place')

  for (const anchor of [
    '`question`',
    'Apply all removals and merges',
    'Choose which to apply',
    'Apply none',
    'Remove nothing until your human partner answers',
    'ask a follow-up for the REMOVE and MERGE numbers',
    'Apply nothing until that reply arrives',
    '**Apply the approved removals.**',
  ]) {
    assert.ok(prune.includes(anchor), `PRUNE section contains ${anchor}`)
  }
  const askIndex = prune.indexOf('Apply all removals and merges')
  const applyIndex = prune.indexOf('**Apply the approved removals.**')
  assert.ok(askIndex < applyIndex, 'Apply all removals and merges is asked before the approved removals are applied')
})

test('auditor prompt template exists with every placeholder and read-only constraints', () => {
  const auditorUrl = new URL('skills/test-driven-development/auditor-prompt.md', root)

  assert.ok(existsSync(auditorUrl), 'auditor-prompt.md exists')

  const template = read('skills/test-driven-development/auditor-prompt.md')
  const prompt = template.slice(template.indexOf('\n## Prompt\n'))

  assert.ok(template.includes('\n## Prompt\n'), 'auditor prompt template has a ## Prompt section')
  assert.ok(template.includes('[WHAT_WAS_BUILT]'), 'auditor prompt template contains [WHAT_WAS_BUILT]')

  for (const placeholder of [
    '[BEHAVIOURS]',
    '[TOUCHED_FILES]',
    '[SCOPE]',
    '[TEST_VALUE_RULE]',
    '[VERIFICATION]',
  ]) {
    assert.ok(prompt.includes(placeholder), `auditor prompt block contains ${placeholder}`)
  }
  assert.ok(
    prompt.includes('Do not edit, create, or delete any file'),
    'auditor prompt forbids editing, creating, or deleting any file',
  )
  assert.ok(
    prompt.includes('do not run any command'),
    'auditor prompt forbids running any command',
  )
})

test('subagent dispatch rule names test-driven-development among skills that dispatch subagents', () => {
  const dispatchLine =
    read('skills/_shared/subagent-dispatch.md')
      .split('\n')
      .find((line) => line.includes('Any skill that dispatches a subagent')) ?? ''

  assert.ok(dispatchLine.length > 0, 'subagent-dispatch.md has a line naming any skill that dispatches a subagent')
  assert.ok(
    dispatchLine.includes('`test-driven-development`'),
    'the dispatch line names test-driven-development',
  )
})

test('debugging minimal fix principle permits removals the user approved at the prune review', () => {
  const minimalFix = section(read('skills/debugging/RULES.md'), '## Minimal Fix Principle')

  assert.ok(
    minimalFix.includes('removals the user approved at the prune review'),
    'Minimal Fix Principle contains removals the user approved at the prune review',
  )
})

test('debugging Phase 7 records the base and orders implement, prune, then verify', () => {
  const phase7 = section(read('skills/debugging/SKILL.md'), '### Phase 7: Fix')
  const implementIndex = phase7.indexOf('**Implement the minimal fix**')
  const pruneIndex = phase7.indexOf('**Prune the tests.**')
  const verifyIndex = phase7.indexOf('**Invoke the `verification-before-completion` skill**')

  assert.ok(phase7.includes('Record the Base'), 'Phase 7 contains Record the Base')
  assert.ok(implementIndex >= 0, 'Phase 7 contains **Implement the minimal fix**')
  assert.ok(pruneIndex >= 0, 'Phase 7 contains **Prune the tests.**')
  assert.ok(verifyIndex >= 0, 'Phase 7 contains **Invoke the `verification-before-completion` skill**')
  assert.ok(implementIndex < pruneIndex, 'implement the minimal fix comes before prune the tests')
  assert.ok(pruneIndex < verifyIndex, 'prune the tests comes before invoking verification-before-completion')
  assert.ok(phase7.includes('removes nothing until the user answers'), 'Phase 7 prune step removes nothing until the user answers')
})

test('testing rule lets Meaningful Assertions govern removing a non-deterministic test', () => {
  const testing = read('rules/common/testing.md')

  assert.ok(!testing.includes('be fixed or removed'), 'testing.md does not grant a blanket removal of a non-deterministic test')
  assert.ok(
    testing.includes('unless the Meaningful Assertions section below allows its removal'),
    'testing.md defers removal of a non-deterministic test to the Meaningful Assertions section',
  )
})
