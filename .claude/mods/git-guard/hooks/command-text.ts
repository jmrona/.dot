const OPTION_WITH_ARGUMENT = String.raw`-[^\s"']+(?:\s+(?:"[^"]*"|'[^']*'|[^\s-]\S*))?`

const QUOTED_OR_ESCAPED = /\\[\s\S]|"(?:\\[\s\S]|[^"\\])*"|'[^']*'/g

export function gitSubcommand(subcommand: string): RegExp {
  return new RegExp(String.raw`\bgit(?:\s+${OPTION_WITH_ARGUMENT})*\s+${subcommand}\b`)
}

export function withoutQuotedText(segment: string): string {
  return segment.replace(QUOTED_OR_ESCAPED, '')
}

const SEGMENT_SEPARATOR = /&&|\|\||\|&|;|\||(?<![>&|])&(?![>&])|\n/

export function segmentsOf(command: string): string[] {
  return command.split(SEGMENT_SEPARATOR).map(segment => segment.trim())
}

export function unquotedSegmentsOf(command: string): string[] {
  const bothPasses = [
    ...segmentsOf(withoutQuotedText(command)),
    ...segmentsOf(command).map(withoutQuotedText),
  ]
  return [...new Set(bothPasses)]
}
