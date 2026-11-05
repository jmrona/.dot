import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MOD_EXCLUDES = ['/.claude-plugin/types', '/tsconfig.json']

const PLUGIN_EXCLUDES = ['/status.json', '/config.json']

const LAYOUTS = {
  claude: {
    directories: ['rules', 'hooks'],
    subfolderParents: [{ parent: 'skills', excludes: [] }, { parent: 'mods', excludes: MOD_EXCLUDES }],
    files: ['statusline-command.sh', '.mcp.json'],
    jsonFiles: ['settings.json'],
  },
  opencode: {
    directories: ['rules', 'agents', 'commands', 'scripts', 'tests'],
    subfolderParents: [{ parent: 'skills', excludes: [] }, { parent: 'plugins', excludes: PLUGIN_EXCLUDES }],
    files: ['AGENTS.md', 'package.json'],
    jsonFiles: ['opencode.json', 'cli.json'],
  },
}

function exists(sourceDir, relativePath) {
  return fs.existsSync(path.join(sourceDir, relativePath))
}

function listSubfolders(baseDir, parent) {
  const parentDir = path.join(baseDir, parent)
  if (!fs.existsSync(parentDir)) return []
  return fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort()
}

function entriesFor(sourceDir, relativePaths, kind) {
  return relativePaths
    .filter((relativePath) => exists(sourceDir, relativePath))
    .map((relativePath) => ({ relativePath, kind, excludes: [] }))
}

function subfolderEntries(sourceDir, { parent, excludes }) {
  return listSubfolders(sourceDir, parent)
    .map((name) => ({ relativePath: `${parent}/${name}`, kind: 'directory', excludes }))
}

function pluginConfigEntries(sourceDir, subfolderEntriesList) {
  return entriesFor(
    sourceDir,
    subfolderEntriesList
      .filter((entry) => entry.relativePath.startsWith('plugins/'))
      .map((entry) => `${entry.relativePath}/config.json`),
    'json',
  )
}

export function listManagedEntries(sourceDir, flavour) {
  const layout = LAYOUTS[flavour]
  const subfolders = layout.subfolderParents.flatMap((parent) => subfolderEntries(sourceDir, parent))
  return [
    ...entriesFor(sourceDir, layout.directories, 'directory'),
    ...subfolders,
    ...pluginConfigEntries(sourceDir, subfolders),
    ...entriesFor(sourceDir, layout.files, 'file'),
    ...entriesFor(sourceDir, layout.jsonFiles, 'json'),
  ]
}

export function listTargetOnlyEntries(sourceDir, targetDir, flavour) {
  return LAYOUTS[flavour].subfolderParents.flatMap(({ parent }) => {
    const sourceNames = new Set(listSubfolders(sourceDir, parent))
    return listSubfolders(targetDir, parent)
      .filter((name) => !sourceNames.has(name))
      .map((name) => `${parent}/${name}`)
  })
}

function buildRsyncArgs(entry, sourcePath, targetPath, dryRun) {
  const excludeArgs = entry.excludes.flatMap((pattern) => ['--exclude', pattern])
  const dryRunArgs = dryRun ? ['-n'] : []
  const trailingSlash = entry.kind === 'directory' ? '/' : ''
  return ['-a', '--delete', '--itemize-changes', '--checksum', ...dryRunArgs, ...excludeArgs, `${sourcePath}${trailingSlash}`, `${targetPath}${trailingSlash}`]
}

function runRsync(entry, args) {
  const result = spawnSync('rsync', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`rsync failed for "${entry.relativePath}" (exit ${result.status}): ${result.stderr.trim()}`)
  }
  return result.stdout.split('\n').filter((line) => line.trim() !== '')
}

export function mirrorEntry(sourceDir, targetDir, entry, { dryRun }) {
  if (entry.kind === 'json') {
    throw new Error(`Cannot mirror "${entry.relativePath}" with rsync because JSON files are merged, not mirrored. Use the JSON merge step instead.`)
  }
  const targetPath = path.join(targetDir, entry.relativePath)
  if (!dryRun) fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  return runRsync(entry, buildRsyncArgs(entry, path.join(sourceDir, entry.relativePath), targetPath, dryRun))
}
