import { gitSubcommand, unquotedSegmentsOf } from './command-text'
import type { RunGit } from './run-git'

interface Piece {
  readonly text: string
  readonly end: number
  readonly isBoundary?: boolean
  readonly isLiteralStart?: boolean
}

interface Message {
  readonly text: string
  readonly isShellExpansion: boolean
}

interface Heredoc {
  readonly body: string
  readonly end: number
}

const HEREDOC_OPENER = /\$\(\s*cat\s+<<-?\s*(['"]?)(\w+)\1[^\n]*\n/y
const CLOSING_BRACKET = /\s*\)/y
const COMMAND_SEPARATOR = /^(?:&&|\|\||;|\||&|\n|\))/
const COMMIT_TYPES = 'feat|fix|refactor|docs|test|chore|perf|ci|build|style|revert'
const SUBJECT_SHAPE = new RegExp(`^(${COMMIT_TYPES})\\([a-z0-9][a-z0-9-]*\\): \\S`)
const TICKET_SUFFIX = / \([A-Z][A-Z0-9]+-\d+\)$/
const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+/
const SHORT_MESSAGE_FLAG = /^-[ansvqeoipz]*m([\s\S]*)$/
const ESCAPABLE = '"\\$`'
const ATTACHED_LONG_MESSAGE = '--message='

const SHAPE_REASON =
  'the subject must start with a type from git.md and a lowercase scope in brackets'
const LITERAL_REASON = 'the message must be literal text in the command, so the guard can read it'
const PUNCTUATION_REASON =
  'the message must not contain em-dashes, en-dashes or emojis (rules/common/language.md)'
const DENIAL_PREFIX = 'Commit message breaks the format in rules/common/git.md: '
const DENIAL_SUFFIX =
  '. Expected shape: `type(scope): description (KEY)`, ' +
  'with the suffix only when the branch name starts with a ticket key.'

export async function commitMessageDenial(
  runGit: RunGit,
  command: string,
): Promise<string | undefined> {
  if (!unquotedSegmentsOf(command).some(segment => gitSubcommand('commit').test(segment))) {
    return undefined
  }
  for (const messages of commitMessagesIn(command)) {
    const reason = await reasonForMessages(runGit, messages)
    if (reason !== undefined) return `${DENIAL_PREFIX}${reason}${DENIAL_SUFFIX}`
  }
  return undefined
}

async function reasonForMessages(
  runGit: RunGit,
  messages: readonly Message[],
): Promise<string | undefined> {
  const [first] = messages
  if (first === undefined) return undefined
  const [subjectLine = ''] = first.text.split('\n')
  const subjectReason = await subjectReasonOf(runGit, subjectLine.trimEnd(), first)
  return subjectReason ?? punctuationReason(messages.map(message => message.text).join('\n\n'))
}

async function subjectReasonOf(
  runGit: RunGit,
  subject: string,
  message: Message,
): Promise<string | undefined> {
  if (subject.startsWith('Merge ')) return undefined
  if (message.isShellExpansion) return LITERAL_REASON
  return shapeReason(subject) ?? (await ticketReason(runGit, subject))
}

function punctuationReason(message: string): string | undefined {
  const hasForbiddenCharacter = /[—–]|\p{Extended_Pictographic}/u.test(message)
  return hasForbiddenCharacter ? PUNCTUATION_REASON : undefined
}

function shapeReason(subject: string): string | undefined {
  if (!SUBJECT_SHAPE.test(subject)) return SHAPE_REASON
  const description = subject.slice(subject.indexOf(': ') + 2)
  if (/^\p{Lu}/u.test(description)) return 'the description must start in lowercase'
  if (subject.replace(TICKET_SUFFIX, '').endsWith('.')) {
    return 'the subject must not end with a full stop'
  }
  return undefined
}

async function ticketReason(runGit: RunGit, subject: string): Promise<string | undefined> {
  const result = await runGit(['branch', '--show-current'])
  const branch = result.stdout.trim()
  if (result.exitCode !== 0 || branch === '') return undefined
  const key = TICKET_KEY.exec(branch)?.[0]
  if (key !== undefined && !subject.endsWith(` (${key})`)) {
    return `the branch ${branch} needs the suffix (${key})`
  }
  if (key === undefined && TICKET_SUFFIX.test(subject)) {
    return `the branch ${branch} has no ticket key, so the subject takes no suffix`
  }
  return undefined
}

function commitMessagesIn(command: string): Message[][] {
  const quoted = quotedRangesIn(command)
  const commits = [...command.matchAll(new RegExp(gitSubcommand('commit').source, 'g'))]
  return commits
    .filter(commit => !quoted.some(([start, end]) => commit.index >= start && commit.index < end))
    .map(commit => messagesOf(tokensOf(command.slice(commit.index + commit[0].length))))
}

function messageFrom(text: string, isShellExpansion: boolean): Message {
  const body = unwrapHeredoc(text)
  return { text: body, isShellExpansion: isShellExpansion && body === text }
}

function messagesOf(tokens: readonly Message[]): Message[] {
  const messages: Message[] = []
  tokens.forEach((token, position) => {
    const next = tokens[position + 1] ?? { text: '', isShellExpansion: false }
    const attached = SHORT_MESSAGE_FLAG.exec(token.text)?.[1]
    if (attached === '') {
      messages.push(messageFrom(next.text, next.isShellExpansion))
    } else if (attached !== undefined) {
      messages.push(messageFrom(attached, attached.startsWith('$')))
    } else if (token.text === '--message') {
      messages.push(messageFrom(next.text, next.isShellExpansion))
    } else if (token.text.startsWith(ATTACHED_LONG_MESSAGE)) {
      const value = token.text.slice(ATTACHED_LONG_MESSAGE.length)
      messages.push(messageFrom(value, value.startsWith('$')))
    }
  })
  return messages
}

function heredocAt(text: string, position: number): Heredoc | undefined {
  HEREDOC_OPENER.lastIndex = position
  const opener = HEREDOC_OPENER.exec(text)
  if (opener === null) return undefined
  const marker = opener[2]
  const lines = text.slice(position + opener[0].length).split('\n')
  const markerLine = lines.indexOf(marker ?? '')
  if (markerLine === -1) return undefined
  const body = lines.slice(0, markerLine).join('\n')
  const consumed = lines.slice(0, markerLine + 1).join('\n').length
  const bodyStart = position + opener[0].length
  CLOSING_BRACKET.lastIndex = bodyStart + consumed
  const closing = CLOSING_BRACKET.exec(text)
  if (closing === null) return undefined
  return { body, end: bodyStart + consumed + closing[0].length }
}

function unwrapHeredoc(value: string): string {
  const heredoc = heredocAt(value, 0)
  return heredoc !== undefined && heredoc.end === value.length ? heredoc.body : value
}

function pieceAt(text: string, position: number): Piece {
  const char = text.charAt(position)
  if (/\s/.test(char)) return { text: '', end: position + 1, isBoundary: true }
  if (char === '"') {
    const quoted = readDoubleQuoted(text, position + 1)
    return { text: quoted.value, end: quoted.end, isLiteralStart: quoted.startsWithEscape }
  }
  if (char === "'") {
    const close = text.indexOf("'", position + 1)
    const end = close === -1 ? text.length : close
    return { text: text.slice(position + 1, end), end: end + 1, isLiteralStart: true }
  }
  if (char === '\\') {
    return { text: text.charAt(position + 1), end: position + 2, isLiteralStart: true }
  }
  return { text: char, end: position + 1 }
}

function tokensOf(text: string): Message[] {
  const tokens: Message[] = []
  let current: Message | undefined
  let position = 0
  while (position < text.length && !COMMAND_SEPARATOR.test(text.slice(position))) {
    const piece = pieceAt(text, position)
    if (piece.isBoundary && current !== undefined) tokens.push(current)
    current = piece.isBoundary ? undefined : extendedToken(current, piece)
    position = piece.end
  }
  if (current !== undefined) tokens.push(current)
  return tokens
}

function extendedToken(current: Message | undefined, piece: Piece): Message {
  if (current !== undefined) return { ...current, text: current.text + piece.text }
  const isShellExpansion = piece.text.startsWith('$') && piece.isLiteralStart !== true
  return { text: piece.text, isShellExpansion }
}

function quotedRangesIn(text: string): [number, number][] {
  const ranges: [number, number][] = []
  let position = 0
  while (position < text.length) {
    const isQuote = text.charAt(position) === '"' || text.charAt(position) === "'"
    const end = pieceAt(text, position).end
    if (isQuote) ranges.push([position, end])
    position = end
  }
  return ranges
}

function readDoubleQuoted(
  text: string,
  start: number,
): { value: string; end: number; startsWithEscape: boolean } {
  let value = ''
  let position = start
  while (position < text.length && text.charAt(position) !== '"') {
    const heredoc = text.charAt(position) === '$' ? heredocAt(text, position) : undefined
    const isEscape =
      text.charAt(position) === '\\' && ESCAPABLE.includes(text.charAt(position + 1))
    const consumed = heredoc === undefined ? (isEscape ? 2 : 1) : heredoc.end - position
    const raw = text.slice(position, position + consumed)
    value += isEscape ? raw.slice(1) : raw
    position += consumed
  }
  const startsWithEscape = text.charAt(start) === '\\' && ESCAPABLE.includes(text.charAt(start + 1))
  return { value, end: position + 1, startsWithEscape }
}
