import { parseLimitArgument, saveLimit } from './command.ts'
import { SAVE_FAILURE_PREFIX, setLimitText, showLimitText, USAGE_TEXT } from './reply-texts.ts'
import type { SlotSemaphore } from './semaphore.ts'

export interface LimitInvocation {
  readonly sessionID: string
  readonly prompt: { readonly text: string }
}

export interface LimitCommandDependencies {
  readonly semaphore: SlotSemaphore
  readonly configPath: string
  readonly notify: (sessionID: string, text: string) => Promise<void>
}

export const LIMIT_COMMAND_DESCRIPTION =
  'Show or set how many openai/hard subagents run at once (only openai/hard subagents are limited): /hard-limit [1-10]'

export function createLimitCommand(
  dependencies: LimitCommandDependencies,
): (invocation: LimitInvocation) => Promise<void> {
  const { semaphore, configPath, notify } = dependencies
  return async (invocation) => {
    const argument = parseLimitArgument(invocation.prompt.text)
    if (argument.kind === 'show') {
      await notify(invocation.sessionID, showLimitText(semaphore.limit()))
    } else if (argument.kind === 'invalid') {
      await notify(invocation.sessionID, USAGE_TEXT)
    } else {
      await changeLimit(dependencies, invocation.sessionID, argument.limit)
    }
  }
}

async function changeLimit(
  dependencies: LimitCommandDependencies,
  sessionID: string,
  limit: number,
): Promise<void> {
  try {
    await saveLimit(dependencies.configPath, limit)
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    await dependencies.notify(
      sessionID,
      `${SAVE_FAILURE_PREFIX}: ${reason}. The limit is unchanged.`,
    )
    return
  }
  dependencies.semaphore.setLimit(limit)
  await dependencies.notify(sessionID, setLimitText(limit))
}
