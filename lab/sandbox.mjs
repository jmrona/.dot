import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const COPIED_HARNESS_ENTRIES = ['rules', 'skills']

export function createSandbox({ harnessDir, targetDir }) {
  const claudeDir = path.join(targetDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  for (const entry of COPIED_HARNESS_ENTRIES) {
    fs.cpSync(path.join(harnessDir, entry), path.join(claudeDir, entry), { recursive: true })
  }
  writeDenyOnlySettings({ harnessDir, claudeDir })
}

function readDenyList(harnessDir) {
  const settingsPath = path.join(harnessDir, 'settings.json')
  if (!fs.existsSync(settingsPath)) return []
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8')).permissions?.deny ?? []
}

function writeDenyOnlySettings({ harnessDir, claudeDir }) {
  const settings = { permissions: { deny: readDenyList(harnessDir) } }
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`)
}

export function buildClaudeArgs({ prompt, model, tools = ['Read'], maxTurns = 8 }) {
  return [
    '-p', prompt,
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--max-turns', String(maxTurns),
    '--allowedTools', tools.join(','),
  ]
}

export function buildClaudeEnv(env) {
  const { CLAUDECODE: _nestingMarker, ...remaining } = env
  return { ...remaining, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' }
}

function parseJsonLines(output) {
  return output.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

function describeSpawnFailure(error) {
  return new Error(
    `Could not start the claude command (${error.message}). ` +
      'Install Claude Code and make sure that claude is on your PATH.',
  )
}

function killProcessGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  child.stdout.destroy()
}

export function runSandboxed({ cwd, prompt, model, tools, maxTurns, timeoutMs = 300000 }) {
  return new Promise((resolve, reject) => {
    const args = buildClaudeArgs({ prompt, model, tools, maxTurns })
    const child = spawn('claude', args, {
      cwd,
      env: buildClaudeEnv(process.env),
      stdio: ['ignore', 'pipe', 'inherit'],
      detached: true,
    })
    let output = ''
    let settled = false
    const settle = (finish) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      finish()
    }
    const timer = setTimeout(() => {
      killProcessGroup(child)
      settle(() => resolve({ exitCode: null, timedOut: true, events: parseJsonLines(output) }))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', (error) => settle(() => reject(describeSpawnFailure(error))))
    child.on('close', (exitCode) =>
      settle(() => resolve({ exitCode, timedOut: false, events: parseJsonLines(output) })),
    )
  })
}
