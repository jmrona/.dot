import type { EngineInterface, Register } from 'claude-code'
import { runsTestsDirectly, switchesSharedStack } from './bash-rules'
import { isInEmber } from './ember'
import { isGeneratedPath } from './generated-paths'

const STACK_DENIAL = 'Do not switch the shared stack. Run `just docker which` and tell the user.'
const GENERATED_DENIAL = 'Generated code. Change `proto/` and run `just proto generate` (or the pods recipe).'
const DIRECT_TEST_DENIAL = 'Use `just api test`, which gives each run its own databases.'

type Denial = { deny: string }

function denyFailedGuard<Event, Answer>(
  $: EngineInterface,
  e: Event,
  next: ((e: Event) => Answer) & { called: boolean },
): Answer | Denial {
  return next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` }
}

async function commandDenial($: EngineInterface, emberRemote: string, command: string): Promise<Denial | undefined> {
  if (!(await isInEmber($, emberRemote))) return undefined
  if (switchesSharedStack(command)) return { deny: STACK_DENIAL }
  if (runsTestsDirectly(command)) return { deny: DIRECT_TEST_DENIAL }
  return undefined
}

async function generatedPathDenial($: EngineInterface, emberRemote: string, path: string): Promise<Denial | undefined> {
  const isGenerated = (await isInEmber($, emberRemote)) && (await isGeneratedPath($, path))
  return isGenerated ? { deny: GENERATED_DENIAL } : undefined
}

export const register: Register = (on, options) => {
  const emberRemote = options.emberRemote
  if (typeof emberRemote !== 'string' || emberRemote.trim() === '') return

  on('tool.call', { tool: 'Bash' }, async ($, e, next) =>
    (await commandDenial($, emberRemote, e.command)) ?? next(e),
  ).catch(denyFailedGuard)

  on('tool.call', { tool: 'Edit' }, async ($, e, next) =>
    (await generatedPathDenial($, emberRemote, e.file_path)) ?? next(e),
  ).catch(denyFailedGuard)

  on('tool.call', { tool: 'Write' }, async ($, e, next) =>
    (await generatedPathDenial($, emberRemote, e.file_path)) ?? next(e),
  ).catch(denyFailedGuard)

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) =>
    (await generatedPathDenial($, emberRemote, e.notebook_path)) ?? next(e),
  ).catch(denyFailedGuard)
}
