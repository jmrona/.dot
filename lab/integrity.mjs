import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_DENY_ENTRIES = [
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git reset --hard:*)',
  'Bash(git clean -f:*)',
  'Bash(git checkout .:*)',
  'Bash(git restore .:*)',
  'Bash(git branch -D:*)',
  'Bash(git rebase:*)',
  'Bash(git push:*)',
]

const HOOK_TIMEOUT_MILLISECONDS = 5000
const BENIGN_HOOK_PAYLOAD = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'true' } })
const RELATIVE_REFERENCE = /^\.{1,2}\/[^\s`()<>*{}]*\.md$/
const BLOCK_HOOK_COMMAND = /(^|\/)block-git-commands\.mjs(\s|$)/
const MISSING_BASH_BLOCK_HOOK =
  'settings.json has no PreToolUse Bash hook with onFailure block that runs block-git-commands.mjs'
const HOOK_COMMAND = /^~\/\.claude\/hooks\/([^\s/]+)(\s.*)?$/

function listMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listMarkdownFiles(entryPath)
    return entry.name.endsWith('.md') ? [entryPath] : []
  })
}

function stripFencedBlocks(markdown) {
  return markdown.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
}

function extractReferences(markdown) {
  const text = stripFencedBlocks(markdown)
  const backticked = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  const linked = [...text.matchAll(/\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)].map((match) => match[1])
  return [...backticked, ...linked]
    .map((candidate) => candidate.split('#')[0])
    .filter((candidate) => RELATIVE_REFERENCE.test(candidate))
}

function relativeTo(harnessDir, filePath) {
  return path.relative(harnessDir, filePath)
}

function brokenReferencesIn(harnessDir, filePath) {
  const references = extractReferences(fs.readFileSync(filePath, 'utf8'))
  return references
    .filter((reference) => !fs.existsSync(path.resolve(path.dirname(filePath), reference)))
    .map((reference) => `${relativeTo(harnessDir, filePath)} cites missing file ${reference}`)
}

export function findBrokenReferences(harnessDir) {
  const files = ['rules', 'skills'].flatMap((name) => listMarkdownFiles(path.join(harnessDir, name)))
  return files.flatMap((filePath) => brokenReferencesIn(harnessDir, filePath))
}

function readFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(\n|$)/)
  return match ? match[1] : null
}

function hasNonEmptyPathsList(frontmatter) {
  const blockList = /^paths:[ \t]*\n([ \t]+-[ \t]+\S.*\n?)+/m
  const inlineList = /^paths:[ \t]*\[[ \t]*[^\]\s][^\]]*\]/m
  return blockList.test(`${frontmatter}\n`) || inlineList.test(frontmatter)
}

function frontmatterFailuresFor(harnessDir, filePath) {
  const name = relativeTo(harnessDir, filePath)
  const frontmatter = readFrontmatter(fs.readFileSync(filePath, 'utf8'))
  const isCommon = name.split(path.sep)[1] === 'common'
  const failures = []
  if (frontmatter && /^globs:/m.test(frontmatter)) failures.push(`${name} uses globs, which Claude Code ignores`)
  if (isCommon && frontmatter && /^paths:/m.test(frontmatter)) failures.push(`${name} is common but declares paths`)
  if (!isCommon && !(frontmatter && hasNonEmptyPathsList(frontmatter))) {
    failures.push(`${name} must open with frontmatter holding a non-empty paths list`)
  }
  return failures
}

export function findInvalidRuleFrontmatter(harnessDir) {
  return listMarkdownFiles(path.join(harnessDir, 'rules')).flatMap((filePath) =>
    frontmatterFailuresFor(harnessDir, filePath),
  )
}

function loadSettings(harnessDir) {
  const settingsPath = path.join(harnessDir, 'settings.json')
  try {
    return { settings: JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
  } catch (error) {
    return { failure: `settings.json could not be read at ${settingsPath}: ${error.message}` }
  }
}

export function findMissingDenyEntries(harnessDir, requiredDenyEntries) {
  const { settings, failure } = loadSettings(harnessDir)
  if (failure) return [failure]
  const deny = settings.permissions?.deny ?? []
  return requiredDenyEntries
    .filter((entry) => !deny.includes(entry))
    .map((entry) => `settings.json permissions.deny is missing ${entry}`)
}

function collectHookCommands(settings) {
  return Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((group) => group.hooks ?? [])
    .map((hook) => hook.command)
}

function describeRunFailure(command, result) {
  if (result.error?.code === 'ETIMEDOUT') return `hook ${command} timed out after ${HOOK_TIMEOUT_MILLISECONDS} ms`
  if (result.error) return `hook ${command} failed to run: ${result.error.message}`
  return result.status === 0 ? null : `hook ${command} exited with status ${result.status}`
}

function hookFailureFor(harnessDir, command) {
  const match = typeof command === 'string' ? command.match(HOOK_COMMAND) : null
  if (!match) return `unrecognised hook command: ${command}`
  const hookPath = path.join(harnessDir, 'hooks', match[1])
  if (!fs.existsSync(hookPath)) return `hook ${command} has no file at ${hookPath}`
  if (!(fs.statSync(hookPath).mode & 0o111)) return `hook ${command} is not executable`
  const result = spawnSync(hookPath, [], { input: BENIGN_HOOK_PAYLOAD, timeout: HOOK_TIMEOUT_MILLISECONDS })
  return describeRunFailure(command, result)
}

export function findBrokenHooks(harnessDir) {
  const { settings, failure } = loadSettings(harnessDir)
  if (failure) return [failure]
  return collectHookCommands(settings)
    .map((command) => hookFailureFor(harnessDir, command))
    .filter(Boolean)
}

function runAllChecks(harnessDir) {
  return [
    ...findBrokenReferences(harnessDir),
    ...findInvalidRuleFrontmatter(harnessDir),
    ...findMissingDenyEntries(harnessDir, REQUIRED_DENY_ENTRIES),
    ...findBrokenHooks(harnessDir),
    ...findMissingBashBlockHook(harnessDir),
  ]
}

function main() {
  const harnessDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude')
  const failures = runAllChecks(harnessDir)
  if (failures.length === 0) {
    console.log('[PASS] integrity')
    return
  }
  console.log('[FAIL] integrity')
  failures.forEach((failure) => console.log(`  ${failure}`))
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

export function findMissingBashBlockHook(harnessDir) {
  const { settings, failure } = loadSettings(harnessDir)
  if (failure) return [failure]
  const blocksOnFailure = (settings.hooks?.PreToolUse ?? [])
    .filter((group) => group.matcher === 'Bash')
    .flatMap((group) => group.hooks ?? [])
    .some((hook) => hook.onFailure === 'block' && BLOCK_HOOK_COMMAND.test(hook.command ?? ''))
  return blocksOnFailure ? [] : [MISSING_BASH_BLOCK_HOOK]
}
