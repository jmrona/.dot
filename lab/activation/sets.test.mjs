import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { activationSets, chainedSkills } from './sets.mjs'

const skillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'skills')
const SPANISH_INFORMAL_MARKER = /\b(oye|mirame|me han)\b/i
const CODE_EDIT_REQUEST = /\b(add|implement|rename|fix|change|refactor|anadas|anadir|renombra|corrige|hazlo|cambia|arregla)\b/i
const TECHNIQUE_NAME = /code review/i

function skillDirectories() {
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
}

const setSkills = activationSets.map((set) => set.skill)

test('every skill directory is either in an activation set or in the chained list', () => {
  const unlisted = skillDirectories().filter(
    (name) => !setSkills.includes(name) && !chainedSkills.includes(name),
  )
  assert.deepEqual(unlisted, [])
})

test('no skill is both in an activation set and in the chained list', () => {
  assert.deepEqual(chainedSkills.filter((name) => setSkills.includes(name)), [])
})

test('every listed skill has a directory', () => {
  const missing = [...setSkills, ...chainedSkills].filter((name) => !skillDirectories().includes(name))
  assert.deepEqual(missing, [])
})

test('the activation sets cover the eleven skills that a request starts directly', () => {
  assert.deepEqual([...setSkills].sort(), [
    'brainstorming',
    'codebase-memory',
    'commit-msg',
    'create-tickets',
    'debugging',
    'pick-up-jira-work',
    'receiving-code-review',
    'requesting-code-review',
    'summarize-diff',
    'verification-before-completion',
    'work-on-ticket',
  ])
})

test('each activation set declares only a skill, positives and near misses', () => {
  for (const set of activationSets) {
    assert.deepEqual(Object.keys(set).sort(), ['nearMisses', 'positives', 'skill'])
  }
})

test('each skill has three positives', () => {
  const wrong = activationSets.filter((set) => set.positives.length !== 3).map((set) => set.skill)
  assert.deepEqual(wrong, [])
})

test('each skill has two near misses', () => {
  const wrong = activationSets.filter((set) => set.nearMisses.length !== 2).map((set) => set.skill)
  assert.deepEqual(wrong, [])
})

test('each skill has at least one informal Spanish positive', () => {
  const without = activationSets
    .filter((set) => !set.positives.some((prompt) => SPANISH_INFORMAL_MARKER.test(prompt)))
    .map((set) => set.skill)
  assert.deepEqual(without, [])
})

test('every prompt is a non-empty string', () => {
  const prompts = activationSets.flatMap((set) => [...set.positives, ...set.nearMisses])
  assert.equal(prompts.every((prompt) => typeof prompt === 'string' && prompt.trim() !== ''), true)
})

test('no prompt appears twice', () => {
  const prompts = activationSets.flatMap((set) => [...set.positives, ...set.nearMisses])
  assert.deepEqual(prompts.filter((prompt, index) => prompts.indexOf(prompt) !== index), [])
})

test('no prompt names the skill that it is meant to activate', () => {
  const naming = activationSets.flatMap((set) =>
    [...set.positives, ...set.nearMisses]
      .filter((prompt) => prompt.toLowerCase().includes(set.skill))
      .map((prompt) => `${set.skill}: ${prompt}`),
  )
  assert.deepEqual(naming, [])
})

function positivesOf(skills) {
  return activationSets.filter((set) => skills.includes(set.skill)).flatMap((set) => set.positives)
}

test('no positive outside brainstorming asks for a code edit, which would measure the router', () => {
  const others = activationSets.filter((set) => set.skill !== 'brainstorming').map((set) => set.skill)
  assert.deepEqual(positivesOf(others).filter((prompt) => CODE_EDIT_REQUEST.test(prompt)), [])
})

test('the requesting-code-review positives do not name the technique', () => {
  const naming = positivesOf(['requesting-code-review'])
  assert.deepEqual(naming.filter((prompt) => TECHNIQUE_NAME.test(prompt)), [])
})
