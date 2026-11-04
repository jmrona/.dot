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

const SHELL_COMMAND_ARGUMENT = /\b(?:sh|bash|zsh)\s+(?:-[a-zA-Z]+\s+)*-c\s+("(?:\\[\s\S]|[^"\\])*"|'[^']*')/g

function shellCommandArgumentsOf(command: string): string[] {
  return [...command.matchAll(SHELL_COMMAND_ARGUMENT)].map(match => unquoteArgument(match[1]))
}

function unquoteArgument(quoted: string): string {
  const body = quoted.slice(1, -1)
  return quoted.startsWith('"') ? body.replace(/\\([\s\S])/g, '$1') : body
}

export function unquotedSegmentsOf(command: string): string[] {
  const bothPasses = [
    ...segmentsOf(withoutQuotedText(command)),
    ...segmentsOf(command).map(withoutQuotedText),
    ...shellCommandArgumentsOf(command).flatMap(unquotedSegmentsOf),
  ]
  return [...new Set(bothPasses)]
}
