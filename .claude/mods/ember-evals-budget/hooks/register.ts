import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EvalTally } from '../types'
import { isEmberRemote } from './ember-detection'

const DENIAL =
  'A full eval run already ran this session (CLAUDE.md: once at the end). Ask the user to type /allow-evals.'
const NOT_THE_USER_REPLY = 'Only the user can allow another full eval run.'
const ALLOWED_REPLY = 'One more full eval run is allowed in this session.'
const PERSON_ORIGINS = ['composer', 'bridge']

const tally = atom(
  { plugin: 'ember-evals-budget', key: 'tally' } as const,
  { full: 0, filtered: 0, allowance: 0 },
  { shape: 'tally-1' },
)

type RunKind = 'full' | 'filtered'

const segmentsOf = (command: string) =>
  command.split(/&&|\|\||;|\||\n|(?<![>&])&(?![>&])/).map(segment => segment.trim())

const isEvalsRun = (segment: string) => /(?<![\w-])just\s+api\s+evals(?![\w-])/.test(segment)
const isFiltered = (segment: string) => /\s--filter(=|\s)/.test(segment)

const runKindsOf = (command: string): RunKind[] =>
  segmentsOf(command)
    .filter(isEvalsRun)
    .map(segment => (isFiltered(segment) ? 'filtered' : 'full'))

const admitRun = (current: EvalTally | undefined, kind: RunKind): EvalTally | undefined => {
  if (current === undefined) return undefined
  if (kind === 'filtered') return { ...current, filtered: current.filtered + 1 }
  if (current.full === 0) return { ...current, full: 1 }
  if (current.allowance === 0) return undefined
  return { ...current, full: current.full + 1, allowance: current.allowance - 1 }
}

const statusText = (current: EvalTally) =>
  `evals: ${current.full} full, ${current.filtered} filtered`

export const register: Register = (on, options) => {
  const emberRemote = typeof options.emberRemote === 'string' ? options.emberRemote.trim() : ''
  if (emberRemote === '') return

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'allow-evals',
      description: 'Allow one more full eval run in this session',
    })

    return next(e)
  })

  on('command.run', { command: 'allow-evals' }, async ($, e) => {
    if (!PERSON_ORIGINS.includes(e.origin.kind)) return { text: NOT_THE_USER_REPLY }
    await update($, tally, current => ({ ...current, allowance: current.allowance + 1 }))

    return { text: ALLOWED_REPLY }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const repo = await $.session.repo()
    const isEmber = isEmberRemote(repo?.remote ?? null, emberRemote)
    const runKinds = runKindsOf(e.command)
    if (!isEmber || runKinds.length === 0) return next(e)

    let isDenied = false
    const counted = await update($, tally, current => {
      const admitted = runKinds.reduce<EvalTally | undefined>(admitRun, current)
      isDenied = admitted === undefined
      return admitted ?? current
    })
    if (isDenied) return { deny: DENIAL }

    $.ui.status(statusText(counted))

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` },
  )
}
