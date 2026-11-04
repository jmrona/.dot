import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const ROOT = '/home/dev/app'
const REMOTE_SETTING = 'gitlab.example.com/acme/app'
const WITH_REMOTE_SETTING = { options: { emberRemote: REMOTE_SETTING } }
const EMBER_REMOTE = 'https://gitlab.example.com/acme/app.git'
const MORNING = new Date(2026, 0, 5, 10, 42).getTime()
const MINUTE = 60_000

const PANE = {
  plugin: 'ember-verification',
  component: 'Pane',
  requestId: 'verification',
  props: {
    title: 'Verification',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type EngineResult = { isError?: true } | { deny: string } | { result: { backgroundTaskId: string } }

type Setup = {
  remote?: string | null
  branch?: string
  failingGit?: 'root' | 'branch'
  throwingGit?: 'root'
  engineResult?: EngineResult
}

const FINISHED = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

function stubWorld(on: On, { remote = EMBER_REMOTE, branch: initialBranch = 'FEAT-12-pane', failingGit, throwingGit }: Setup = {}) {
  const clock = mock.clock(on, { now: MORNING })
  const opened: string[] = []
  const closed: string[] = []
  const logged: string[] = []
  const gitRuns: string[] = []
  const checkout = { branch: initialBranch }
  const panes: { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[] = []
  const engine: { result: EngineResult; during?: () => Promise<void> } = { result: {} }
  on('session.repo', () => ({
    value: remote === null ? null : { root: ROOT, remote, internal: false, name: 'app' },
  }))
  on('session.cwd', () => ({ value: `${ROOT}/platform` }))
  on('command.register', () => ({ value: { command: 'verification' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', async () => {
    const during = engine.during
    engine.during = undefined
    await during?.()

    return 'deny' in engine.result ? engine.result : { result: {}, ...engine.result }
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    panes.splice(0, panes.length, ...panes.filter(pane => pane.id !== e.id))

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: panes }))
  on('ui.log', (_, e) => {
    logged.push(e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    gitRuns.push(e.argv.join(' '))
    const isRootLookup = e.argv.includes('--show-toplevel')
    if (throwingGit === 'root' && isRootLookup) {
      throw new Error('spawn git ENOENT')
    }
    const stdout = isRootLookup ? `${ROOT}\n` : `${checkout.branch}\n`
    const hasFailed = failingGit === (isRootLookup ? 'root' : 'branch')

    return { value: { ...FINISHED, exitCode: hasFailed ? 128 : 0, stdout } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return { clock, opened, closed, logged, gitRuns, checkout, engine }
}

async function startSession($: Engine) {
  await $.session.start({ cwd: `${ROOT}/platform`, surface: 'terminal', isInteractive: true })
}

async function editFile($: Engine, file_path: string) {
  await $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an edit under a pillar marks it as edited on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^platform/ })
    expect(row?.text).toContain('editado 10:42')
    await ui.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an edit outside every pillar marks nothing on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/docs/testing.md`)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /editado/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`a denied edit marks nothing on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    world.engine.result = { deny: 'blocked' }
    await startSession($)
    await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/api/app/User.php`, old_string: 'a', new_string: 'b' }).catch(() => undefined)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /editado/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`an edit that finished with an error marks nothing on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    world.engine.result = { isError: true }
    await startSession($)
    await editFile($, `${ROOT}/api/app/User.php`)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /editado/ })).toBeUndefined()
    await ui.unmount()
  })
}

function runVerificationCommand($: Engine) {
  return $.command.run({
    command: 'verification',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

async function runCommand($: Engine, command: string) {
  await $.tool.call({ tool: 'Bash', command })
}

async function platformRow($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...PANE, surface })
  const row = await ui.find({ type: 'Text', text: /^platform/ })
  await ui.unmount()

  return row?.text
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a check run after an edit shows as fresh and passing on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just platform check')
    expect(await platformRow($, surface)).toContain('check OK 10:43')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a check run launched in the background records no outcome on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    world.engine.result = { result: { backgroundTaskId: 'task-1' } }
    await runCommand($, 'just platform check')
    expect(await platformRow($, surface)).toContain('check --')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a test run that finished with an error shows FAIL on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    world.engine.result = { isError: true }
    await runCommand($, 'just platform test')
    expect(await platformRow($, surface)).toContain('test FAIL 10:43')
  })

  test(`a run made before the latest edit shows as obsolete on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just platform check')
    await world.clock.advance(MINUTE)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await platformRow($, surface)).toContain('check obsoleto (OK 10:43)')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a test run limited to a path shows as partial on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just platform test src/app.test.tsx')
    expect(await platformRow($, surface)).toContain('test parcial (OK 10:43)')
  })

  test(`a test run with a filter shows as partial on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/app/User.php`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just api test --filter=UserTest')
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^api/ })
    await ui.unmount()
    expect(row?.text).toContain('test parcial (OK 10:43)')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a partial test run after a full one leaves the full run fresh on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/app/User.php`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just api test')
    await world.clock.advance(MINUTE)
    await runCommand($, 'just api test --filter=UserTest')
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^api/ })
    await ui.unmount()
    expect(row?.text).toContain('test OK 10:43')
  })

  test(`just test without a pillar counts for every edited pillar on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await editFile($, `${ROOT}/api/app/User.php`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just test')
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = [await ui.find({ type: 'Text', text: /^api/ }), await ui.find({ type: 'Text', text: /^platform/ })]
    await ui.unmount()
    expect(rows.map(row => row?.text.includes('test OK 10:43'))).toEqual([true, true])
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`just proto lint counts as the proto check on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/proto/slices/accounts/v1/types.proto`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just proto lint')
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^proto/ })
    await ui.unmount()
    expect(row?.text).toContain('check OK 10:43')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an edit path with dot segments marks the pillar it resolves to on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/../platform/./src/app.tsx`)
    expect(await platformRow($, surface)).toContain('editado 10:42')
  })

  test(`an edit path with a current directory segment marks the pillar on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/./platform/src/app.tsx`)
    expect(await platformRow($, surface)).toContain('editado 10:42')
  })

  test(`an edit path with dot segments does not mark the pillar it started in on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/../platform/src/app.tsx`)
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^api/ })
    await ui.unmount()
    expect(row).toBeUndefined()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`lint of a pillar other than proto does not count as its check on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just platform lint')
    expect(await platformRow($, surface)).toContain('check --')
  })

  test(`a check run behind a prefix is recorded on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'cd /home/dev/app && sudo FOO=1 just platform check')
    expect(await platformRow($, surface)).toContain('check OK 10:43')
  })

  test(`a test run and a check run on separate lines are both recorded on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    await world.clock.advance(MINUTE)
    await runCommand($, 'just platform test\njust platform check')
    const row = await platformRow($, surface)
    expect([row?.includes('test OK 10:43'), row?.includes('check OK 10:43')]).toEqual([true, true])
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const redirection of ['> out.txt', '2> err.txt', '>> out.txt', '>out.txt']) {
    test(`a full test run with the redirection ${redirection} is recorded as full on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
      const world = stubWorld(on)
      await startSession($)
      await editFile($, `${ROOT}/api/app/User.php`)
      await world.clock.advance(MINUTE)
      await runCommand($, `just api test ${redirection}`)
      const ui = await $.ui.mount({ ...PANE, surface })
      const row = await ui.find({ type: 'Text', text: /^api/ })
      await ui.unmount()
      expect(row?.text).toContain('test OK 10:43')
    })
  }
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const [pillar, recipe, kind] of [
    ['api', 'check-foo', 'check'],
    ['platform', 'test-watch', 'test'],
  ] as const) {
    test(`just ${pillar} ${recipe} does not count as a ${kind} run on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
      const world = stubWorld(on)
      await startSession($)
      await editFile($, `${ROOT}/${pillar}/src/file.ts`)
      await world.clock.advance(MINUTE)
      await runCommand($, `just ${pillar} ${recipe}`)
      const ui = await $.ui.mount({ ...PANE, surface })
      const row = await ui.find({ type: 'Text', text: new RegExp(`^${pillar}`) })
      await ui.unmount()
      expect(row?.text).toContain(`${kind} --`)
    })
  }
}

async function evalsRow($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...PANE, surface })
  const row = await ui.find({ type: 'Text', text: /^evals/ })
  await ui.unmount()

  return row?.text
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an edit under the Assistant slice adds the pending evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/app/Slices/Assistant/Agents/Chat.php`)
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a full evals run that finished without error clears the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    await runCommand($, 'just api evals')
    expect(await evalsRow($, surface)).toBeUndefined()
  })

  test(`just api evals-watch does not clear the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    await runCommand($, 'just api evals-watch')
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })

  test(`a filtered evals run leaves the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    await runCommand($, 'just api evals --filter=Lookup')
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })

  test(`an evals edit made while a full evals run is in flight leaves the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    await world.clock.advance(MINUTE)
    world.engine.during = async () => {
      await world.clock.advance(MINUTE)
      await editFile($, `${ROOT}/api/app/Slices/Assistant/Agents/Chat.php`)
    }
    await runCommand($, 'just api evals')
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })

  test(`a full evals run launched in the background leaves the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    world.engine.result = { result: { backgroundTaskId: 'task-2' } }
    await runCommand($, 'just api evals')
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })

  test(`a full evals run that finished with an error leaves the evals row on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/api/tests/Evals/AssistantToolRoutingLookupTest.php`)
    world.engine.result = { isError: true }
    await runCommand($, 'just api evals')
    expect(await evalsRow($, surface)).toBe('evals     pendiente')
  })
}

