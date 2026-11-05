import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { mergeJson, writeJsonAtomically } from './json-merge.mjs'

function makeTempDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'json-merge-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('mergeJson keeps a local-only key, listing its path in keptLocal', () => {
  const result = mergeJson({ autoMode: true, model: 'repo' }, { model: 'repo' })

  assert.deepEqual(result.keptLocal, ['autoMode'])
  assert.equal(result.merged.autoMode, true)
})

test('mergeJson resolves a differing nested scalar to the repo value, recorded as a conflict', () => {
  const local = { pluginConfigs: { 'ember-guard': { level: 'strict' } } }
  const repo = { pluginConfigs: { 'ember-guard': { level: 'relaxed' } } }

  const result = mergeJson(local, repo)

  assert.equal(result.merged.pluginConfigs['ember-guard'].level, 'relaxed')
  assert.deepEqual(result.conflicts, [
    { path: 'pluginConfigs.ember-guard.level', local: 'strict', repo: 'relaxed' },
  ])
})

test('mergeJson resolves a differing list to the repo list, recorded as a conflict', () => {
  const result = mergeJson({ hooks: ['a', 'b'] }, { hooks: ['c'] })

  assert.deepEqual(result.merged.hooks, ['c'])
  assert.deepEqual(result.conflicts, [{ path: 'hooks', local: ['a', 'b'], repo: ['c'] }])
})

test('mergeJson adds a key that exists only in the repo without reporting a conflict', () => {
  const result = mergeJson({}, { model: 'repo-model' })

  assert.equal(result.merged.model, 'repo-model')
  assert.deepEqual(result.conflicts, [])
})

test('mergeJson reports no conflict for equal values', () => {
  const result = mergeJson({ nested: { items: [1, 2] }, name: 'same' }, { nested: { items: [1, 2] }, name: 'same' })

  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.keptLocal, [])
})

test('mergeJson does not mutate its input values', () => {
  const local = { autoMode: true, pluginConfigs: { 'ember-guard': { level: 'strict' } } }
  const repo = { pluginConfigs: { 'ember-guard': { level: 'relaxed' } }, hooks: ['c'] }
  const localBefore = structuredClone(local)
  const repoBefore = structuredClone(repo)

  mergeJson(local, repo)

  assert.deepEqual(local, localBefore)
  assert.deepEqual(repo, repoBefore)
})

test('writeJsonAtomically replaces the file with pretty-printed JSON ending in a newline', (t) => {
  const directory = makeTempDir(t)
  const filePath = path.join(directory, 'settings.json')
  fs.writeFileSync(filePath, '{"stale":true}\n')
  const value = { permissions: { allow: ['Read'] } }

  writeJsonAtomically(filePath, value)

  assert.equal(fs.readFileSync(filePath, 'utf8'), `${JSON.stringify(value, null, 2)}\n`)
})

test('writeJsonAtomically leaves no temporary file next to the written file', (t) => {
  const directory = makeTempDir(t)
  const filePath = path.join(directory, 'settings.json')
  fs.writeFileSync(filePath, '{}\n')

  writeJsonAtomically(filePath, { model: 'repo-model' })

  assert.deepEqual(fs.readdirSync(directory), ['settings.json'])
})
