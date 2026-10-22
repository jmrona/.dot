import { matchesGlob } from 'node:path'

const BRACE_GROUP = /\{([^{}]*)\}/

function expandBraces(pattern: string): string[] {
  const group = BRACE_GROUP.exec(pattern)
  if (group === null) return [pattern]
  const [whole, alternatives] = group
  return alternatives
    .split(',')
    .flatMap((alternative) => expandBraces(pattern.replace(whole, alternative)))
}

const DOT_SEGMENT_START = /(^|\/)\./g

function maskDotSegments(path: string): string {
  return path.replace(DOT_SEGMENT_START, '$1_dot_')
}

function synthesiseFilename(pattern: string): string {
  return pattern.replace(/\*+/g, 'x').replace(/\?/g, 'x')
}

export function referenceMatchesGlobs(reference: string, globs: readonly string[]): boolean {
  return expandBraces(reference)
    .map(synthesiseFilename)
    .map(maskDotSegments)
    .some((candidate) => globs.some((glob) => matchesGlob(candidate, maskDotSegments(glob))))
}