async function headerText($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...PANE, surface })
  const header = await ui.find({ type: 'Text', text: /rama/ })
  await ui.unmount()

  return header?.text
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the header shows the ticket key and the branch on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { branch: 'FEAT-12-pane' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await headerText($, surface)).toBe('FEAT-12  (rama FEAT-12-pane)')
  })

  test(`the header shows the branch alone when it carries no ticket key on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { branch: 'ai-audit' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await headerText($, surface)).toBe('rama ai-audit')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a git failure on the root lookup records no edit on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { failingGit: 'root' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await platformRow($, surface)).toBeUndefined()
  })

  test(`a git failure on the root lookup logs what failed on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on, { failingGit: 'root' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(world.logged.some(line => line.startsWith('`git rev-parse --show-toplevel` exited with 128'))).toBe(true)
  })

  test(`a git command that throws on the root lookup records no edit on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { throwingGit: 'root' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await platformRow($, surface)).toBeUndefined()
  })

  test(`a git command that throws on the root lookup logs that it could not run on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on, { throwingGit: 'root' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(world.logged.some(line => line.startsWith('`git rev-parse --show-toplevel` could not run'))).toBe(true)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`rendering the pane runs no git command on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on)
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    const runsBeforeRender = world.gitRuns.length
    await headerText($, surface)
    expect(world.gitRuns.length).toBe(runsBeforeRender)
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the header shows the branch before any edit on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { branch: 'FEAT-12-pane' })
    await startSession($)
    expect(await headerText($, surface)).toBe('FEAT-12  (rama FEAT-12-pane)')
  })

  test(`the header follows a branch switch after the next edit on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on, { branch: 'FEAT-12-pane' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    world.checkout.branch = 'FEAT-13-list'
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await headerText($, surface)).toBe('FEAT-13  (rama FEAT-13-list)')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a git failure on the branch lookup draws no header on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { failingGit: 'branch' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await headerText($, surface)).toBeUndefined()
  })

  test(`a git failure on the branch lookup still draws the pillar rows on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on, { failingGit: 'branch' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(await platformRow($, surface)).toContain('editado 10:42')
  })

  test(`a git failure on the branch lookup logs what failed on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on, { failingGit: 'branch' })
    await startSession($)
    await editFile($, `${ROOT}/platform/src/app.tsx`)
    expect(world.logged.some(line => line.startsWith('`git branch --show-current` exited with 128'))).toBe(true)
  })
}

