#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const isShortFlagCluster = (letter) => (argument) => new RegExp(`^-[A-Za-z]*${letter}[A-Za-z]*$`).test(argument)
const isForceFlag = (argument) => argument === '--force' || isShortFlagCluster('f')(argument)
const isDeleteFlag = (argument) => argument === '--delete' || isShortFlagCluster('d')(argument)
const isForcedBranchDeletion = (args) =>
  args.some(isShortFlagCluster('D')) || (args.some(isDeleteFlag) && args.some(isForceFlag))

const BLOCKED_GIT_RULES = [
  { subcommand: 'push', label: 'git push', when: () => true },
  { subcommand: 'reset', label: 'git reset --hard', when: (args) => args.includes('--hard') },
  { subcommand: 'clean', label: 'git clean -f', when: (args) => args.some(isForceFlag) },
  { subcommand: 'checkout', label: 'git checkout .', when: (args) => args.includes('.') },
  { subcommand: 'restore', label: 'git restore .', when: (args) => args.includes('.') },
  { subcommand: 'branch', label: 'git branch -D', when: isForcedBranchDeletion },
  { subcommand: 'rebase', label: 'git rebase', when: () => true },
]

const GIT_OPTIONS_WITH_SEPARATE_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const RESERVED_WORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until'])
const OPERATORS = ['&&', '||', '|&', ';;', ';', '|', '&', '(', ')']
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

