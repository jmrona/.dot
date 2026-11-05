import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createBackup, listBackups, restoreBackup } from './backup.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'))
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

test('restoreBackup returns managed paths to their previous content and removes a file added after the backup', () => {
  const backupRoot = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(targetDir, 'rules/style.md'), 'original')
  writeFile(path.join(targetDir, 'settings.json'), '{"original":true}')
  writeFile(path.join(targetDir, 'runtime/session.log'), 'unmanaged')
  const targets = [{ name: 'claude', targetDir, relativePaths: ['rules', 'settings.json', 'hooks'] }]
  createBackup({ backupRoot, stamp: '20260101-000000', targets })
  writeFile(path.join(targetDir, 'rules/style.md'), 'changed')
  writeFile(path.join(targetDir, 'rules/added.md'), 'added')
  fs.rmSync(path.join(targetDir, 'settings.json'))

  restoreBackup({ backupRoot, stamp: '20260101-000000' })

  assert.equal(readFile(path.join(targetDir, 'rules/style.md')), 'original')
  assert.equal(fs.existsSync(path.join(targetDir, 'rules/added.md')), false)
  assert.equal(readFile(path.join(targetDir, 'settings.json')), '{"original":true}')
  assert.equal(readFile(path.join(targetDir, 'runtime/session.log')), 'unmanaged')
})

test('restoreBackup with an unknown stamp throws a message that lists the available stamps', () => {
  const backupRoot = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(targetDir, 'rules/style.md'), 'original')
  const targets = [{ name: 'claude', targetDir, relativePaths: ['rules'] }]
  createBackup({ backupRoot, stamp: '20260101-000000', targets })
  createBackup({ backupRoot, stamp: '20260202-000000', targets })

  assert.throws(
    () => restoreBackup({ backupRoot, stamp: 'missing-stamp' }),
    /missing-stamp.*20260101-000000.*20260202-000000/s,
  )
})

test('listBackups returns sorted stamps that have a manifest and ignores other folders', () => {
  const backupRoot = makeTempDir()
  const targets = [{ name: 'claude', targetDir: makeTempDir(), relativePaths: ['rules'] }]
  createBackup({ backupRoot, stamp: '20260202-000000', targets })
  createBackup({ backupRoot, stamp: '20260101-000000', targets })
  fs.mkdirSync(path.join(backupRoot, 'incomplete'))

  assert.deepEqual(listBackups(backupRoot), ['20260101-000000', '20260202-000000'])
})

test('listBackups returns an empty list when the backup root does not exist', () => {
  assert.deepEqual(listBackups(path.join(makeTempDir(), 'missing')), [])
})

test('createBackup records the managed and existing paths of each target in the manifest', () => {
  const backupRoot = makeTempDir()
  const targetDir = makeTempDir()
  writeFile(path.join(targetDir, 'rules/style.md'), 'original')
  const targets = [{ name: 'claude', targetDir, relativePaths: ['rules', 'hooks'] }]

  const backupDir = createBackup({ backupRoot, stamp: '20260101-000000', targets })

  const manifest = JSON.parse(readFile(path.join(backupDir, 'manifest.json')))
  assert.deepEqual(manifest.targets[0].managedPaths, ['rules', 'hooks'])
  assert.deepEqual(manifest.targets[0].existingPaths, ['rules'])
})

test('createBackup throws an error naming the target when tar cannot read a managed path', () => {
  const backupRoot = makeTempDir()
  const targetDir = makeTempDir()
  const unreadablePath = path.join(targetDir, 'rules/secret.md')
  writeFile(unreadablePath, 'original')
  fs.chmodSync(unreadablePath, 0o000)
  const targets = [{ name: 'claude', targetDir, relativePaths: ['rules'] }]

  assert.throws(() => createBackup({ backupRoot, stamp: '20260101-000000', targets }), /tar failed for target "claude"/)
})
