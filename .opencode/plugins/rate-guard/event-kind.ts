export interface OpencodeEvent {
  readonly type: string
  readonly data: { readonly sessionID?: string; readonly id?: string }
}

export type EventKind =
  | { readonly kind: 'executionEnded'; readonly sessionID: string; readonly wasInterrupted: boolean }
  | { readonly kind: 'toolFailed'; readonly callID: string }
  | { readonly kind: 'sessionDeleted'; readonly sessionID: string }
  | { readonly kind: 'ignored' }

const IGNORED: EventKind = { kind: 'ignored' }

export function classifyEvent(event: OpencodeEvent): EventKind {
  const { sessionID, id } = event.data
  if (event.type === 'session.tool.failed') {
    return id === undefined ? IGNORED : { kind: 'toolFailed', callID: id }
  }
  if (event.type === 'session.deleted') {
    return sessionID === undefined ? IGNORED : { kind: 'sessionDeleted', sessionID }
  }
  if (sessionID === undefined || !event.type.startsWith('session.execution.')) {
    return IGNORED
  }
  const outcome = event.type.slice('session.execution.'.length)
  if (outcome === 'succeeded' || outcome === 'failed' || outcome === 'interrupted') {
    return { kind: 'executionEnded', sessionID, wasInterrupted: outcome === 'interrupted' }
  }
  return IGNORED
}
