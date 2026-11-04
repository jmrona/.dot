import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Outcome, Pillar, PillarRecord, Run, VerificationState } from '../types'
import { isEmberRemote } from './ember-detection'
import { PILLARS, hasFullEvalsRun, parseJustRuns, type JustRun } from './just-runs'

type Engine = Parameters<Hook<'session.start'>>[0]

const PANE = 'verification'
const COMMAND = 'verification'
const PANE_TITLE = 'Verificación'

const EVALS_PATHS = ['api/app/Slices/Assistant/', 'api/tests/Evals/']

const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+/

const branchHeader = atom({ plugin: 'ember-verification', key: 'branchHeader' } as const, null as string | null)

const verification = atom({ plugin: 'ember-verification', key: 'verification' } as const, {
  pillars: {},
  evalsEditedAt: null,
} as VerificationState)

async function isEmber($: Engine, emberRemote: string): Promise<boolean> {
  const repo = await $.session.repo()

  return repo !== null && isEmberRemote(repo.remote, emberRemote)
}

async function gitOutput($: Engine, argv: string[], cwd: string): Promise<string | null> {
  const command = argv.join(' ')
  try {
    const result = await $.process.run(argv, { cwd })
    if (result.exitCode === 0) {
      return result.stdout.trim()
    }
    $.ui.log(`\`${command}\` exited with ${result.exitCode} in ${cwd}. Nothing was recorded from it.`)
  } catch (error) {
    $.ui.log(`\`${command}\` could not run in ${cwd} (${String(error)}). Nothing was recorded from it.`)
  }

  return null
}

async function worktreeRoot($: Engine): Promise<string | null> {
  const top = await gitOutput($, ['git', 'rev-parse', '--show-toplevel'], await $.session.cwd())

  return top === '' ? null : top
}

function collapseDotSegments(path: string): string {
  const kept: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '..') {
      kept.pop()
    } else if (segment !== '.' && segment !== '') {
      kept.push(segment)
    }
  }

  return kept.join('/')
}

function pathWithin(root: string, path: string): string | null {
  const normalisedRoot = collapseDotSegments(root)
  const normalisedPath = collapseDotSegments(path)
  const prefix = `${normalisedRoot}/`

  return normalisedPath.startsWith(prefix) ? normalisedPath.slice(prefix.length) : null
}

function pillarOf(relativePath: string): Pillar | null {
  const first = relativePath.split('/')[0]

  return PILLARS.find(pillar => pillar === first) ?? null
}

async function describeBranch($: Engine, root: string): Promise<string | null> {
  const branch = await gitOutput($, ['git', 'branch', '--show-current'], root)
  if (branch === null || branch === '') {
    return null
  }
  const ticketKey = TICKET_KEY.exec(branch)?.[0]

  return ticketKey === undefined ? `rama ${branch}` : `${ticketKey}  (rama ${branch})`
}

async function refreshBranchHeader($: Engine, root: string | null): Promise<void> {
  const header = root === null ? null : await describeBranch($, root)
  await update($, branchHeader, () => header)
}

