import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { listManagedEntries, listTargetOnlyEntries, mirrorEntry } from './managed-paths.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'managed-paths-test-'))
}

function writeFile(filePath, content = 'content') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function findEntry(entries, relativePath) {
  return entries.find((entry) => entry.relativePath === relativePath)
}

test('listManagedEntries for claude lists rules, skills, mods with excludes, files and settings.json and skips missing sources', () => {
  const sourceDir = makeTempDir()
  writeFile(path.join(sourceDir, 'rules/common/style.md'))
  writeFile(path.join(sourceDir, 'skills/demo/SKILL.md'))
  writeFile(path.join(sourceDir, 'mods/git-guard/index.mjs'))
  writeFile(path.join(sourceDir, 'statusline-command.sh'))
  writeFile(path.join(sourceDir, 'settings.json'), '{}')

  const entries = listManagedEntries(sourceDir, 'claude')

  assert.deepEqual(entries, [
    { relativePath: 'rules', kind: 'directory', excludes: [] },
    { relativePath: 'skills/demo', kind: 'directory', excludes: [] },
    {
      relativePath: 'mods/git-guard',
      kind: 'directory',
      excludes: ['/.claude-plugin/types', '/tsconfig.json'],
    },
    { relativePath: 'statusline-command.sh', kind: 'file', excludes: [] },
    { relativePath: 'settings.json', kind: 'json', excludes: [] },
  ])
})

test('listManagedEntries for opencode adds a json entry for a plugin config and excludes status.json and config.json from the plugin mirror', () => {
  const sourceDir = makeTempDir()
  writeFile(path.join(sourceDir, 'plugins/status/index.js'))
  writeFile(path.join(sourceDir, 'plugins/status/config.json'), '{}')
  writeFile(path.join(sourceDir, 'AGENTS.md'))
  writeFile(path.join(sourceDir, 'opencode.json'), '{}')

  const entries = listManagedEntries(sourceDir, 'opencode')

  assert.deepEqual(findEntry(entries, 'plugins/status').excludes, ['/status.json', '/config.json'])
  assert.equal(findEntry(entries, 'plugins/status/config.json').kind, 'json')
  assert.equal(findEntry(entries, 'AGENTS.md').kind, 'file')
  assert.equal(findEntry(entries, 'opencode.json').kind, 'json')
})

test('listTargetOnlyEntries reports a skill that exists only in the target', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'skills/shared/SKILL.md'))
  writeFile(path.join(targetDir, 'skills/shared/SKILL.md'))
  writeFile(path.join(targetDir, 'skills/teach/SKILL.md'))

  const targetOnly = listTargetOnlyEntries(sourceDir, targetDir, 'claude')

  assert.deepEqual(targetOnly, ['skills/teach'])
})

test('mirrorEntry removes from the target a file that the source no longer has', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'rules/kept.md'))
  writeFile(path.join(targetDir, 'rules/kept.md'))
  writeFile(path.join(targetDir, 'rules/deleted.md'))

  mirrorEntry(sourceDir, targetDir, { relativePath: 'rules', kind: 'directory', excludes: [] }, { dryRun: false })

  assert.equal(fs.existsSync(path.join(targetDir, 'rules/deleted.md')), false)
  assert.equal(fs.existsSync(path.join(targetDir, 'rules/kept.md')), true)
})

test('mirrorEntry does not copy a mod tsconfig.json or its .claude-plugin/types folder', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'mods/demo/index.mjs'))
  writeFile(path.join(sourceDir, 'mods/demo/tsconfig.json'))
  writeFile(path.join(sourceDir, 'mods/demo/.claude-plugin/types/api.d.ts'))
  writeFile(path.join(sourceDir, 'mods/demo/.claude-plugin/plugin.json'))
  const modEntry = findEntry(listManagedEntries(sourceDir, 'claude'), 'mods/demo')

  mirrorEntry(sourceDir, targetDir, modEntry, { dryRun: false })

  assert.equal(fs.existsSync(path.join(targetDir, 'mods/demo/index.mjs')), true)
  assert.equal(fs.existsSync(path.join(targetDir, 'mods/demo/.claude-plugin/plugin.json')), true)
  assert.equal(fs.existsSync(path.join(targetDir, 'mods/demo/tsconfig.json')), false)
  assert.equal(fs.existsSync(path.join(targetDir, 'mods/demo/.claude-plugin/types')), false)
})

test('mirrorEntry with dryRun reports the change and leaves the target unchanged', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'rules/new.md'))
  writeFile(path.join(targetDir, 'rules/stale.md'))

  const lines = mirrorEntry(sourceDir, targetDir, { relativePath: 'rules', kind: 'directory', excludes: [] }, { dryRun: true })

  assert.ok(lines.some((line) => line.includes('new.md')))
  assert.ok(lines.some((line) => line.includes('stale.md')))
  assert.equal(fs.existsSync(path.join(targetDir, 'rules/new.md')), false)
  assert.equal(fs.existsSync(path.join(targetDir, 'rules/stale.md')), true)
})

test('mirrorEntry copies a single file entry without touching its siblings in the target', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'AGENTS.md'), 'replacement content')
  writeFile(path.join(targetDir, 'AGENTS.md'), 'old')
  writeFile(path.join(targetDir, 'local.md'), 'local')

  mirrorEntry(sourceDir, targetDir, { relativePath: 'AGENTS.md', kind: 'file', excludes: [] }, { dryRun: false })

  assert.equal(fs.readFileSync(path.join(targetDir, 'AGENTS.md'), 'utf8'), 'replacement content')
  assert.equal(fs.existsSync(path.join(targetDir, 'local.md')), true)
})

test('mirrorEntry throws for a json entry because JSON is merged elsewhere', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(sourceDir, 'settings.json'), '{}')

  assert.throws(
    () => mirrorEntry(sourceDir, targetDir, { relativePath: 'settings.json', kind: 'json', excludes: [] }, { dryRun: false }),
    /settings\.json.*merge/,
  )
})

test('mirrorEntry throws an error naming the entry and rsync stderr when the source is missing', () => {
  const sourceDir = makeTempDir()
  const targetDir = makeTempDir()

  assert.throws(
    () => mirrorEntry(sourceDir, targetDir, { relativePath: 'rules', kind: 'directory', excludes: [] }, { dryRun: false }),
    /rsync failed for "rules".*No such file or directory/s,
  )
})
