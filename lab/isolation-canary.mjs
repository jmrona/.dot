import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, runSandboxed } from './sandbox.mjs'

const LAB_CANARY = 'LAB-CANARY-5521'
const LIVE_CANARY = '`t.Helper()` in test helper functions'
const CANARY_PROMPT =
  'Use the Read tool on src/widget_test.go. Then list every string starting "Canary code:" ' +
  'in your context, verbatim. Do nothing else.'

function findInitEvent(events) {
  return events.find((event) => event.type === 'system' && event.subtype === 'init')
}

function namesLeakedFrom(initEvent, key, liveSkillNames) {
  return (initEvent[key] ?? []).filter((name) => liveSkillNames.includes(name))
}

function describeInitFailures(initEvent, liveSkillNames) {
  const failures = []
  if ((initEvent.mcp_servers ?? []).length > 0) failures.push('mcp_servers is not empty')
  const loadedPlugins = (initEvent.plugins ?? []).filter((plugin) => plugin.path !== 'builtin')
  if (loadedPlugins.length > 0) {
    failures.push(`plugins lists non-builtin plugins: ${loadedPlugins.map((plugin) => plugin.name).join(', ')}`)
  }
  for (const key of ['skills', 'slash_commands']) {
    for (const name of namesLeakedFrom(initEvent, key, liveSkillNames)) {
      failures.push(`${key} lists the live skill ${name}`)
    }
  }
  return failures
}

export function assessIsolation({
  events,
  transcript,
  labCanary,
  liveCanary,
  liveSkillNames,
  exitCode,
  sessionTranscriptFound,
}) {
  const failures = []
  if (exitCode !== 0) failures.push(`claude exited with exit code ${exitCode}`)
  if (!sessionTranscriptFound) failures.push('the session transcript was not found')
  if (!transcript.includes(labCanary)) failures.push(`lab canary ${labCanary} is missing`)
  if (transcript.includes(liveCanary)) failures.push(`live canary leaked: ${liveCanary}`)
  const initEvent = findInitEvent(events)
  if (initEvent) failures.push(...describeInitFailures(initEvent, liveSkillNames))
  else failures.push('the system init event is missing')
  return { isolated: failures.length === 0, failures }
}

export function findLiveSkillNames({ labSkillsDir, liveSkillsDir }) {
  const labSkills = new Set(fs.readdirSync(labSkillsDir))
  return fs
    .readdirSync(liveSkillsDir)
    .filter((name) => !name.startsWith('.') && name !== 'synced' && !labSkills.has(name))
}

function findSessionTranscriptPath(sessionId) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!sessionId || !fs.existsSync(projectsDir)) return undefined
  return fs
    .readdirSync(projectsDir)
    .map((project) => path.join(projectsDir, project, `${sessionId}.jsonl`))
    .find((candidate) => fs.existsSync(candidate))
}

function prepareProject(harnessDir, projectDir) {
  createSandbox({ harnessDir, targetDir: projectDir })
  const rulesDir = path.join(projectDir, '.claude', 'rules')
  fs.rmSync(path.join(rulesDir, 'go'), { recursive: true, force: true })
  fs.writeFileSync(path.join(rulesDir, 'zz-lab-canary.md'), `Canary code: ${LAB_CANARY}\n`)
  fs.mkdirSync(path.join(projectDir, 'src'))
  fs.writeFileSync(path.join(projectDir, 'src', 'widget_test.go'), 'package widget\n')
  execFileSync('git', ['init', '-q'], { cwd: projectDir })
}

function reportOutcome({ result, projectDir, initEvent }) {
  console.log(result.isolated ? '[PASS] isolated' : '[FAIL]')
  for (const failure of result.failures) console.log(`  ${failure}`)
  console.log(`Temporary directory: ${projectDir}`)
  console.log(`Claude Code version: ${initEvent?.claude_code_version ?? 'unknown'}`)
}

async function runCanary(model) {
  const harnessDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude')
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lab-canary-'))
  let isolated = false
  try {
    prepareProject(harnessDir, projectDir)
    const { exitCode, events } = await runSandboxed({ cwd: projectDir, prompt: CANARY_PROMPT, model })
    const initEvent = findInitEvent(events)
    const sessionTranscriptPath = findSessionTranscriptPath(initEvent?.session_id)
    const sessionTranscript = sessionTranscriptPath ? fs.readFileSync(sessionTranscriptPath, 'utf8') : ''
    const transcript = JSON.stringify(events) + sessionTranscript
    const result = assessIsolation({
      events,
      transcript,
      exitCode,
      sessionTranscriptFound: Boolean(sessionTranscriptPath),
      labCanary: LAB_CANARY,
      liveCanary: LIVE_CANARY,
      liveSkillNames: findLiveSkillNames({
        labSkillsDir: path.join(harnessDir, 'skills'),
        liveSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
      }),
    })
    reportOutcome({ result, projectDir, initEvent })
    isolated = result.isolated
  } finally {
    if (isolated) fs.rmSync(projectDir, { recursive: true, force: true })
  }
  return isolated
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)

if (isMainModule) {
  runCanary(process.argv[2] ?? 'haiku').then(
    (isolated) => process.exit(isolated ? 0 : 1),
    (error) => {
      console.error(`[FAIL] ${error.message}`)
      process.exit(1)
    },
  )
}