function formatTime(milliseconds: number): string {
  const date = new Date(milliseconds)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type ToolCallEvent = Parameters<Hook<'tool.call'>>[1]
type ToolCallOutcome = Awaited<ReturnType<Parameters<Hook<'tool.call'>>[2]>>

function editedPath(e: ToolCallEvent): string | null {
  switch (e.tool) {
    case 'Edit':
    case 'Write':
      return e.file_path
    case 'NotebookEdit':
      return e.notebook_path
    default:
      return null
  }
}

function hasFailed(outcome: ToolCallOutcome): boolean {
  return outcome.deny !== undefined || outcome.isError === true
}

function isLaunchedInBackground(outcome: ToolCallOutcome): boolean {
  const result: unknown = outcome.result

  return typeof result === 'object' && result !== null && 'backgroundTaskId' in result && result.backgroundTaskId !== undefined
}

async function recordEdit($: Engine, path: string): Promise<void> {
  const root = await worktreeRoot($)
  const relativePath = root === null ? null : pathWithin(root, path)
  const pillar = relativePath === null ? null : pillarOf(relativePath)
  if (relativePath === null || pillar === null) {
    return
  }
  await refreshBranchHeader($, root)
  const isFirstEdit = !hasAnyEdit(await read($, verification))
  const editedAt = await $.clock.now()
  const isEvalsPending = EVALS_PATHS.some(prefix => relativePath.startsWith(prefix))
  await update($, verification, state => ({
    evalsEditedAt: isEvalsPending ? editedAt : state.evalsEditedAt,
    pillars: { ...state.pillars, [pillar]: { ...emptyRecord(state, pillar), editedAt } },
  }))
  if (isFirstEdit) {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
  }
}

function hasAnyEdit(state: VerificationState): boolean {
  return Object.values(state.pillars).some(record => record.editedAt !== null)
}

function emptyRecord(state: VerificationState, pillar: Pillar): PillarRecord {
  return state.pillars[pillar] ?? { editedAt: null, check: null, test: null }
}

async function recordRuns($: Engine, runs: JustRun[], at: number, outcome: Outcome): Promise<void> {
  if (runs.length === 0) {
    return
  }
  await update($, verification, state => {
    const pillars = { ...state.pillars }
    for (const { pillar, kind, isPartial } of runs) {
      const record = pillars[pillar] ?? emptyRecord(state, pillar)
      if (isPartial && record[kind]?.isPartial === false) {
        continue
      }
      pillars[pillar] = { ...record, [kind]: { at, outcome, isPartial } }
    }

    return { ...state, pillars }
  })
}

async function clearEvalsEditedBefore($: Engine, startedAt: number): Promise<void> {
  await update($, verification, state => ({
    ...state,
    evalsEditedAt: state.evalsEditedAt !== null && state.evalsEditedAt > startedAt ? state.evalsEditedAt : null,
  }))
}

function describeRow(pillar: Pillar, record: PillarRecord & { editedAt: number }): string {
  const edited = `editado ${formatTime(record.editedAt)}`
  const check = `check ${describeRun(record.check, record.editedAt)}`
  const test = `test ${describeRun(record.test, record.editedAt)}`

  return `${pillar.padEnd(9)} ${edited}   ${check}   ${test}`
}

function describeRun(run: Run | null, editedAt: number): string {
  if (run === null) {
    return '--'
  }
  const result = `${run.outcome === 'pass' ? 'OK' : 'FAIL'} ${formatTime(run.at)}`

  if (run.isPartial) {
    return `parcial (${result})`
  }

  return run.at < editedAt ? `obsoleto (${result})` : result
}

export const register: Register = (on, options) => {
  const emberRemote = typeof options.emberRemote === 'string' ? options.emberRemote : ''

  on('session.start', async ($, e, next) => {
    if (await isEmber($, emberRemote)) {
      await $.command.register({ name: COMMAND, description: 'Show or hide the verification pane' })
      await refreshBranchHeader($, await worktreeRoot($))
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    if (!(await isEmber($, emberRemote))) {
      return { text: 'The verification pane works only in Ember sessions.' }
    }
    await refreshBranchHeader($, await worktreeRoot($))
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
    } else {
      await $.ui.open({ id: PANE, title: PANE_TITLE })
    }

    return { text: isOpen ? 'Verification pane closed.' : 'Verification pane opened.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const runs = parseJustRuns(e.command)
    const startedAt = await $.clock.now()
    const ran = await next(e)
    if (ran.deny === undefined && !isLaunchedInBackground(ran) && (await isEmber($, emberRemote))) {
      await recordRuns($, runs, startedAt, ran.isError === true ? 'fail' : 'pass')
      if (ran.isError !== true && hasFullEvalsRun(e.command)) {
        await clearEvalsEditedBefore($, startedAt)
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = editedPath(e)
    if (path !== null && !hasFailed(ran) && (await isEmber($, emberRemote))) {
      await recordEdit($, path)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const state = await read($, verification)
    const header = await read($, branchHeader)

    return (
      <Box flexDirection="column">
        {header !== null && <Text>{header}</Text>}
        {PILLARS.flatMap(pillar => {
          const record = state.pillars[pillar]
          const text = record?.editedAt == null ? null : describeRow(pillar, { ...record, editedAt: record.editedAt })

          return text === null ? [] : [<Text key={pillar}>{text}</Text>]
        })}
        {state.evalsEditedAt !== null && <Text>evals     pendiente</Text>}
      </Box>
    )
  })
}
