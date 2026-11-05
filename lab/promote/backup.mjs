import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function archivePath(backupDir, name) {
  return path.join(backupDir, `${name}.tar.gz`)
}

function runTar(args, failureContext) {
  const result = spawnSync('tar', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`tar failed ${failureContext} (exit ${result.status}): ${result.stderr.trim()}`)
  }
}

function backUpTarget(backupDir, { name, targetDir, relativePaths }) {
  const existingPaths = relativePaths.filter((relativePath) => fs.existsSync(path.join(targetDir, relativePath)))
  if (existingPaths.length > 0) {
    runTar(['-czf', archivePath(backupDir, name), '-C', targetDir, ...existingPaths], `for target "${name}"`)
  }
  return { name, targetDir, managedPaths: relativePaths, existingPaths }
}

export function createBackup({ backupRoot, stamp, targets }) {
  const backupDir = path.join(backupRoot, stamp)
  fs.mkdirSync(backupDir, { recursive: true })
  const manifest = { targets: targets.map((target) => backUpTarget(backupDir, target)) }
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return backupDir
}

function restoreTarget(backupDir, { name, targetDir, managedPaths }) {
  for (const relativePath of managedPaths) {
    fs.rmSync(path.join(targetDir, relativePath), { recursive: true, force: true })
  }
  if (fs.existsSync(archivePath(backupDir, name))) {
    runTar(['-xzf', archivePath(backupDir, name), '-C', targetDir], `while restoring target "${name}"`)
  }
}

export function listBackups(backupRoot) {
  if (!fs.existsSync(backupRoot)) return []
  return fs.readdirSync(backupRoot)
    .filter((stamp) => fs.existsSync(path.join(backupRoot, stamp, 'manifest.json')))
    .sort()
}

function assertBackupExists(backupRoot, stamp) {
  if (fs.existsSync(path.join(backupRoot, stamp, 'manifest.json'))) return
  const available = listBackups(backupRoot)
  const availableText = available.length > 0 ? available.join(', ') : 'none'
  throw new Error(`No backup named "${stamp}" in ${backupRoot}. Available backups: ${availableText}.`)
}

export function restoreBackup({ backupRoot, stamp }) {
  assertBackupExists(backupRoot, stamp)
  const backupDir = path.join(backupRoot, stamp)
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'))
  manifest.targets.forEach((target) => restoreTarget(backupDir, target))
}
