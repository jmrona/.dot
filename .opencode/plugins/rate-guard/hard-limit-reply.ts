export interface HardLimitReply {
  readonly message: string
  readonly variant: 'info' | 'error'
}

const ERROR_REPLY_PREFIXES = [
  'Could not save the hard subagent limit',
  'Use /hard-limit to show the limit',
]

const INFO_REPLY_PATTERN = /^At most \d+ openai\/hard subagents/

export function hardLimitReplyOf(
  event: unknown,
  sessionID: string | undefined,
): HardLimitReply | undefined {
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

function classifyReply(text: string): HardLimitReply | undefined {
  if (ERROR_REPLY_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    return { message: text, variant: 'error' }
  }
  if (INFO_REPLY_PATTERN.test(text)) {
    return { message: text, variant: 'info' }
  }
  return undefined
}
