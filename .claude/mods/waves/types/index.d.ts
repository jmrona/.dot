export type AgentStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'

export type WaveAgent = {
  step: number
  agentId: string
  subagentType: string
  model: string
  status: AgentStatus
}

declare module 'claude-code' {
  interface PluginState {
    waves: { agents: Shaped<WaveAgent[]>; step: number }
  }
}
