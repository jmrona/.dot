import { loadAutoCompactConfig } from './config.ts'
import { contextTokensOf, inputLimitOf, type ModelLimit, type StepTokens } from './context-usage.ts'

export interface IndicatorData {
  readonly session: {
    get(sessionID: string): unknown
    message: { list(sessionID: string): unknown }
  }
  readonly location: { model: { list(location: unknown): unknown } }
}

interface SessionRecord {
  readonly parentID?: string
  readonly location: unknown
}

interface ModelReference {
  readonly id: string
  readonly providerID: string
}

interface MessageRecord {
  readonly type: string
  readonly tokens?: unknown
}

interface AssistantRecord {
  readonly type: 'assistant'
  readonly model: ModelReference
  readonly tokens: StepTokens
}

interface ModelEntry extends ModelReference {
  readonly limit: ModelLimit
}

const THRESHOLD_KEY_PREFIX = 'auto-compact: ignoring compactAtPercentOfInputLimit in '

export function indicatorLabel(input: {
  contextTokens: number
  limit: number
  percent: number | null
}): string {
  if (input.percent === null) {
    return 'auto-compact off'
  }
  const used = Math.round((input.contextTokens * 100) / input.limit)
  return `auto-compact ${used}/${input.percent}%`
}

export async function readIndicatorState(
  data: IndicatorData,
  sessionID: string | undefined,
  configPath: string,
): Promise<string | undefined> {
  try {
    return await readIndicatorLabel(data, sessionID, configPath)
  } catch {
    return undefined
  }
}

async function readIndicatorLabel(
  data: IndicatorData,
  sessionID: string | undefined,
  configPath: string,
): Promise<string | undefined> {
  if (sessionID === undefined) {
    return undefined
  }
  const session = (await data.session.get(sessionID)) as SessionRecord | undefined
  if (!session || session.parentID !== undefined) {
    return undefined
  }
  const percent = await readThresholdPercent(configPath)
  if (percent === undefined) {
    return undefined
  }
  if (percent === null) {
    return indicatorLabel({ contextTokens: 0, limit: 0, percent: null })
  }
  return readUsageLabel(data, sessionID, session, percent)
}

async function readThresholdPercent(configPath: string): Promise<number | null | undefined> {
  const messages: string[] = []
  const config = await loadAutoCompactConfig(configPath, (message) => messages.push(message))
  if (messages.some((message) => isThresholdProblem(message, configPath))) {
    return undefined
  }
  return config.compactAtPercentOfInputLimit
}

function isThresholdProblem(message: string, configPath: string): boolean {
  return (
    message.startsWith(`auto-compact: ignoring ${configPath}: `) ||
    message.startsWith(THRESHOLD_KEY_PREFIX)
  )
}

async function readUsageLabel(
  data: IndicatorData,
  sessionID: string,
  session: SessionRecord,
  percent: number,
): Promise<string | undefined> {
  const messages = (await data.session.message.list(sessionID)) as readonly MessageRecord[]
  const lastAssistant = messages.findLast(isAssistantWithTokens)
  if (!lastAssistant) {
    return undefined
  }
  const limit = await readInputLimit(data, session.location, lastAssistant.model)
  if (limit === undefined) {
    return undefined
  }
  return indicatorLabel({
    contextTokens: contextTokensOf(lastAssistant.tokens),
    limit,
    percent,
  })
}

function isAssistantWithTokens(message: MessageRecord): message is AssistantRecord {
  return message.type === 'assistant' && message.tokens !== undefined
}

async function readInputLimit(
  data: IndicatorData,
  location: unknown,
  model: ModelReference,
): Promise<number | undefined> {
  const entries = (await data.location.model.list(location)) as readonly ModelEntry[]
  const entry = entries.find(
    (candidate) => candidate.id === model.id && candidate.providerID === model.providerID,
  )
  return entry === undefined ? undefined : inputLimitOf(entry.limit)
}

const INFO_REPLY_PREFIXES = ['Auto-compact threshold ']
const ERROR_REPLY_PREFIXES = ['Use /auto-compact ', 'Could not save the auto-compact threshold']

export interface CommandReply {
  readonly message: string
  readonly variant: 'info' | 'error'
}

export function commandReplyOf(event: unknown, sessionID: string | undefined): CommandReply | undefined {
  if (sessionID === undefined) {
    return undefined
  }
  const record = event as {
    type?: unknown
    data?: { sessionID?: unknown; item?: { type?: unknown; payload?: { text?: unknown } } }
  } | null
  if (record?.type !== 'session.inbox.enqueued' || record.data?.sessionID !== sessionID) {
    return undefined
  }
  const text = record.data.item?.type === 'synthetic' ? record.data.item.payload?.text : undefined
  return typeof text === 'string' ? classifyReply(text) : undefined
}

function classifyReply(text: string): CommandReply | undefined {
  if (ERROR_REPLY_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    return { message: text, variant: 'error' }
  }
  if (INFO_REPLY_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    return { message: text, variant: 'info' }
  }
  return undefined
}
