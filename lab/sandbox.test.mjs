import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { assessIsolation, findLiveSkillNames } from './isolation-canary.mjs'
import { buildClaudeArgs, buildClaudeEnv, createSandbox, runSandboxed } from './sandbox.mjs'

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'))
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function makeHarness() {
  const harnessDir = makeTempDir()
  writeFile(path.join(harnessDir, 'rules/common/style.md'), 'rule')
  writeFile(path.join(harnessDir, 'skills/demo/SKILL.md'), 'skill')
  writeFile(path.join(harnessDir, 'settings.json'), '{}')
  writeFile(path.join(harnessDir, 'hooks/guard.sh'), 'hook')
  return harnessDir
}

function sandboxFromHarness() {
  const targetDir = makeTempDir()
  createSandbox({ harnessDir: makeHarness(), targetDir })
  return path.join(targetDir, '.claude')
}

const cleanInit = {
  type: 'system',
  subtype: 'init',
  mcp_servers: [],
  plugins: [],
  skills: ['demo'],
  slash_commands: ['demo'],
}

function cleanRun(overrides = {}) {
  return {
    events: [cleanInit],
    transcript: 'Canary code: LAB-CANARY-5521',
    labCanary: 'LAB-CANARY-5521',
    liveCanary: 'LIVE-ONLY-PHRASE',
    liveSkillNames: ['live-skill'],
    exitCode: 0,
    sessionTranscriptFound: true,
    ...overrides,
  }
}

function withInit(changes) {
  return { events: [{ ...cleanInit, ...changes }] }
}

test('createSandbox copies the rules directory', () => {
  const claudeDir = sandboxFromHarness()
  assert.equal(fs.readFileSync(path.join(claudeDir, 'rules/common/style.md'), 'utf8'), 'rule')
})

test('createSandbox copies the skills directory', () => {
  const claudeDir = sandboxFromHarness()
  assert.equal(fs.readFileSync(path.join(claudeDir, 'skills/demo/SKILL.md'), 'utf8'), 'skill')
})

test('createSandbox omits the hooks directory', () => {
  const claudeDir = sandboxFromHarness()
  assert.equal(fs.existsSync(path.join(claudeDir, 'hooks')), false)
})

test('buildClaudeArgs restricts setting sources to project', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'project')
})

test('buildClaudeArgs enables strict MCP configuration', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.ok(args.includes('--strict-mcp-config'))
})

test('buildClaudeArgs passes the model', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'sonnet' })
  assert.equal(args[args.indexOf('--model') + 1], 'sonnet')
})

test('buildClaudeArgs passes the prompt after the print flag', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.deepEqual(args.slice(0, 2), ['-p', 'hello'])
})

test('buildClaudeEnv drops CLAUDECODE', () => {
  const env = buildClaudeEnv({ CLAUDECODE: '1', HOME: '/home/someone' })
  assert.equal('CLAUDECODE' in env, false)
})

test('buildClaudeEnv keeps other variables', () => {
  const env = buildClaudeEnv({ CLAUDECODE: '1', HOME: '/home/someone' })
  assert.equal(env.HOME, '/home/someone')
})

test('buildClaudeEnv waits for background subagents by setting the ceiling to zero', () => {
  assert.equal(buildClaudeEnv({ HOME: '/home/someone' }).CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, '0')
})

test('buildClaudeEnv replaces a ceiling that the caller environment sets', () => {
  const env = buildClaudeEnv({ CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '5000' })
  assert.equal(env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, '0')
})

const LAB_GIT_GUARD_DIR = path.resolve(import.meta.dirname, '../.claude/mods/git-guard')

test('buildClaudeEnv replaces a plugin directory that the caller environment sets with the lab git-guard mod', () => {
  const env = buildClaudeEnv({ CLAUDE_CODE_PLUGIN_DIRS: '~/.claude/mods/git-guard:~/.claude/mods/waves' })
  assert.equal(env.CLAUDE_CODE_PLUGIN_DIRS, LAB_GIT_GUARD_DIR)
})

test('buildClaudeEnv sets the plugin directory to the lab git-guard mod when the caller sets none', () => {
  const env = buildClaudeEnv({ HOME: '/home/someone' })
  assert.equal(env.CLAUDE_CODE_PLUGIN_DIRS, LAB_GIT_GUARD_DIR)
})

