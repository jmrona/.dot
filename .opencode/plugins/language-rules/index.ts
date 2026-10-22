import { fileURLToPath } from 'node:url'

import { extractReferences, type ConversationMessage } from './tool-references.ts'
import { loadLanguageRules, type LanguageRules } from './rule-loader.ts'
import { matchedLanguages, renderRuleTexts } from './select-rules.ts'
import { createSessionLanguages, type SessionLanguages } from './session-languages.ts'

const LANGUAGES: readonly string[] = ['go', 'javascript', 'php', 'python', 'rust', 'typescript']
const RULES_DIRECTORY = fileURLToPath(new URL('../../rules/', import.meta.url))

export interface SystemPart {
  readonly type: string
  readonly text: string
}

export interface ContextEvent {
  readonly sessionID: string
  readonly system: SystemPart[]
  readonly messages: readonly ConversationMessage[]
}

export interface SessionEvent {
  readonly type: string
  readonly data?: { readonly sessionID?: string }
}

export interface LanguageRulesApi {
  readonly session: {
    hook(name: 'context', handler: (event: ContextEvent) => Promise<void>): Promise<void>
  }
  readonly event: {
    subscribe(input: { signal: AbortSignal }): AsyncIterable<SessionEvent>
  }
}

async function loadSafely(rulesDirectory: string): Promise<LanguageRules[]> {
  try {
    return await loadLanguageRules(rulesDirectory, LANGUAGES)
  } catch (error) {
    console.warn(`language-rules: could not load rules from ${rulesDirectory}: ${String(error)}`)
    return []
  }
}

function injectRememberedRules(
  rules: readonly LanguageRules[],
  sessionLanguages: SessionLanguages,
  event: ContextEvent,
): void {
  try {
    const references = extractReferences(event.messages)
    sessionLanguages.add(event.sessionID, matchedLanguages(rules, references))
    const texts = renderRuleTexts(rules, sessionLanguages.get(event.sessionID))
    for (const text of texts) {
      event.system.push({ type: 'text', text })
    }
  } catch (error) {
    console.warn(`language-rules: could not inject rules: ${String(error)}`)
  }
}

async function forgetDeletedSessions(
  api: LanguageRulesApi,
  sessionLanguages: SessionLanguages,
): Promise<void> {
  let reason = 'the stream ended'
  try {
    for await (const event of api.event.subscribe({ signal: new AbortController().signal })) {
      const sessionID = event.data?.sessionID
      if (event.type === 'session.deleted' && sessionID) sessionLanguages.forget(sessionID)
    }
  } catch (error: unknown) {
    reason = error instanceof Error ? error.message : String(error)
  }
  console.warn(
    `language-rules: the event stream stopped (${reason}). Sessions will no longer be forgotten.`,
  )
}

export interface LanguageRulesPlugin {
  readonly id: string
  setup(api: LanguageRulesApi): Promise<void>
}

export function createLanguageRules(rulesDirectory: string): LanguageRulesPlugin {
  return {
    id: 'language-rules',
    async setup(api: LanguageRulesApi): Promise<void> {
      const rules = await loadSafely(rulesDirectory)
      const sessionLanguages = createSessionLanguages()
      await api.session.hook('context', async (event) => {
        injectRememberedRules(rules, sessionLanguages, event)
      })
      void forgetDeletedSessions(api, sessionLanguages)
    },
  }
}

export default createLanguageRules(RULES_DIRECTORY)
