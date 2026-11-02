import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXCLUDED_ROOT_DIRECTORY = 'tests'
const UPDATE_REMEDIATION =
  'Review the list above. If every change is expected, run: node lab/surface.mjs update'

function listEntries(directory, isRoot = true) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((dirent) => {
    const fullPath = path.join(directory, dirent.name)
    if (dirent.name === '.DS_Store') return []
    if (isRoot && dirent.name === EXCLUDED_ROOT_DIRECTORY && dirent.isDirectory()) return []
    return dirent.isDirectory() ? listEntries(fullPath, false) : [fullPath]
  })
}

function readFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : ''
}

function hasPathsKey(content) {
  return /^paths:/m.test(readFrontmatter(content))
}

function stripQuotes(value) {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2')
}

function collectIndentedLines(lines, startIndex) {
  const collected = []
  for (const line of lines.slice(startIndex)) {
    if (!/^\s+\S/.test(line)) break
    collected.push(line.trim())
  }
  return collected
}

function readDescription(content) {
  const lines = readFrontmatter(content).split('\n')
  const startIndex = lines.findIndex((line) => line.startsWith('description:'))
  if (startIndex === -1) return ''
  const inlineValue = lines[startIndex].slice('description:'.length).trim()
  const continuation = collectIndentedLines(lines, startIndex + 1)
  const indicator = inlineValue.match(/^([>|])[+-]?$/)
  if (indicator) return continuation.join(indicator[1] === '|' ? '\n' : ' ')
  return stripQuotes([inlineValue, ...continuation].join(' '))
}

function countWords(content) {
  return content.split(/\s+/).filter(Boolean).length
}

function buildSymlinkEntry(fullPath) {
  return { linkTarget: fs.readlinkSync(fullPath), words: 0, alwaysLoaded: false, executable: false }
}

function buildFileEntry(relativePath, fullPath, stats) {
  const buffer = fs.readFileSync(fullPath)
  const content = buffer.toString('utf8')
  const entry = {
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    words: countWords(content),
    alwaysLoaded: relativePath.startsWith('rules/') && !hasPathsKey(content),
    executable: (stats.mode & 0o111) !== 0,
  }
  if (/^skills\/[^/]+\/SKILL\.md$/.test(relativePath)) entry.description = readDescription(content)
  return entry
}

function buildEntry(relativePath, fullPath) {
  const stats = fs.lstatSync(fullPath)
  return stats.isSymbolicLink() ? buildSymlinkEntry(fullPath) : buildFileEntry(relativePath, fullPath, stats)
}

function sumAlwaysLoadedWords(entries) {
  return Object.values(entries)
    .filter((entry) => entry.alwaysLoaded)
    .reduce((total, entry) => total + entry.words, 0)
}

export function readSurface(harnessDir) {
  const relativePaths = listEntries(harnessDir)
    .map((filePath) => path.relative(harnessDir, filePath).split(path.sep).join('/'))
    .sort()
  const entries = {}
  for (const relativePath of relativePaths) {
    entries[relativePath] = buildEntry(relativePath, path.join(harnessDir, relativePath))
  }
  return { entries, alwaysLoadedWords: sumAlwaysLoadedWords(entries) }
}

function hasChanged(lockedEntry, currentEntry) {
  return ['sha256', 'executable', 'linkTarget'].some((field) => lockedEntry[field] !== currentEntry[field])
}

export function diffSurface(lockedSurface, currentSurface) {
  const locked = lockedSurface.entries
  const current = currentSurface.entries
  const sharedPaths = Object.keys(current).filter((entryPath) => entryPath in locked)
  const changed = sharedPaths.filter((entryPath) => hasChanged(locked[entryPath], current[entryPath]))
  return {
    added: Object.keys(current).filter((entryPath) => !(entryPath in locked)).sort(),
    removed: Object.keys(locked).filter((entryPath) => !(entryPath in current)).sort(),
    changed: changed.sort(),
    descriptionsChanged: changed
      .filter((entryPath) => locked[entryPath].description !== current[entryPath].description)
      .sort(),
    alwaysLoadedWordsDelta: currentSurface.alwaysLoadedWords - lockedSurface.alwaysLoadedWords,
  }
}

function isClean(diff) {
  return !diff.added.length && !diff.removed.length && !diff.changed.length
}

function formatReport(diff, current) {
  const lines = [
    ...diff.added.map((entryPath) => `added: ${entryPath}`),
    ...diff.removed.map((entryPath) => `removed: ${entryPath}`),
    ...diff.changed.map((entryPath) => `changed: ${entryPath}`),
    ...diff.descriptionsChanged.map(
      (entryPath) => `description of ${entryPath}: ${current.entries[entryPath].description}`,
    ),
  ]
  const sign = diff.alwaysLoadedWordsDelta >= 0 ? '+' : ''
  lines.push(`always-loaded words: ${current.alwaysLoadedWords} (${sign}${diff.alwaysLoadedWordsDelta})`)
  return lines.join('\n')
}

function runCheck(lockPath, harnessDir) {
  if (!fs.existsSync(lockPath)) {
    console.log(`[FAIL] no lock file at ${lockPath}\n${UPDATE_REMEDIATION}`)
    return 1
  }
  const current = readSurface(harnessDir)
  const diff = diffSurface(JSON.parse(fs.readFileSync(lockPath, 'utf8')), current)
  if (isClean(diff)) {
    console.log('[PASS] surface matches the lock')
    return 0
  }
  console.log(`${formatReport(diff, current)}\n[FAIL] surface differs from the lock\n${UPDATE_REMEDIATION}`)
  return 1
}

function runUpdate(lockPath, harnessDir) {
  fs.writeFileSync(lockPath, `${JSON.stringify(readSurface(harnessDir), null, 2)}\n`)
  console.log(`wrote ${lockPath}`)
  return 0
}

function main(command) {
  const labDir = path.dirname(fileURLToPath(import.meta.url))
  const harnessDir = path.join(labDir, '..', '.claude')
  const lockPath = path.join(labDir, 'surface.lock.json')
  if (command === 'check') return runCheck(lockPath, harnessDir)
  if (command === 'update') return runUpdate(lockPath, harnessDir)
  console.log('usage: node lab/surface.mjs check|update')
  return 1
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv[2])
}
