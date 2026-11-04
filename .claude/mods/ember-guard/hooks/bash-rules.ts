const SEGMENT_SEPARATOR = /&&|\|\||[;|&\n]/
const COMMAND_START = '(?<![\\w.-])'
const COMMAND_END = '(?![\\w-])'

const anywhere = (pattern: string): RegExp => new RegExp(`${COMMAND_START}${pattern}${COMMAND_END}`)

const STACK_SWITCH_PATTERNS = [
  anywhere('just\\s+docker\\s+(?:use|up)'),
  anywhere('docker-?\\s*compose\\b.*\\bup'),
  anywhere('worktree\\.sh\\s+(?:use|up)'),
]

const DIRECT_TEST_PATTERNS = [
  anywhere('php\\s+artisan\\s+test'),
  anywhere('just\\s+api\\s+artisan\\s+test'),
]

const segmentsOf = (command: string): string[] =>
  command.split(SEGMENT_SEPARATOR).map(segment => segment.trim())

const hasSegmentMatching = (command: string, patterns: RegExp[]): boolean =>
  segmentsOf(command).some(segment => patterns.some(pattern => pattern.test(segment)))

export const switchesSharedStack = (command: string): boolean =>
  hasSegmentMatching(command, STACK_SWITCH_PATTERNS)

export const runsTestsDirectly = (command: string): boolean =>
  hasSegmentMatching(command, DIRECT_TEST_PATTERNS)
