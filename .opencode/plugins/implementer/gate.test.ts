import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { OUTPUT_TAIL_LINES, runGate, type GateInput } from './gate.ts'

let directory = ''
let scratch = ''
let baseSha = ''

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
}

function input(overrides: Partial<GateInput> = {}): GateInput {
  return { directory, baseSha, proofCommands: ['true'], proofTimeoutSeconds: 5, attributablePaths: [], ...overrides }
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gate-repo-'))
  scratch = mkdtempSync(join(tmpdir(), 'gate-scratch-'))
  git('init', '-q')
  git('config', 'user.name', 'Gate Test')
  git('config', 'user.email', 'gate@example.com')
  writeFileSync(join(directory, 'tracked.txt'), 'one\n')
  git('add', '.')
  git('commit', '-q', '-m', 'initial')
  baseSha = git('rev-parse', 'HEAD')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

test('runs every proof command in order even after an earlier one fails', async () => {
  const result = await runGate(input({ proofCommands: ['false', 'true', 'exit 3'] }))
  assert.deepEqual(result.commands.map((entry) => entry.exitCode), [1, 0, 3])
  assert.deepEqual(result.commands.map((entry) => entry.command), ['false', 'true', 'exit 3'])
})

test('runs proof commands inside the given directory', async () => {
  const result = await runGate(input({ proofCommands: ['pwd -P'] }))
  assert.equal(result.commands[0]?.outputTail.trim(), execFileSync('pwd', ['-P'], { cwd: directory, encoding: 'utf8' }).trim())
})

test('keeps only the last lines of the combined output', async () => {
  const result = await runGate(input({ proofCommands: ['seq 1 100'] }))
  const lines = result.commands[0]?.outputTail.split('\n').filter((line) => line !== '') ?? []
  assert.equal(lines.length, OUTPUT_TAIL_LINES)
  assert.equal(lines[0], '61')
  assert.equal(lines.at(-1), '100')
})

test('captures standard error in the output tail', async () => {
  const result = await runGate(input({ proofCommands: ['echo problem >&2'] }))
  assert.match(result.commands[0]?.outputTail ?? '', /problem/)
})

test('passes when every command exits zero and nothing is unattributed', async () => {
  const result = await runGate(input({ proofCommands: ['true', 'echo ok'] }))
  assert.equal(result.passed, true)
  assert.equal(result.headMoved, false)
  assert.equal(result.headSha, baseSha)
})

test('fails when any command exits non-zero', async () => {
  const result = await runGate(input({ proofCommands: ['true', 'false'] }))
  assert.equal(result.passed, false)
})

test('lists untracked files in subdirectories as unattributed bare paths', async () => {
  mkdirSync(join(directory, 'src', 'deep'), { recursive: true })
  writeFileSync(join(directory, 'src', 'deep', 'stray.ts'), 'x\n')
  const result = await runGate(input())
  assert.deepEqual(result.unattributed, ['src/deep/stray.ts'])
  assert.equal(result.passed, false)
})

test('does not list attributable paths as unattributed', async () => {
  writeFileSync(join(directory, 'tracked.txt'), 'two\n')
  const result = await runGate(input({ attributablePaths: ['tracked.txt'] }))
  assert.deepEqual(result.changedPaths, ['tracked.txt'])
  assert.deepEqual(result.unattributed, [])
  assert.equal(result.passed, true)
})

test('reports the new path of a rename', async () => {
  git('mv', 'tracked.txt', 'renamed.txt')
  const result = await runGate(input())
  assert.deepEqual(result.unattributed, ['renamed.txt'])
})

test('marks the head as moved and fails when HEAD differs from the base', async () => {
  writeFileSync(join(directory, 'tracked.txt'), 'two\n')
  git('commit', '-q', '-am', 'second')
  const result = await runGate(input())
  assert.equal(result.headMoved, true)
  assert.equal(result.headSha, git('rev-parse', 'HEAD'))
  assert.equal(result.passed, false)
})

test('records an environment timeout after a command times out twice', async () => {
  const result = await runGate(input({ proofCommands: ['echo started; sleep 2'], proofTimeoutSeconds: 0.2 }))
  const entry = result.commands[0]
  assert.equal(entry?.exitCode, null)
  assert.equal(entry?.reason, 'environment-timeout')
  assert.match(entry?.outputTail ?? '', /started/)
  assert.equal(result.passed, false)
})

test('uses the second run when a command times out once and then succeeds', async () => {
  const marker = join(scratch, 'ran-once')
  const command = `if [ -f ${marker} ]; then exit 0; fi; touch ${marker}; sleep 2`
  const result = await runGate(input({ proofCommands: [command], proofTimeoutSeconds: 0.3 }))
  assert.equal(result.commands[0]?.exitCode, 0)
  assert.equal(result.commands[0]?.reason, undefined)
  assert.equal(result.passed, true)
})
