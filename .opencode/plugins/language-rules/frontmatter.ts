const DELIMITER = '---'
const GLOBS_PREFIX = 'globs:'

export function parseGlobs(text: string): string[] {
  const lines = text.split('\n').map((line) => line.trim())
  const opening = lines.indexOf(DELIMITER)
  if (opening === -1) return []
  const closing = lines.indexOf(DELIMITER, opening + 1)
  if (closing === -1) return []
  const globsLine = lines.slice(opening + 1, closing).find((line) => line.startsWith(GLOBS_PREFIX))
  if (globsLine === undefined) return []
  return globsLine
    .slice(GLOBS_PREFIX.length)
    .split(',')
    .map((glob) => glob.trim())
    .filter((glob) => glob.length > 0)
}