test('the pane opens on the first recorded edit', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on)
  await startSession($)
  await editFile($, `${ROOT}/platform/src/app.tsx`)
  expect(world.opened).toEqual(['verification'])
})

test('the pane does not open again on the second recorded edit', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on)
  await startSession($)
  await editFile($, `${ROOT}/platform/src/app.tsx`)
  await editFile($, `${ROOT}/api/app/User.php`)
  expect(world.opened).toEqual(['verification'])
})

test('the verification command opens the pane when it is closed', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on)
  await startSession($)
  await runVerificationCommand($)
  expect(world.opened).toEqual(['verification'])
})

test('the verification command reports that it opened the pane', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on)
  await startSession($)
  const answer = await runVerificationCommand($)
  expect(answer.text).toBe('Verification pane opened.')
})

test('the verification command closes the pane when it is open', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on)
  await startSession($)
  await runVerificationCommand($)
  await runVerificationCommand($)
  expect(world.closed).toEqual(['verification'])
})

test('the verification command reports that it closed the pane', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on)
  await startSession($)
  await runVerificationCommand($)
  const answer = await runVerificationCommand($)
  expect(answer.text).toBe('Verification pane closed.')
})

async function recordsNothingAfterEdit($: Engine, world: ReturnType<typeof stubWorld>) {
  await startSession($)
  await editFile($, `${ROOT}/platform/src/app.tsx`)
  await runCommand($, 'just platform check')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /editado/ })
  await ui.unmount()

  return { row, opened: world.opened }
}

