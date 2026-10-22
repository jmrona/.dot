const DESIGN_SKILL_IDS: readonly string[] = [
  'brainstorming',
  'brainstorming-standard',
  'brainstorming-committee',
  'brainstorming-skip',
  'work-on-ticket',
]

const IMPLEMENTATION_SKILL_IDS: readonly string[] = [
  'subagent-driven-development',
  'fast-path-implementation',
]

export interface ModeSwitchModel {
  readonly id: string
  readonly providerID: string
}

export interface ModeSwitchSession {
  readonly id: string
  readonly parentID?: string
}

export interface ToolExecuteBeforeInput {
  readonly tool: string
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly input: unknown
}

export interface ContextEvent {
  readonly agent: string
  readonly sessionID: string
  readonly system: { type: 'text'; text: string }[]
}

export const DESIGN_ROOT_INSTRUCTION =
  'You are the design root on openai/hard. You author design content yourself: design questions, alternatives, sections, the committee agenda, summaries and design revisions. Do not delegate them to stack-planner.'

export interface ModeSwitchApi {
  readonly session: {
    get(input: { sessionID: string }): Promise<ModeSwitchSession>
    switchAgent(input: { sessionID: string; agent: string }): Promise<void>
    switchModel(input: { sessionID: string; model: ModeSwitchModel }): Promise<void>
    synthetic(input: { sessionID: string; text: string; resume: boolean }): Promise<void>
    hook(
      name: 'context',
      handler: (event: ContextEvent) => Promise<void>,
    ): Promise<void>
  }
  readonly agent: {
    get(input: { agentID: string }): Promise<{ data: { model: ModeSwitchModel } }>
  }
  readonly tool: {
    hook(
      name: 'execute.before',
      handler: (input: ToolExecuteBeforeInput) => Promise<void>,
    ): Promise<void>
  }
}

export async function applySwitch(
  api: ModeSwitchApi,
  sessionID: string,
  current: string,
  target: string,
  reason: string,
): Promise<void> {
  if (current === target) {
    await applyTargetModel(api, sessionID, target)
    return
  }
  let agent: TargetAgent
  try {
    agent = await api.agent.get({ agentID: target })
    await api.session.switchAgent({ sessionID, agent: target })
  } catch (error: unknown) {
    await recordNotice(api, sessionID, failureText(target, error))
    return
  }
  if (await trySwitchModel(api, sessionID, target, agent)) {
    await recordNotice(api, sessionID, switchNotice(current, target, reason))
  }
}

interface TargetAgent {
  readonly data: { readonly model: ModeSwitchModel }
}

async function applyTargetModel(
  api: ModeSwitchApi,
  sessionID: string,
  target: string,
): Promise<void> {
  let agent: TargetAgent
  try {
    agent = await api.agent.get({ agentID: target })
  } catch (error: unknown) {
    await recordNotice(api, sessionID, failureText(target, error))
    return
  }
  await trySwitchModel(api, sessionID, target, agent)
}

async function trySwitchModel(
  api: ModeSwitchApi,
  sessionID: string,
  target: string,
  agent: TargetAgent,
): Promise<boolean> {
  try {
    await api.session.switchModel({ sessionID, model: agent.data.model })
    return true
  } catch (error: unknown) {
    await recordNotice(api, sessionID, modelFailureText(target, error))
    return false
  }
}

async function recordNotice(api: ModeSwitchApi, sessionID: string, text: string): Promise<void> {
  try {
    await api.session.synthetic({ sessionID, text, resume: false })
  } catch {
    return
  }
}

function failureText(target: string, error: unknown): string {
  return `Mode switch to ${target.toUpperCase()} failed: ${errorMessage(error)}. Press Tab to switch manually.`
}

function modelFailureText(target: string, error: unknown): string {
  return `Switched to ${target.toUpperCase()} but its model could not be set: ${errorMessage(error)}. Press Tab to switch manually.`
}

export async function handleToolExecuteBefore(
  api: ModeSwitchApi,
  input: ToolExecuteBeforeInput,
): Promise<void> {
  const skillId = skillIdOf(input.input)
  if (input.tool !== 'skill' || skillId === undefined) {
    return
  }
  const target = targetAgentForSkill(skillId)
  if (target === undefined) {
    return
  }
  const session = await readSessionOrNull(api, input.sessionID)
  if (session === null || session.parentID !== undefined) {
    return
  }
  await applySwitch(api, input.sessionID, input.agent, target, skillId)
}

async function readSessionOrNull(
  api: ModeSwitchApi,
  sessionID: string,
): Promise<ModeSwitchSession | null> {
  try {
    return await api.session.get({ sessionID })
  } catch {
    return null
  }
}

export async function handleContext(api: ModeSwitchApi, event: ContextEvent): Promise<void> {
  if (event.agent !== 'plan') {
    return
  }
  const session = await readSessionOrNull(api, event.sessionID)
  if (session === null || session.parentID !== undefined) {
    return
  }
  event.system.push({ type: 'text', text: DESIGN_ROOT_INSTRUCTION })
}

interface ModeSwitchPlugin {
  readonly id: string
  readonly setup: (api: ModeSwitchApi) => Promise<void>
}

const modeSwitchPlugin: ModeSwitchPlugin = {
  id: 'mode-switch',
  setup: async (api: ModeSwitchApi): Promise<void> => {
    await api.tool.hook('execute.before', (input) => handleToolExecuteBefore(api, input))
    await api.session.hook('context', (event) => handleContext(api, event))
  },
}

export default modeSwitchPlugin

function skillIdOf(skillInput: unknown): string | undefined {
  if (typeof skillInput === 'object' && skillInput !== null && 'id' in skillInput) {
    return typeof skillInput.id === 'string' ? skillInput.id : undefined
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function switchNotice(from: string, to: string, reason: string): string {
  return `${from.toUpperCase()} -> ${to.toUpperCase()} (${reason})`
}

export function targetAgentForSkill(skillId: string): 'plan' | 'build' | undefined {
  if (DESIGN_SKILL_IDS.includes(skillId)) {
    return 'plan'
  }
  if (IMPLEMENTATION_SKILL_IDS.includes(skillId)) {
    return 'build'
  }
  return undefined
}