test('assessIsolation passes on a clean run', () => {
  const result = assessIsolation(cleanRun())
  assert.deepEqual(result, { isolated: true, failures: [] })
})

test('assessIsolation fails when the lab canary is absent', () => {
  const result = assessIsolation(cleanRun({ transcript: 'nothing here' }))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /LAB-CANARY-5521/)
})

test('assessIsolation fails when the live canary is present', () => {
  const transcript = 'LAB-CANARY-5521 LIVE-ONLY-PHRASE'
  const result = assessIsolation(cleanRun({ transcript }))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /LIVE-ONLY-PHRASE/)
})

test('assessIsolation fails when the init event is absent', () => {
  const result = assessIsolation(cleanRun({ events: [] }))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /init/)
})

test('assessIsolation fails when MCP servers are loaded', () => {
  const result = assessIsolation(cleanRun(withInit({ mcp_servers: [{ name: 'github' }] })))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /mcp_servers/)
})

const builtinPlugin = {
  name: 'cc-plugin-telemetry',
  path: 'builtin',
  source: 'cc-plugin-telemetry@builtin',
}
const filesystemPlugin = {
  name: 'figma',
  path: '/home/someone/.claude/plugins/figma',
  source: 'figma@marketplace',
}

test('assessIsolation passes when only builtin plugins are loaded', () => {
  const result = assessIsolation(cleanRun(withInit({ plugins: [builtinPlugin] })))
  assert.deepEqual(result, { isolated: true, failures: [] })
})

test('assessIsolation fails when a plugin with a filesystem path is loaded', () => {
  const plugins = [builtinPlugin, filesystemPlugin]
  const result = assessIsolation(cleanRun(withInit({ plugins })))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /plugins.*figma/)
})

test('assessIsolation does not name builtin plugins in the failure', () => {
  const plugins = [builtinPlugin, filesystemPlugin]
  const result = assessIsolation(cleanRun(withInit({ plugins })))
  assert.doesNotMatch(result.failures.join('\n'), /cc-plugin-telemetry/)
})

test('assessIsolation fails when a live skill is listed', () => {
  const result = assessIsolation(cleanRun(withInit({ skills: ['demo', 'live-skill'] })))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /live-skill/)
})

test('assessIsolation fails when a live slash command is listed', () => {
  const result = assessIsolation(cleanRun(withInit({ slash_commands: ['live-skill'] })))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /live-skill/)
})

test('assessIsolation treats missing init arrays as empty', () => {
  const bareInit = { type: 'system', subtype: 'init' }
  const result = assessIsolation(cleanRun({ events: [bareInit] }))
  assert.deepEqual(result, { isolated: true, failures: [] })
})

test('assessIsolation fails when the session transcript was not found', () => {
  const result = assessIsolation(cleanRun({ sessionTranscriptFound: false }))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /session transcript/)
})

test('assessIsolation fails when claude exits with a non-zero code', () => {
  const result = assessIsolation(cleanRun({ exitCode: 2 }))
  assert.equal(result.isolated, false)
  assert.match(result.failures.join('\n'), /exit code 2/)
})

function makeSkillsDirectories() {
  const root = makeTempDir()
  const labSkillsDir = path.join(root, 'lab-skills')
  const liveSkillsDir = path.join(root, 'live-skills')
  fs.mkdirSync(labSkillsDir)
  fs.mkdirSync(liveSkillsDir)
  return { root, labSkillsDir, liveSkillsDir }
}

test('findLiveSkillNames excludes a lab skill that is a symbolic link', () => {
  const { root, labSkillsDir, liveSkillsDir } = makeSkillsDirectories()
  fs.mkdirSync(path.join(root, 'elsewhere'))
  fs.symlinkSync(path.join(root, 'elsewhere'), path.join(labSkillsDir, 'shared'))
  fs.mkdirSync(path.join(liveSkillsDir, 'shared'))
  assert.deepEqual(findLiveSkillNames({ labSkillsDir, liveSkillsDir }), [])
})

test('findLiveSkillNames lists skills that exist only in the live harness', () => {
  const { labSkillsDir, liveSkillsDir } = makeSkillsDirectories()
  fs.mkdirSync(path.join(liveSkillsDir, 'live-only'))
  assert.deepEqual(findLiveSkillNames({ labSkillsDir, liveSkillsDir }), ['live-only'])
})

