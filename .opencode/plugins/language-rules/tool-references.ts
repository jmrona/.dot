const PATH_FIELDS: readonly string[] = ['path', 'filePath', 'file_path']
const PATTERN_FIELDS: readonly string[] = ['include', 'glob', 'pattern']
const PATCH_FILE_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/

export interface ConversationPart {
  readonly type: string
  readonly name?: string
  readonly input?: unknown
  readonly text?: string
}

export interface ConversationMessage {
  readonly role: string
  readonly content: readonly ConversationPart[] | string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringFields(input: Record<string, unknown>, names: readonly string[]): string[] {
  return names.flatMap((name) => {
    const value = input[name]
    return typeof value === 'string' && value.length > 0 ? [value] : []
  })
}

function patchHeaders(input: Record<string, unknown>): string[] {
  return Object.values(input)
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split('\n'))
    .flatMap((line) => {
      const header = PATCH_FILE_HEADER.exec(line.trim())
      return header === null ? [] : [header[1].trim()]
    })
}

function referencesOfInput(input: unknown): string[] {
  if (!isRecord(input)) return []
  return [
    ...stringFields(input, PATH_FIELDS),
    ...stringFields(input, PATTERN_FIELDS),
    ...patchHeaders(input),
  ]
}

export function extractReferences(messages: readonly ConversationMessage[]): string[] {
  return messages
    .filter((message) => message.role === 'assistant' && Array.isArray(message.content))
    .flatMap((message) => message.content as readonly ConversationPart[])
    .filter((part) => part.type === 'tool-call')
    .flatMap((part) => referencesOfInput(part.input))
}
