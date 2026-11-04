import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { isEmberRemote } from './ember-detection'
import { describeForeignMounts } from './warning-text'
import { parseWhichOutput } from './which-output'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const ROOT = '/home/dev/app-worktrees/FEAT-2'
const CWD = `${ROOT}/platform`
const ENGINE_RESULT = 'engine answer'
const MAIN = '/home/dev/app'
const REMOTE_SETTING = 'gitlab.example.com/acme/app'
const WITH_REMOTE_SETTING = { options: { emberRemote: REMOTE_SETTING } }
const EMBER_REMOTE = 'https://gitlab.example.com/acme/app.git'

const SAMPLE = `infrastructure/docker/worktree.sh which
api         FEAT-1                    ${MAIN}
platform    not running
governor    FEAT-1                    ${MAIN}
pods        FEAT-1                    ${MAIN}
`

const MATCHING = SAMPLE.replaceAll(MAIN, ROOT)

const BAND = {
  plugin: 'ember-stack',
  component: 'AbovePrompt',
  requestId: 'ember-stack',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type Setup = {
  remote?: string | null
  which?: { exitCode: number; stdout: string } | 'rejects'
  topLevel?: { exitCode: number; stdout: string }
  repo?: 'rejects'
}

const FINISHED = { stderr: 'boom', isStdoutTruncated: false, isStderrTruncated: false }

function stubWorld(
  on: On,
  {
    remote = EMBER_REMOTE,
    which = { exitCode: 0, stdout: SAMPLE },
    topLevel = { exitCode: 0, stdout: `${ROOT}\n` },
    repo,
  }: Setup,
) {
  const runs: { argv: readonly string[]; cwd: string | undefined }[] = []
  const logs: string[] = []
  on('session.repo', () =>
    repo === 'rejects'
      ? { deny: 'repository lookup failed' }
      : { value: remote === null ? null : { root: MAIN, remote, internal: false, name: 'ember' } },
  )
  on('session.cwd', () => ({ value: CWD }))
  on('command.register', () => ({ value: { command: 'stack' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { text: ENGINE_RESULT } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('ui.log', (_, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    if (e.argv[0] === 'git') {
      return { value: { ...FINISHED, ...topLevel } }
    }
    if (which === 'rejects') {
      return { deny: 'just is not installed' }
    }

    return { value: { ...FINISHED, ...which } }
  })

  return { runs, logs }
}

async function startSession($: Engine) {
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
}

function whichRuns(runs: { argv: readonly string[] }[]) {
  return runs.filter(run => run.argv[0] === 'just').length
}

test('the which output yields the three running services and skips the stopped one', () => {
  const services = parseWhichOutput(SAMPLE).map(mount => mount.service)
  expect(services).toEqual(['api', 'governor', 'pods'])
})

test('a line without an absolute path is skipped', () => {
  expect(parseWhichOutput('api FEAT-3 relative/path\n')).toEqual([])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band names the services, path and branch of a foreign mount on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, {})
    await startSession($)
    const ui = await $.ui.mount({ ...BAND, surface })
    const line = await ui.find({ type: 'Text', text: /montan/ })
    expect(line?.text).toBe(`Stack: api, governor, pods montan ${MAIN} (FEAT-1). Esta sesión está en ${ROOT}.`)
    await ui.unmount()
  })

  test(`the band draws nothing when every service mounts this worktree on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { which: { exitCode: 0, stdout: MATCHING } })
    await startSession($)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Stack/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`the band draws nothing and logs when the command fails on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const { logs } = stubWorld(on, { which: { exitCode: 1, stdout: SAMPLE } })
    await startSession($)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Stack/ })).toBeUndefined()
    expect(logs.join('\n')).toContain('ember-stack: could not read the stack')
    await ui.unmount()
  })
}

test('the band draws nothing and logs when the command rejects', WITH_REMOTE_SETTING, async ($, on) => {
  const { logs } = stubWorld(on, { which: 'rejects' })
  await startSession($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Stack/ })).toBeUndefined()
  expect(logs.join('\n')).toContain('just is not installed')
  await ui.unmount()
})

test('a Bash call that mentions docker refreshes the stack', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, {})
  await startSession($)
  const before = whichRuns(runs)
  await $.tool.call({ tool: 'Bash', command: 'docker compose ps' })
  expect(whichRuns(runs)).toBe(before + 1)
})