test('findLiveSkillNames ignores hidden entries and synced', () => {
  const { labSkillsDir, liveSkillsDir } = makeSkillsDirectories()
  fs.mkdirSync(path.join(liveSkillsDir, '.hidden'))
  fs.mkdirSync(path.join(liveSkillsDir, 'synced'))
  assert.deepEqual(findLiveSkillNames({ labSkillsDir, liveSkillsDir }), [])
})

function installFakeClaude(scriptBody) {
  const binDir = makeTempDir()
  const executable = path.join(binDir, 'claude')
  fs.writeFileSync(executable, `#!/usr/bin/env node\n${scriptBody}\n`)
  fs.chmodSync(executable, 0o755)
  return binDir
}

function installShellClaude(scriptBody) {
  const binDir = makeTempDir()
  const executable = path.join(binDir, 'claude')
  fs.writeFileSync(executable, `#!/bin/sh\n${scriptBody}\n`)
  fs.chmodSync(executable, 0o755)
  return binDir
}

async function runWithPath(pathValue, options) {
  const originalPath = process.env.PATH
  process.env.PATH = pathValue
  try {
    return await runSandboxed({ cwd: makeTempDir(), prompt: 'hello', model: 'haiku', ...options })
  } finally {
    process.env.PATH = originalPath
  }
}

function runFakeClaude(scriptBody) {
  const binDir = installFakeClaude(scriptBody)
  return runWithPath(`${binDir}${path.delimiter}${process.env.PATH}`)
}

test('runSandboxed parses each JSON line into an event', async () => {
  const { events } = await runFakeClaude(
    `console.log(JSON.stringify({ type: 'a' })); console.log(JSON.stringify({ type: 'b' }))`,
  )
  assert.deepEqual(events, [{ type: 'a' }, { type: 'b' }])
})

test('runSandboxed skips lines that are not JSON', async () => {
  const { events } = await runFakeClaude(
    `console.log('warning'); console.log(JSON.stringify({ type: 'a' }))`,
  )
  assert.deepEqual(events, [{ type: 'a' }])
})

test('runSandboxed resolves with the exit code of claude', async () => {
  const { exitCode } = await runFakeClaude('process.exit(3)')
  assert.equal(exitCode, 3)
})

test('runSandboxed decodes a multi-byte character split across chunks', async () => {
  const { events } = await runFakeClaude(
    `const line = Buffer.from(JSON.stringify({ text: 'caf\\u00e9' }) + '\\n', 'utf8')
const split = line.indexOf(0xc3) + 1
process.stdout.write(line.subarray(0, split))
setTimeout(() => process.stdout.write(line.subarray(split)), 100)`,
  )
  assert.deepEqual(events, [{ text: 'caf\u00e9' }])
})

test('runSandboxed rejects with an actionable error when claude cannot be spawned', async () => {
  await assert.rejects(runWithPath(makeTempDir()), /claude.*PATH/s)
})

test('buildClaudeArgs requests stream-json output', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.equal(args[args.indexOf('--output-format') + 1], 'stream-json')
})

test('buildClaudeArgs enables verbose output', () => {
  assert.ok(buildClaudeArgs({ prompt: 'hello', model: 'haiku' }).includes('--verbose'))
})

test('buildClaudeArgs includes partial messages', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.ok(args.includes('--include-partial-messages'))
})

test('buildClaudeArgs limits the run to eight turns', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.equal(args[args.indexOf('--max-turns') + 1], '8')
})

test('buildClaudeArgs allows only the Read tool', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku' })
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'Read')
})

test('buildClaudeArgs joins the requested tools with commas', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku', tools: ['Read', 'Write'] })
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'Read,Write')
})

test('buildClaudeArgs passes the requested maximum turns as a string', () => {
  const args = buildClaudeArgs({ prompt: 'hello', model: 'haiku', maxTurns: 3 })
  assert.equal(args[args.indexOf('--max-turns') + 1], '3')
})

test('runSandboxed reports timedOut false when claude finishes in time', async () => {
  const { timedOut } = await runFakeClaude('process.exit(0)')
  assert.equal(timedOut, false)
})

test('runSandboxed reports a timeout with no exit code when claude runs too long', async () => {
  const binDir = installShellClaude('sleep 60')
  const { exitCode, timedOut } = await runWithPath(`${binDir}${path.delimiter}${process.env.PATH}`, {
    timeoutMs: 500,
  })
  assert.deepEqual({ exitCode, timedOut }, { exitCode: null, timedOut: true })
})