test('a repository with another remote records nothing and never opens the pane', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on, { remote: 'git@gitlab.example.com:other/project.git' })
  const outcome = await recordsNothingAfterEdit($, world)
  expect(outcome.row).toBeUndefined()
  expect(outcome.opened).toEqual([])
})

test('a repository without a remote records nothing and never opens the pane', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on, { remote: null })
  const outcome = await recordsNothingAfterEdit($, world)
  expect(outcome.row).toBeUndefined()
  expect(outcome.opened).toEqual([])
})

test('an unset emberRemote makes the mod record nothing and never open the pane', async ($, on) => {
  const world = stubWorld(on)
  const outcome = await recordsNothingAfterEdit($, world)
  expect(outcome.row).toBeUndefined()
  expect(outcome.opened).toEqual([])
})

test('an ssh style remote matches the configured Ember remote', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on, { remote: 'git@gitlab.example.com:acme/app.git' })
  const outcome = await recordsNothingAfterEdit($, world)
  expect(outcome.row?.text).toMatch(/^platform\s+editado 10:42\s+check OK 10:42/)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the header follows a branch switch after the verification command on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    const world = stubWorld(on, { branch: 'FEAT-12-pane' })
    await startSession($)
    world.checkout.branch = 'FEAT-13-list'
    await runVerificationCommand($)
    expect(await headerText($, surface)).toBe('FEAT-13  (rama FEAT-13-list)')
  })
}

test('the verification command opens no pane outside Ember', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on, { remote: 'git@gitlab.example.com:other/project.git' })
  await startSession($)
  await runVerificationCommand($)
  expect(world.opened).toEqual([])
})

test('the verification command explains outside Ember that it works only in Ember', WITH_REMOTE_SETTING, async ($, on) => {
  stubWorld(on, { remote: 'git@gitlab.example.com:other/project.git' })
  await startSession($)
  const answer = await runVerificationCommand($)
  expect(answer.text).toBe('The verification pane works only in Ember sessions.')
})

test('starting a session outside Ember runs no git command', WITH_REMOTE_SETTING, async ($, on) => {
  const world = stubWorld(on, { remote: 'git@gitlab.example.com:other/project.git' })
  await startSession($)
  expect(world.gitRuns).toEqual([])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a notebook edit under a pillar marks it as edited on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await $.tool.call({ tool: 'NotebookEdit', notebook_path: `${ROOT}/pods/analysis.ipynb`, new_source: 'x' })
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^pods/ })
    await ui.unmount()
    expect(row?.text).toContain('editado 10:42')
  })

  test(`a written file under a pillar marks it as edited on ${surface}`, WITH_REMOTE_SETTING, async ($, on) => {
    stubWorld(on)
    await startSession($)
    await $.tool.call({ tool: 'Write', file_path: `${ROOT}/governor/main.go`, content: 'x' })
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /^governor/ })
    await ui.unmount()
    expect(row?.text).toContain('editado 10:42')
  })
}