test('a Bash call that does not mention docker leaves the stack alone', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, {})
  await startSession($)
  const before = whichRuns(runs)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(whichRuns(runs)).toBe(before)
})

test('the stack command refreshes the stack and answers', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, {})
  await startSession($)
  const before = whichRuns(runs)
  const answer = await $.command.run({
    command: 'stack',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(whichRuns(runs)).toBe(before + 1)
  expect(JSON.stringify(answer)).toContain('Stack refreshed.')
})

test('a repository that is not Ember runs nothing', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, { remote: 'https://github.com/other/repo.git' })
  await startSession($)
  await $.tool.call({ tool: 'Bash', command: 'docker ps' })
  expect(runs).toEqual([])
})

test('a repository without a remote runs nothing', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, { remote: null })
  await startSession($)
  expect(runs).toEqual([])
})

test('two different mount paths give one sentence per path and the advice once at the end', () => {
  const lines = describeForeignMounts(
    [
      { service: 'api', branch: 'A-1', path: '/work/a' },
      { service: 'pods', branch: 'B-2', path: '/work/b' },
    ],
    '/work/here',
  )
  expect(lines).toEqual([
    'Stack: api montan /work/a (A-1). Esta sesión está en /work/here.',
    'Stack: pods montan /work/b (B-2). Esta sesión está en /work/here.',
    'No pruebes en el navegador ni con docker compose exec.',
  ])
})

test('one path mounted on different branches gives one sentence per branch', () => {
  const lines = describeForeignMounts(
    [
      { service: 'api', branch: 'A-1', path: '/work/a' },
      { service: 'pods', branch: 'B-2', path: '/work/a' },
    ],
    '/work/here',
  )
  expect(lines.filter(line => line.startsWith('Stack:'))).toEqual([
    'Stack: api montan /work/a (A-1). Esta sesión está en /work/here.',
    'Stack: pods montan /work/a (B-2). Esta sesión está en /work/here.',
  ])
})

test('an SSH remote of the Ember repository is Ember', () => {
  expect(isEmberRemote('git@gitlab.example.com:acme/app.git', REMOTE_SETTING)).toBe(true)
})

test('a remote on another host is not Ember', () => {
  expect(isEmberRemote('git@gitlab.other.example.org:acme/app.git', REMOTE_SETTING)).toBe(false)
})

test('a path with a trailing slash still matches the worktree root', () => {
  const lines = describeForeignMounts([{ service: 'api', branch: 'A-1', path: '/work/here/' }], '/work/here')
  expect(lines).toEqual([])
})

test('just docker which runs in the git top level, not the session directory', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs } = stubWorld(on, {})
  await startSession($)
  const whichRun = runs.find(run => run.argv[0] === 'just')
  expect(whichRun?.cwd).toBe(ROOT)
})

test('a Bash call that mentions docker returns the result of the call unchanged', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on, {})
  await startSession($)
  const answer = await $.tool.call({ tool: 'Bash', command: 'docker compose ps' })
  expect(answer.result).toEqual({ text: ENGINE_RESULT })
})

test('a failing git top level lookup logs and runs no just command', WITH_REMOTE_SETTING, async ($, on) => {
  const { runs, logs } = stubWorld(on, { topLevel: { exitCode: 128, stdout: '' } })
  await startSession($)
  expect(whichRuns(runs)).toBe(0)
  expect(logs.join('\n')).toContain('git rev-parse --show-toplevel exited with 128')
})

test('a failing git top level lookup draws no band', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on, { topLevel: { exitCode: 128, stdout: '' } })
  await startSession($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Stack/ })).toBeUndefined()
  await ui.unmount()
})

test('a rejected repository lookup logs instead of failing the session start', WITH_REMOTE_SETTING, async ($, on) => {
  const { logs } = stubWorld(on, { repo: 'rejects' })
  await startSession($)
  expect(logs.join('\n')).toContain('repository lookup failed')
})

test('a rejected repository lookup does not fail a Bash call', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on, { repo: 'rejects' })
  await startSession($)
  const answer = await $.tool.call({ tool: 'Bash', command: 'docker ps' })
  expect(answer.result).toEqual({ text: ENGINE_RESULT })
})

test('an unset emberRemote makes the mod inert', async ($, on) => {
  const { runs } = stubWorld(on, {})
  await startSession($)
  await $.tool.call({ tool: 'Bash', command: 'docker ps' })
  expect(runs).toEqual([])
})
