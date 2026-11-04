import type { Pillar } from '../types'

export type JustRun = { pillar: Pillar; kind: 'check' | 'test'; isPartial: boolean }

export const PILLARS: readonly Pillar[] = ['api', 'governor', 'platform', 'pods', 'proto']

const PILLAR_RUN = /\bjust\s+(?:(api|governor|platform|pods|proto)\s+)?(check|test|lint)(?=\s|$)(.*)/
const REDIRECTION = /^\d*[<>]/
const REDIRECTION_OPERATOR = /^\d*(?:>>?|<)$/

function hasArguments(rest: string): boolean {
  const words = rest.split(/\s+/).filter(word => word !== '')
  for (let index = 0; index < words.length; index++) {
    const word = words[index] ?? ''
    if (REDIRECTION_OPERATOR.test(word)) {
      index++
    } else if (!REDIRECTION.test(word)) {
      return true
    }
  }

  return false
}

function parseSegment(segment: string): JustRun[] {
  const match = PILLAR_RUN.exec(segment)
  if (match === null || (match[2] === 'lint' && match[1] !== 'proto')) {
    return []
  }
  const kind = match[2] === 'test' ? 'test' : 'check'
  const isPartial = kind === 'test' && hasArguments(match[3] ?? '')
  const pillars = match[1] === undefined ? PILLARS : [match[1] as Pillar]

  return pillars.map(pillar => ({ pillar, kind, isPartial }))
}

export function parseJustRuns(command: string): JustRun[] {
  return command.split(/&&|\|\||[\n;|&]/).flatMap(parseSegment)
}

const EVALS_RUN = /\bjust\s+api\s+evals(?=\s|$)(.*)/

export function hasFullEvalsRun(command: string): boolean {
  return command.split(/&&|\|\||[\n;|&]/).some(segment => {
    const match = EVALS_RUN.exec(segment)

    return match !== null && !(match[1] ?? '').includes('--filter')
  })
}
