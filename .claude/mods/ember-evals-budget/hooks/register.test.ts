import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const EMBER_REMOTE = 'https://gitlab.example.com/acme/app.git'
const DENIAL =
  'A full eval run already ran this session (CLAUDE.md: once at the end). Ask the user to type /allow-evals.'
const OPTIONS = { options: { emberRemote: 'gitlab.example.com/acme/app' } }
const FULL_RUN = 'just api evals'
const FILTERED_RUN = 'just api evals --filter=AssistantToolRoutingLookupTest'

const startSession = async ($: Engine, on: On, remote: string | null = EMBER_REMOTE) => {
  on('session.repo', () => ({
    value: { root: '/home/dev/app', remote, internal: false, name: null },
  }))
  on('command.register', () => ({ value: { command: 'allow-evals' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/home/dev/app', surface: 'terminal', isInteractive: true })
}

const runBash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })

const recordStatusTexts = (on: On) => {
  const texts: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    texts.push(e.text)
    return { value: undefined }
  })
  return texts
}

test('the first full eval run passes', OPTIONS, async ($, on) => {
  await startSession($, on)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
})

test('a second full eval run is denied with the once-per-session message', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('filtered runs written with an equals sign pass and are counted as filtered', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  const answer = await runBash($, 'just api evals --filter=X')
  expect(answer.deny).toBeUndefined()
  expect(texts.at(-1)).toBe('evals: 0 full, 1 filtered')
})

test('filtered runs written with a space pass and are counted as filtered', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  const answer = await runBash($, 'just api evals --filter X')
  expect(answer.deny).toBeUndefined()
  expect(texts.at(-1)).toBe('evals: 0 full, 1 filtered')
})

test('filtered runs leave the first full run available and are still counted', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  await runBash($, FILTERED_RUN)
  await runBash($, FILTERED_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
  expect(texts.at(-1)).toBe('evals: 1 full, 2 filtered')
})

test('a full run chained after another command is counted as a full run', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, 'cd api && just api evals')
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a full run on the second line of a multi-line command is counted', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, 'cd api\njust api evals')
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a full run inside a subshell is counted', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, '(just api evals)')
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a full run behind an environment assignment is counted', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, 'FOO=1 just api evals')
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a lone ampersand separates a filtered run from a full run', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  const answer = await runBash($, 'just api evals --filter=X & just api evals')
  expect(answer.deny).toBeUndefined()
  expect(texts.at(-1)).toBe('evals: 1 full, 1 filtered')
})

test('a redirection of standard error does not split a filtered run', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  await runBash($, 'just api evals --filter=X 2>&1')
  await runBash($, 'just api evals --filter=X >&2')
  await runBash($, 'just api evals --filter=X &> out.log')
  expect(texts.at(-1)).toBe('evals: 0 full, 3 filtered')
})

test('a full run inside bash -c is counted', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, 'bash -c "just api evals"')
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('two full runs in one command are denied on a fresh session', OPTIONS, async ($, on) => {
  await startSession($, on)
  const answer = await runBash($, 'just api evals && just api evals')
  expect(answer.deny).toContain(DENIAL)
})

test('a filtered and a full segment in one command count one each', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  const answer = await runBash($, 'just api evals --filter=X && just api evals')
  expect(answer.deny).toBeUndefined()
  expect(texts.at(-1)).toBe('evals: 1 full, 1 filtered')
})

test('a denied command counts nothing', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  await runBash($, FULL_RUN)
  const statusBefore = texts.at(-1)
  await runBash($, 'just api evals --filter=X && just api evals')
  expect(texts.at(-1)).toBe(statusBefore)
})

function allowEvalsFrom($: Engine, origin: Parameters<Engine['command']['run']>[0]['origin']) {
  return $.command.run({
    command: 'allow-evals',
    args: '',
    origin,
    presentation: { isFullscreen: false, columns: 80 },
  })
}

test('allow-evals typed by the person lets exactly one more full run through', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  await allowEvalsFrom($, { kind: 'composer' })
  const allowed = await runBash($, FULL_RUN)
  const denied = await runBash($, FULL_RUN)
  expect(allowed.deny).toBeUndefined()
  expect(denied.deny).toContain(DENIAL)
})

test('allow-evals typed by the person answers that one more full run is allowed', OPTIONS, async ($, on) => {
  await startSession($, on)
  const reply = await allowEvalsFrom($, { kind: 'composer' })
  expect(reply.text).toBe('One more full eval run is allowed in this session.')
})

test('allow-evals sent by the person through the bridge grants a full run', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  await allowEvalsFrom($, { kind: 'bridge' })
  const allowed = await runBash($, FULL_RUN)
  expect(allowed.deny).toBeUndefined()
})

test('allow-evals from a peer message says only the user can allow it', OPTIONS, async ($, on) => {
  await startSession($, on)
  const reply = await allowEvalsFrom($, { kind: 'peer-send-message' })
  expect(reply.text).toBe('Only the user can allow another full eval run.')
})

test('allow-evals from a peer message grants no further full run', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  await allowEvalsFrom($, { kind: 'peer-send-message' })
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('allow-evals from a plugin grants nothing', OPTIONS, async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  await allowEvalsFrom($, { kind: 'plugin', name: 'other' })
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('two full runs requested at once let only one through', OPTIONS, async ($, on) => {
  await startSession($, on)
  const answers = await Promise.all([runBash($, FULL_RUN), runBash($, FULL_RUN)])
  const deniedCount = answers.filter(answer => answer.deny !== undefined).length
  expect(deniedCount).toBe(1)
})

test('a subagent full run counts against the same budget as the main loop', OPTIONS, async ($, on) => {
  await startSession($, on)
  await $.tool.call({ tool: 'Bash', command: FULL_RUN, agentId: 'a1' })
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('outside Ember nothing is counted or denied', OPTIONS, async ($, on) => {
  await startSession($, on, 'git@github.com:someone/else.git')
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
})

test('a session without a remote is not Ember', OPTIONS, async ($, on) => {
  await startSession($, on, null)
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
})

test('an ssh remote of Ember is recognised as Ember', OPTIONS, async ($, on) => {
  await startSession($, on, 'git@gitlab.example.com:acme/app.git')
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a remote with a trailing slash is recognised as Ember', OPTIONS, async ($, on) => {
  await startSession($, on, 'HTTPS://gitlab.example.com/acme/app.git/')
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toContain(DENIAL)
})

test('a look-alike host that only ends with the Ember host is not Ember', OPTIONS, async ($, on) => {
  await startSession($, on, 'https://evil-gitlab.example.com/acme/app.git')
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
})

test('the status shows one full run after a full run', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  await runBash($, FULL_RUN)
  expect(texts.at(-1)).toBe('evals: 1 full, 0 filtered')
})

test('the status shows one filtered run after a filtered run', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  await runBash($, FILTERED_RUN)
  expect(texts.at(-1)).toBe('evals: 0 full, 1 filtered')
})

test('a command other than the evals recipe is not denied and shows no status', OPTIONS, async ($, on) => {
  const texts = recordStatusTexts(on)
  await startSession($, on)
  const answer = await runBash($, 'just api test')
  expect(answer.deny).toBeUndefined()
  expect(texts).toEqual([])
})

test('an unset emberRemote makes the mod inert', async ($, on) => {
  await startSession($, on)
  await runBash($, FULL_RUN)
  const answer = await runBash($, FULL_RUN)
  expect(answer.deny).toBeUndefined()
})
