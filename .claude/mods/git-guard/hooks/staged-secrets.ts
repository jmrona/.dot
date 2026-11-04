import { gitSubcommand, withoutQuotedText } from './command-text'
import type { RunGit } from './run-git'

interface Segment {
  readonly text: string
  readonly tokens: string[]
}

interface SegmentBuilder {
  start: number
  end: number
  tokens: string[]
}

const KEY_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx']
const KEY_FILE_NAMES = ['id_rsa', 'id_ed25519']
const ENV_TEMPLATES = ['.env.example', '.env.sample', '.env.dist', '.env.template']

const REDIRECT_OPERATOR_PATTERN = String.raw`(?:\d*|&)>>?(?:&\d*)?`
const QUOTED_OR_SEPARATOR_PATTERN = String.raw`"(?:\\[\s\S]|[^"\\])*"|'[^']*'|&&|\|\||[;|\n]`
const WORD_PATTERN = String.raw`[^\s;|&"'>]+`
const COMMAND_TOKEN = new RegExp(
  `${QUOTED_OR_SEPARATOR_PATTERN}|${REDIRECT_OPERATOR_PATTERN}|${WORD_PATTERN}|&`,
  'g',
)
const SEPARATOR_TOKEN = /^(?:&&|\|\||[;|\n&])$/

const DENIAL_RULE = 'Secret files must not be committed (rules/common/security.md)'
const DENIAL_UNSTAGE_ADVICE = 'Unstage them with `git restore --staged <file>`'
const DENIAL_UNTRACKED_ADVICE = 'add untracked ones to .gitignore or remove them'

function denialFor(paths: string[]): string {
  const advice = `${DENIAL_UNSTAGE_ADVICE}, and ${DENIAL_UNTRACKED_ADVICE}`
  return `${DENIAL_RULE}: ${paths.join(', ')}. ${advice}.`
}

function isSecretPath(path: string): boolean {
  const baseName = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (baseName === '.env') return true
  if (baseName.startsWith('.env.')) return !ENV_TEMPLATES.includes(baseName)
  if (KEY_EXTENSIONS.some(extension => baseName.endsWith(extension))) return true
  return KEY_FILE_NAMES.includes(baseName)
}

function withoutHeredocBodies(command: string): string {
  return command.replace(HEREDOC_BODY, '$1')
}

function quoteAwareSegmentsOf(rawCommand: string): Segment[] {
  const command = withoutHeredocBodies(rawCommand)
  let current: SegmentBuilder = { start: 0, end: 0, tokens: [] }
  const segments = [current]
  for (const match of command.matchAll(COMMAND_TOKEN)) {
    const token = match[0]
    const tokenEnd = match.index + token.length
    if (SEPARATOR_TOKEN.test(token)) {
      current = { start: tokenEnd, end: tokenEnd, tokens: [] }
      segments.push(current)
      continue
    }
    current.tokens.push(token)
    current.end = tokenEnd
  }
  return segments.map(({ start, end, tokens }) => ({ text: command.slice(start, end), tokens }))
}

function hasSubcommand(segment: Segment, subcommand: string): boolean {
  return gitSubcommand(subcommand).test(withoutQuotedText(segment.text))
}

function commitSegmentsOf(command: string): Segment[] {
  return quoteAwareSegmentsOf(command).filter(segment => hasSubcommand(segment, 'commit'))
}

function isCommitAll(segment: Segment): boolean {
  return segment.tokens.some(token => token === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(token))
}

const VALUE_FLAGS = [
  '--message',
  '--file',
  '--author',
  '--date',
  '--fixup',
  '--squash',
  '--template',
  '--trailer',
  '--cleanup',
  '--reuse-message',
  '--reedit-message',
  '-F',
  '-C',
  '-c',
  '-t',
]
const REDIRECT_TOKEN = new RegExp(`^${REDIRECT_OPERATOR_PATTERN}`)
const REDIRECT_OPERATOR = /^(?:\d*|&)>>?$/
const HEREDOC_BODY = /(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n\s*\3(?=\n|$)/g
const SHORT_MESSAGE_FLAGS = /^-[a-zA-Z]*m$/

function unquoted(token: string): string {
  return token.replace(/^(["'])(.*)\1$/, '$2')
}

function takesNextTokenAsValue(flag: string): boolean {
  return VALUE_FLAGS.includes(flag) || SHORT_MESSAGE_FLAGS.test(flag)
}

function isRedirect(token: string): boolean {
  return REDIRECT_TOKEN.test(token)
}

function pathCandidatesOf(segment: Segment): string[] {
  const commitIndex = segment.tokens.indexOf('commit')
  if (commitIndex === -1) return []
  const candidates: string[] = []
  let isValueNext = false
  let isAfterSeparator = false
  for (const token of segment.tokens.slice(commitIndex + 1)) {
    if (isValueNext) isValueNext = false
    else if (isRedirect(token)) isValueNext = REDIRECT_OPERATOR.test(token)
    else if (isAfterSeparator) candidates.push(unquoted(token))
    else if (token === '--') isAfterSeparator = true
    else if (token.startsWith('-')) isValueNext = takesNextTokenAsValue(token)
    else candidates.push(unquoted(token))
  }
  return candidates
}

function nulFieldsOf(output: string): string[] {
  return output.split('\0').filter(field => field !== '')
}

async function gitFields(runGit: RunGit, args: string[]): Promise<string[]> {
  const result = await runGit(args)
  return result.exitCode === 0 ? nulFieldsOf(result.stdout) : []
}

function isRenameOrCopy(statusFlags: string): boolean {
  return statusFlags.includes('R') || statusFlags.includes('C')
}

function pathsOfStatusFields(fields: string[]): string[] {
  const paths: string[] = []
  let isOldPathNext = false
  for (const field of fields) {
    if (isOldPathNext) {
      paths.push(field)
      isOldPathNext = false
      continue
    }
    paths.push(field.slice(3))
    isOldPathNext = isRenameOrCopy(field.slice(0, 2))
  }
  return paths
}

async function statusPaths(runGit: RunGit): Promise<string[]> {
  const fields = await gitFields(runGit, ['status', '--porcelain', '-z', '--untracked-files=all'])
  return pathsOfStatusFields(fields)
}

async function unstagedPathsWhenCommittingAll(
  runGit: RunGit,
  commitSegments: Segment[],
): Promise<string[]> {
  if (!commitSegments.some(isCommitAll)) return []
  return gitFields(runGit, ['diff', '--name-only', '-z'])
}

async function statusPathsWhenAdding(runGit: RunGit, command: string): Promise<string[]> {
  if (!quoteAwareSegmentsOf(command).some(segment => hasSubcommand(segment, 'add'))) return []
  return statusPaths(runGit)
}

async function candidatePathsOf(
  runGit: RunGit,
  command: string,
  commitSegments: Segment[],
): Promise<string[]> {
  return [
    ...(await gitFields(runGit, ['diff', '--cached', '--name-only', '-z'])),
    ...(await unstagedPathsWhenCommittingAll(runGit, commitSegments)),
    ...(await statusPathsWhenAdding(runGit, command)),
    ...commitSegments.flatMap(pathCandidatesOf),
  ]
}

export async function stagedSecretsDenial(
  runGit: RunGit,
  command: string,
): Promise<string | undefined> {
  const commitSegments = commitSegmentsOf(command)
  if (commitSegments.length === 0) return undefined
  const candidates = await candidatePathsOf(runGit, command, commitSegments)
  const secrets = [...new Set(candidates.filter(isSecretPath))]
  return secrets.length > 0 ? denialFor(secrets) : undefined
}
