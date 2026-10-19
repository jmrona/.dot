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

export interface ModeSwitchApi {
  readonly session: {
    get(input: { sessionID: string }): Promise<ModeSwitchSession>
    switchAgent(input: { sessionID: string; agent: string }): Promise<void>
    switchModel(input: { sessionID: string; model: ModeSwitchModel }): Promise<void>
    synthetic(input: { sessionID: string; text: string; resume: boolean }): Promise<void>
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
    return
  }
  let agent: { data: { model: ModeSwitchModel } }
  try {
    agent = await api.agent.get({ agentID: target })
    await api.session.switchAgent({ sessionID, agent: target })
  } catch (error: unknown) {
    await recordNotice(api, sessionID, failureText(target, error))
    return
  }
  try {
    await api.session.switchModel({ sessionID, model: agent.data.model })
  } catch (error: unknown) {
    await recordNotice(api, sessionID, modelFailureText(target, error))
    return
  }
  await recordNotice(api, sessionID, switchNotice(current, target, reason))
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

interface ModeSwitchPlugin {
  readonly id: string
  readonly setup: (api: ModeSwitchApi) => Promise<void>
}

const modeSwitchPlugin: ModeSwitchPlugin = {
  id: 'mode-switch',
  setup: async (api: ModeSwitchApi): Promise<void> => {
    await api.tool.hook('execute.before', (input) => handleToolExecuteBefore(api, input))
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