const WRAPPERS = new Map([
  ['env', { valueFlags: ['-u', '-C', '-S', '--unset', '--chdir', '--split-string'], positionals: 0 }],
  ['command', { valueFlags: [], positionals: 0 }],
  ['exec', { valueFlags: ['-a'], positionals: 0 }],
  ['nohup', { valueFlags: [], positionals: 0 }],
  ['nice', { valueFlags: ['-n', '--adjustment'], positionals: 0 }],
  ['time', { valueFlags: [], positionals: 0 }],
  ['timeout', { valueFlags: ['-s', '-k', '--signal', '--kill-after'], positionals: 1 }],
  ['sudo', { valueFlags: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-R', '-T'], positionals: 0 }],
  ['xargs', { valueFlags: ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a', '-J'], positionals: 0 }],
])

const ANSI_C_ESCAPES = { n: '\n', t: '\t' }

class AnalysisError extends Error {}

function skipQuoted(text, openIndex) {
  const quote = text[openIndex]
  for (let index = openIndex + 1; index < text.length; index += 1) {
    if (text[index] === '\\' && quote === '"') index += 1
    else if (text[index] === quote) return index + 1
  }
  throw new AnalysisError('a quote is not closed')
}

function skipAnsiCQuoted(text, dollarIndex) {
  for (let index = dollarIndex + 2; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === "'") return index + 1
  }
  throw new AnalysisError('a quote is not closed')
}

function readHeredocDelimiterAt(text, start) {
  let index = start
  let delimiter = ''
  while (index < text.length && !/[\s;&|()<>]/.test(text[index])) {
    const character = text[index]
    if (character === "'" || character === '"') {
      const end = text.indexOf(character, index + 1)
      if (end === -1) throw new AnalysisError('a heredoc delimiter quote is not closed')
      delimiter += text.slice(index + 1, end)
      index = end + 1
    } else if (character === '\\') {
      delimiter += text[index + 1] ?? ''
      index += 2
    } else {
      delimiter += character
      index += 1
    }
  }
  return { delimiter, next: index }
}

function readHeredocOperatorAt(text, operatorIndex) {
  let index = operatorIndex + 2
  const stripTabs = text[index] === '-'
  if (stripTabs) index += 1
  while (text[index] === ' ' || text[index] === '\t') index += 1
  const { delimiter, next } = readHeredocDelimiterAt(text, index)
  return { heredoc: { delimiter, stripTabs }, next }
}

function readHeredocBodyAt(text, start, { delimiter, stripTabs }) {
  const lines = []
  let index = start
  while (index < text.length) {
    const newline = text.indexOf('\n', index)
    const lineEnd = newline === -1 ? text.length : newline
    const line = text.slice(index, lineEnd)
    index = Math.min(lineEnd + 1, text.length)
    if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break
    lines.push(line)
  }
  return { body: lines.join('\n'), next: index }
}

function skipHeredocBodies(text, start, heredocs) {
  return heredocs.reduce((index, heredoc) => readHeredocBodyAt(text, index, heredoc).next, start)
}

function findClosingParenthesis(text, start) {
  let depth = 1
  let index = start
  let pending = []
  while (index < text.length) {
    const character = text[index]
    if (character === '\\') index += 2
    else if (text.startsWith("$'", index)) index = skipAnsiCQuoted(text, index)
    else if (character === "'" || character === '"') index = skipQuoted(text, index)
    else if (text.startsWith('<<', index) && !text.startsWith('<<<', index)) {
      const operator = readHeredocOperatorAt(text, index)
      pending.push(operator.heredoc)
      index = operator.next
    } else if (character === '\n' && pending.length > 0) {
      index = skipHeredocBodies(text, index + 1, pending)
      pending = []
    } else {
      depth += character === '(' ? 1 : character === ')' ? -1 : 0
      if (depth === 0) return index
      index += 1
    }
  }
  throw new AnalysisError('a command substitution is not closed')
}

function findClosingBacktick(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === '`') return index
  }
  throw new AnalysisError('a backtick is not closed')
}

class ShellParser {
  constructor(text) {
    this.text = text
    this.index = 0
    this.word = null
    this.tokens = []
    this.commands = []
    this.nested = []
    this.pendingHeredocs = []
    this.lineStart = 0
    this.discardNextWord = false
  }

  get current() {
    return this.text[this.index]
  }

  parse() {
    while (this.index < this.text.length) this.step()
    this.endCommand()
    return { commands: this.commands, nested: this.nested }
  }

  append(text) {
    this.word = (this.word ?? '') + text
  }

  endWord() {
    if (this.word === null) return
    if (!this.discardNextWord) this.tokens.push(this.word)
    this.discardNextWord = false
    this.word = null
  }

  endCommand() {
    this.endWord()
    this.discardNextWord = false
    if (this.tokens.length > 0) this.commands.push(this.tokens)
    this.tokens = []
  }

  startsWith(text) {
    return this.text.startsWith(text, this.index)
  }

  currentIsOneOf(characters) {
    return this.index < this.text.length && characters.includes(this.current)
  }

  step() {
    const character = this.current
    if (character === '\\') return this.readBackslash()
    if (this.startsWith("$'")) return this.readAnsiCQuoted()
    if (character === "'") return this.readSingleQuoted()
    if (character === '"') return this.readDoubleQuoted()
    if (character === '`') return this.readBacktick()
    if (this.startsWith('$(')) return this.readSubstitution()
    if (character === '\n') return this.readNewline()
    if (/\s/.test(character)) return this.skipWhitespace()
    if (character === '#' && this.word === null) return this.skipComment()
    return this.stepOperatorOrCharacter()
  }

  stepOperatorOrCharacter() {
    if (this.startsWith('<<') && !this.startsWith('<<<')) return this.readHeredocOperator()
    if (this.currentIsOneOf('<>')) return this.readRedirection()
    const operator = OPERATORS.find((candidate) => this.startsWith(candidate))
    if (operator) {
      this.endCommand()
      this.index += operator.length
      return undefined
    }
    this.append(this.current)
    this.index += 1
    return undefined
  }

  skipWhitespace() {
    this.endWord()
    this.index += 1
  }

  skipComment() {
    while (this.index < this.text.length && this.current !== '\n') this.index += 1
  }

  readBackslash() {
    const escaped = this.text[this.index + 1]
    if (escaped !== undefined && escaped !== '\n') this.append(escaped)
    this.index += 2
  }

  readSingleQuoted() {
    const end = this.text.indexOf("'", this.index + 1)
    if (end === -1) throw new AnalysisError('a single quote is not closed')
    this.append(this.text.slice(this.index + 1, end))
    this.index = end + 1
  }

  readAnsiCQuoted() {
    const end = skipAnsiCQuoted(this.text, this.index)
    const content = this.text.slice(this.index + 2, end - 1)
    this.append(content.replace(/\\(.)/gs, (_match, escaped) => ANSI_C_ESCAPES[escaped] ?? escaped))
    this.index = end
  }

  readDoubleQuoted() {
    this.append('')
    this.index += 1
    let closed = false
    while (this.index < this.text.length && !closed) closed = this.readDoubleQuotedPart()
    if (!closed) throw new AnalysisError('a double quote is not closed')
  }

  readDoubleQuotedPart() {
    const character = this.current
    if (character === '"') this.index += 1
    else if (character === '\\') this.readDoubleQuotedEscape()
    else if (character === '`') this.readBacktick()
    else if (this.startsWith('$(')) this.readSubstitution()
    else {
      this.append(character)
      this.index += 1
    }
    return character === '"'
  }

  readDoubleQuotedEscape() {
    const escaped = this.text[this.index + 1]
    if (escaped === '\n') this.index += 2
    else if (escaped !== undefined && '"\\$`'.includes(escaped)) {
      this.append(escaped)
      this.index += 2
    } else {
      this.append('\\')
      this.index += 1
    }
  }

  readSubstitution() {
    const end = findClosingParenthesis(this.text, this.index + 2)
    this.nested.push(this.text.slice(this.index + 2, end))
    this.append(this.text.slice(this.index, end + 1))
    this.index = end + 1
  }

  readBacktick() {
    const end = findClosingBacktick(this.text, this.index + 1)
    this.nested.push(this.text.slice(this.index + 1, end).replaceAll('\\`', '`'))
    this.append(this.text.slice(this.index, end + 1))
    this.index = end + 1
  }

  readRedirection() {
    if (/^\d+$/.test(this.word ?? '')) this.word = null
    this.endWord()
    while (this.currentIsOneOf('<>')) this.index += 1
    if (this.currentIsOneOf('&|')) this.index += 1
    this.discardNextWord = true
  }

  readHeredocOperator() {
    this.endWord()
    const { heredoc, next } = readHeredocOperatorAt(this.text, this.index)
    this.pendingHeredocs.push(heredoc)
    this.index = next
  }

  readNewline() {
    this.endCommand()
    this.index += 1
    if (this.pendingHeredocs.length > 0) this.readHeredocBodies()
    this.lineStart = this.commands.length
  }

  readHeredocBodies() {
    const feedsShell = this.commands.slice(this.lineStart).some(readsScriptFromInput)
    for (const heredoc of this.pendingHeredocs) {
      const body = this.readHeredocBody(heredoc)
      if (feedsShell) this.nested.push(body)
    }
    this.pendingHeredocs = []
  }

  readHeredocBody(heredoc) {
    const { body, next } = readHeredocBodyAt(this.text, this.index, heredoc)
    this.index = next
    return body
  }
}

function skipWrapperArguments(args, { valueFlags, positionals }) {
  let index = 0
  while (index < args.length && (args[index].startsWith('-') || ASSIGNMENT.test(args[index]))) {
    index += valueFlags.includes(args[index]) ? 2 : 1
  }
  return args.slice(Math.min(index + positionals, args.length))
}

function dropLeadingNoise(tokens) {
  const first = tokens.findIndex((token) => !ASSIGNMENT.test(token) && !RESERVED_WORDS.has(token))
  return first === -1 ? [] : tokens.slice(first)
}

function unwrap(tokens) {
  let current = dropLeadingNoise(tokens)
  while (current.length > 0 && WRAPPERS.has(path.posix.basename(current[0]))) {
    const wrapper = WRAPPERS.get(path.posix.basename(current[0]))
    current = dropLeadingNoise(skipWrapperArguments(current.slice(1), wrapper))
  }
  return current
}

function commandStringIndex(args) {
  return args.findIndex(isShortFlagCluster('c'))
}

function readsScriptFromInput(tokens) {
  const [program, ...args] = unwrap(tokens)
  return program !== undefined && SHELLS.has(path.posix.basename(program)) && commandStringIndex(args) === -1
}

function matchGitRule(subcommand, args) {
  const rule = BLOCKED_GIT_RULES.find((candidate) => candidate.subcommand === subcommand && candidate.when(args))
  return rule ? rule.label : null
}

function blockedAliasDefinition(definition) {
  if (definition.startsWith('!')) return findBlockedCommand(definition.slice(1))
  const [subcommand, ...args] = definition.split(/\s+/).filter(Boolean)
  return subcommand === undefined ? null : matchGitRule(subcommand, args)
}

function scanGitOptions(args) {
  const aliases = new Map()
  let index = 0
  while (index < args.length && args[index].startsWith('-')) {
    const option = args[index]
    if (option === '-c' && args[index + 1] !== undefined) {
      const [key, ...value] = args[index + 1].split('=')
      if (key.startsWith('alias.')) aliases.set(key.slice('alias.'.length), value.join('='))
    }
    index += option === '-c' || GIT_OPTIONS_WITH_SEPARATE_VALUE.has(option) ? 2 : 1
  }
  return { aliases, rest: args.slice(index) }
}

function findBlockedGit(args) {
  const { aliases, rest } = scanGitOptions(args)
  for (const definition of aliases.values()) {
    const blocked = blockedAliasDefinition(definition)
    if (blocked) return blocked
  }
  const [subcommand, ...subcommandArgs] = rest
  if (subcommand === undefined) return null
  if (!aliases.has(subcommand)) return matchGitRule(subcommand, subcommandArgs)
  const [expanded, ...expandedArgs] = aliases.get(subcommand).split(/\s+/).filter(Boolean)
  return expanded === undefined ? null : matchGitRule(expanded, [...expandedArgs, ...subcommandArgs])
}

function findBlockedShellString(args) {
  const flagIndex = commandStringIndex(args)
  if (flagIndex === -1 || args[flagIndex + 1] === undefined) return null
  return findBlockedCommand(args[flagIndex + 1])
}

function findBlockedInTokens(tokens) {
  const [program, ...args] = unwrap(tokens)
  if (program === undefined) return null
  const name = path.posix.basename(program)
  if (name === 'git') return findBlockedGit(args)
  if (SHELLS.has(name)) return findBlockedShellString(args)
  if (name === 'eval') return findBlockedCommand(args.join(' '))
  return null
}

function findBlockedCommand(text) {
  const { commands, nested } = new ShellParser(text).parse()
  for (const inner of nested) {
    const blocked = findBlockedCommand(inner)
    if (blocked) return blocked
  }
  for (const tokens of commands) {
    const blocked = findBlockedInTokens(tokens)
    if (blocked) return blocked
  }
  return null
}

function readPayload() {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'))
  if (payload.tool_name !== 'Bash') return null
  const command = payload.tool_input?.command
  if (typeof command !== 'string') throw new AnalysisError('the Bash command is missing or is not a string')
  return command
}

function exitWith(message) {
  fs.writeSync(2, `${message}\n`)
  process.exit(2)
}

function main() {
  let blocked = null
  try {
    const command = readPayload()
    blocked = command === null ? null : findBlockedCommand(command)
  } catch (error) {
    exitWith(`The command could not be analysed (${error.message}), so it is blocked. Rewrite it in a simpler form.`)
  }
  if (blocked) {
    exitWith(`Blocked: ${blocked}. The user runs it themselves. Do not try another form of this command, and ask the user to run it instead.`)
  }
}

main()
