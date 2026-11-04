import type { Pillar } from '../types'

export type JustRun = { pillar: Pillar; kind: 'check' | 'test'; isPartial: boolean }

export const PILLARS: readonly Pillar[] = ['api', 'governor', 'platform', 'pods', 'proto']

const PILLAR_RUN = /^\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:time\s+)?just\s+(?:(api|governor|platform|pods|proto)\s+)?(check|test|lint)(?=\s|$)(.*)/
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

function isPipeOperator(separator: string): boolean {
  return separator === '|' || separator === '||'
}

const QUOTED_TEXT_OR_ESCAPE = /\\.|"(?:\\.|[^"\\])*"|'[^']*'/g

function maskQuotedText(command: string): string {
  return command.replace(QUOTED_TEXT_OR_ESCAPE, '_')
}

function unpipedSegments(command: string): string[] {
  const parts = maskQuotedText(command).split(/(&&|\|\||[\n;|&])/)

  return parts.filter((_, index) => {
    const isSegment = index % 2 === 0
    const isFollowedByPipe = parts.slice(index + 1).some((later, offset) => offset % 2 === 0 && isPipeOperator(later))

    return isSegment && !isFollowedByPipe
  })
}

export function parseJustRuns(command: string): JustRun[] {
  return unpipedSegments(command).flatMap(parseSegment)
}

const EVALS_RUN = /^\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:time\s+)?just\s+api\s+evals(?=\s|$)(.*)/

export function hasFullEvalsRun(command: string): boolean {
  return unpipedSegments(command).some(segment => {
    const match = EVALS_RUN.exec(segment)

    return match !== null && !(match[1] ?? '').includes('--filter')
  })
}
