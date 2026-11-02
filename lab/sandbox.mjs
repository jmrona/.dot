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
}

export function buildClaudeArgs({ prompt, model }) {
  return [
    '-p', prompt,
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--max-turns', '8',
    '--allowedTools', 'Read',
  ]
}

export function buildClaudeEnv(env) {
  const { CLAUDECODE: _nestingMarker, ...remaining } = env
  return remaining
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

export function runSandboxed({ cwd, prompt, model }) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', buildClaudeArgs({ prompt, model }), {
      cwd,
      env: buildClaudeEnv(process.env),
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', (error) => reject(describeSpawnFailure(error)))
    child.on('close', (exitCode) => resolve({ exitCode, events: parseJsonLines(output) }))
  })
}
