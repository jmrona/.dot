export type AgentStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'

export type WaveAgent = {
  waveKey: string
  agentId: string
  description: string
  model: string
  status: AgentStatus
  startedAt: number
  finishedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    waves: { agents: Shaped<WaveAgent[]>; step: number }
  }
}