test('runSandboxed keeps the events that claude wrote before the timeout', async () => {
  const binDir = installShellClaude(`echo '{"type":"a"}'\nsleep 60`)
  const { events } = await runWithPath(`${binDir}${path.delimiter}${process.env.PATH}`, {
    timeoutMs: 3000,
  })
  assert.deepEqual(events, [{ type: 'a' }])
})

function sandboxWithSettings(settings) {
  const harnessDir = makeHarness()
  writeFile(path.join(harnessDir, 'settings.json'), JSON.stringify(settings))
  const targetDir = makeTempDir()
  createSandbox({ harnessDir, targetDir })
  return path.join(targetDir, '.claude', 'settings.json')
}

test('createSandbox writes only the permission deny list into settings.json', () => {
  const settingsPath = sandboxWithSettings({
    permissions: { deny: ['Read(.env)'], defaultMode: 'bypassPermissions', allow: ['Bash'] },
    hooks: { Stop: [] },
    enabledPlugins: { figma: true },
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), {
    permissions: { deny: ['Read(.env)'] },
  })
})

test('createSandbox writes an empty deny list when the harness has no settings.json', () => {
  const harnessDir = makeHarness()
  fs.rmSync(path.join(harnessDir, 'settings.json'))
  const targetDir = makeTempDir()
  createSandbox({ harnessDir, targetDir })
  const written = fs.readFileSync(path.join(targetDir, '.claude', 'settings.json'), 'utf8')
  assert.deepEqual(JSON.parse(written), { permissions: { deny: [] } })
})

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntilDead(pid) {
  for (let attempt = 0; attempt < 20 && isProcessAlive(pid); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return !isProcessAlive(pid)
}

test('runSandboxed on timeout kills a grandchild that holds the output pipe', async () => {
  const pidFile = path.join(makeTempDir(), 'grandchild.pid')
  const binDir = installShellClaude(`sleep 60 &\necho $! > ${pidFile}\nsleep 60`)
  try {
    const startedAt = Date.now()
    const result = await runWithPath(`${binDir}${path.delimiter}${process.env.PATH}`, {
      timeoutMs: 2000,
    })
    assert.ok(Date.now() - startedAt < 20000, 'timeout did not resolve while a grandchild held the pipe')
    assert.equal(result.timedOut, true)
    assert.equal(await waitUntilDead(Number(fs.readFileSync(pidFile, 'utf8'))), true)
  } finally {
    if (fs.existsSync(pidFile)) {
      try {
        process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL')
      } catch {}
    }
  }
})

const STOP_AFTER_FIRST_EVENT = (events) => events.length > 0

test('runSandboxed stops claude once the stopWhen predicate accepts the events', async () => {
  const binDir = installShellClaude(`echo '{"type":"a"}'\nsleep 60`)
  const { events, stoppedEarly, timedOut } = await runWithPath(
    `${binDir}${path.delimiter}${process.env.PATH}`,
    { timeoutMs: 3000, stopWhen: STOP_AFTER_FIRST_EVENT },
  )
  assert.deepEqual({ events, stoppedEarly, timedOut }, {
    events: [{ type: 'a' }],
    stoppedEarly: true,
    timedOut: false,
  })
})

test('runSandboxed reports stoppedEarly false when no stopWhen predicate is given', async () => {
  const { stoppedEarly } = await runFakeClaude('process.exit(0)')
  assert.equal(stoppedEarly, false)
})

test('runSandboxed lets claude finish when the stopWhen predicate never accepts', async () => {
  const { exitCode, stoppedEarly } = await runWithPath(
    `${installFakeClaude('process.exit(4)')}${path.delimiter}${process.env.PATH}`,
    { stopWhen: () => false },
  )
  assert.deepEqual({ exitCode, stoppedEarly }, { exitCode: 4, stoppedEarly: false })
})

test('runSandboxed rejects and kills claude when the stopWhen predicate throws', async () => {
  const pidFile = path.join(makeTempDir(), 'pid')
  const binDir = installShellClaude(`echo $$ > ${pidFile}\necho '{"type":"a"}'\nsleep 60`)
  const failing = () => {
    throw new Error('predicate broke')
  }
  await assert.rejects(
    runWithPath(`${binDir}${path.delimiter}${process.env.PATH}`, { timeoutMs: 3000, stopWhen: failing }),
    /predicate broke/,
  )
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})
