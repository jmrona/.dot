import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function readOrEmpty(path) {
  const target = new URL(path, root)
  return existsSync(target) ? readFileSync(target, 'utf8') : ''
}

function section(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const level = heading.match(/^#+/)[0].length
  const rest = text.slice(start + heading.length)
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'))
  return next < 0 ? text.slice(start) : text.slice(start, start + heading.length + next)
}

test('testing rule contains the Meaningful Assertions section with the earns-its-place sentence', () => {
  const testing = readOrEmpty('rules/common/testing.md')

  assert.ok(testing.includes('## Meaningful Assertions'), 'testing.md has the heading ## Meaningful Assertions')
  assert.ok(
    testing.includes('A test earns its place only when it catches a defect that no other test catches'),
    'testing.md contains the earns-its-place sentence',
  )
})

test('testing rule no longer grants a blanket removal of a non-deterministic test', () => {
  const testing = readOrEmpty('rules/common/testing.md')

  assert.ok(!testing.includes('gets fixed or removed'), 'testing.md does not contain gets fixed or removed')
  assert.ok(
    testing.includes('unless the Meaningful Assertions section below allows its removal'),
    'testing.md defers removal of a non-deterministic test to the Meaningful Assertions section',
  )
})

test('testing rule points to the test-driven-development skill as the executable cycle', () => {
  const testing = readOrEmpty('rules/common/testing.md')

  assert.ok(
    testing.includes('The `test-driven-development` skill is the executable cycle.'),
    'testing.md names the test-driven-development skill as the executable cycle',
  )
  assert.ok(!testing.includes('work-tdd'), 'testing.md does not mention the removed work-tdd skill')
})

test('TDD record-the-base section names the git commands that capture the base state', () => {
  const skill = readOrEmpty('skills/test-driven-development/SKILL.md')
  const base = section(skill, '## Before the First RED: Record the Base')

  assert.ok(base.includes('git rev-parse HEAD'), 'record-the-base section contains git rev-parse HEAD')
  assert.ok(base.includes('--porcelain -uall'), 'record-the-base section contains --porcelain -uall')
  assert.ok(base.includes('git hash-object'), 'record-the-base section contains git hash-object')
})

test('TDD prune section dispatches its reviewer through Claude tools', () => {
  const prune = section(readOrEmpty('skills/test-driven-development/SKILL.md'), '## PRUNE: Every Test Earns Its Place')

  for (const anchor of [
    '`Agent`',
    'subagent_type: general-purpose',
    'Standard escalation tier',
    '../_shared/subagent-dispatch.md',
    'SendMessage',
  ]) {
    assert.ok(prune.includes(anchor), `PRUNE section contains ${anchor}`)
  }
})

test('ported skill files carry no opencode tool layer', () => {
  for (const skillFile of [
    'skills/test-driven-development/SKILL.md',
    'skills/test-driven-development/auditor-prompt.md',
    'skills/debugging/SKILL.md',
    'skills/debugging/RULES.md',
  ]) {
    const text = readOrEmpty(skillFile)

    for (const opencodeAnchor of [
      'openai/',
      'code-reviewer',
      'model-routing.md',
      'native `question` tool',
      'sessionID',
    ]) {
      assert.ok(!text.includes(opencodeAnchor), `${skillFile} does not contain ${opencodeAnchor}`)
    }
  }
})

test('TDD prune section asks the user the removal question before applying approved removals', () => {
  const prune = section(readOrEmpty('skills/test-driven-development/SKILL.md'), '## PRUNE: Every Test Earns Its Place')

  for (const anchor of [
    '`AskUserQuestion`',
    'Apply all removals',
    'Choose which to apply',
    'Apply none',
    'ask a follow-up for the REMOVE numbers',
    'Apply nothing until that reply arrives',
    'Remove nothing until your human partner answers',
    '**Apply the approved removals.**',
  ]) {
    assert.ok(prune.includes(anchor), `PRUNE section contains ${anchor}`)
  }
  const askIndex = prune.indexOf('`AskUserQuestion`')
  const applyIndex = prune.indexOf('**Apply the approved removals.**')
  assert.ok(askIndex >= 0 && applyIndex >= 0, 'PRUNE section contains both the question and the apply step')
  assert.ok(askIndex < applyIndex, 'AskUserQuestion is used before the approved removals are applied')
})

test('auditor prompt template exists with every placeholder and read-only constraints', () => {
  const auditorUrl = new URL('skills/test-driven-development/auditor-prompt.md', root)

  assert.ok(existsSync(auditorUrl), 'auditor-prompt.md exists')

  const template = readOrEmpty('skills/test-driven-development/auditor-prompt.md')
  const promptStart = template.indexOf('\n## Prompt\n')
  const prompt = promptStart < 0 ? '' : template.slice(promptStart)

  assert.ok(promptStart >= 0, 'auditor prompt template has a ## Prompt section')
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
  assert.ok(prompt.includes('do not run any command'), 'auditor prompt forbids running any command')
})

test('subagent dispatch rule names test-driven-development among skills that dispatch subagents', () => {
  const dispatchRule = readOrEmpty('skills/_shared/subagent-dispatch.md')

  assert.ok(dispatchRule.includes('test-driven-development'), 'subagent-dispatch.md names test-driven-development')
})

test('debugging minimal fix principle permits removals the user approved at the prune review', () => {
  const rules = readOrEmpty('skills/debugging/RULES.md')

  assert.ok(
    rules.includes('The test prune in Phase 7 is the one exception.'),
    'debugging RULES.md names the test prune in Phase 7 as the one exception',
  )
})

test('debugging Phase 7 records the base and orders implement, prune, then verify', () => {
  const phase7 = section(readOrEmpty('skills/debugging/SKILL.md'), '### Phase 7: Fix')
  const implementIndex = phase7.indexOf('**Implement the minimal fix**')
  const pruneIndex = phase7.indexOf('**Prune the tests.**')
  const verifyIndex = phase7.indexOf('**Invoke the `verification-before-completion` skill**')

  assert.ok(phase7.includes('Before the First RED: Record the Base'), 'Phase 7 contains Before the First RED: Record the Base')
  assert.ok(implementIndex >= 0, 'Phase 7 contains **Implement the minimal fix**')
  assert.ok(pruneIndex >= 0, 'Phase 7 contains **Prune the tests.**')
  assert.ok(verifyIndex >= 0, 'Phase 7 contains **Invoke the `verification-before-completion` skill**')
  assert.ok(implementIndex < pruneIndex, 'implement the minimal fix comes before prune the tests')
  assert.ok(pruneIndex < verifyIndex, 'prune the tests comes before invoking verification-before-completion')
  assert.ok(phase7.includes('removes nothing until the user answers'), 'Phase 7 prune step removes nothing until the user answers')
})

test('duplicate skills are removed from the Claude harness', () => {
  for (const removedSkill of ['skills/work-tdd', 'skills/debug-investigation', 'skills/work-swarm']) {
    assert.ok(!existsSync(new URL(removedSkill, root)), `${removedSkill} does not exist`)
  }

  for (const directory of ['rules/', 'skills/']) {
    const markdownPaths = readdirSync(new URL(directory, root), { recursive: true }).filter((entry) => entry.endsWith('.md'))

    for (const markdownPath of markdownPaths) {
      const text = readOrEmpty(`${directory}${markdownPath}`)

      for (const removedName of ['work-tdd', 'debug-investigation', 'work-swarm']) {
        assert.ok(!text.includes(removedName), `${directory}${markdownPath} does not mention ${removedName}`)
      }
    }
  }
})

test('misplaced authoring file is absent from the Claude home root', () => {
  assert.ok(!existsSync(new URL('CLAUDE.md', root)), 'CLAUDE.md does not exist at the ~/.claude root')
})
