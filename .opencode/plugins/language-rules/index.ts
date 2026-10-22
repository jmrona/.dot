import { fileURLToPath } from 'node:url'

import { extractReferences, type ConversationMessage } from './tool-references.ts'
import { loadLanguageRules, type LanguageRules } from './rule-loader.ts'
import { selectRuleTexts } from './select-rules.ts'

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

export interface LanguageRulesApi {
  readonly session: {
    hook(name: 'context', handler: (event: ContextEvent) => Promise<void>): Promise<void>
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

function injectMatchingRules(rules: readonly LanguageRules[], event: ContextEvent): void {
  try {
    const references = extractReferences(event.messages)
    for (const text of selectRuleTexts(rules, references)) {
      event.system.push({ type: 'text', text })
    }
  } catch (error) {
    console.warn(`language-rules: could not inject rules: ${String(error)}`)
  }
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
      await api.session.hook('context', async (event) => {
        injectMatchingRules(rules, event)
      })
    },
  }
}

export default createLanguageRules(RULES_DIRECTORY)
