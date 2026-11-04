export type MountedService = { service: string; branch: string; path: string }

export type StackReading = { worktreeRoot: string | null; mounts: MountedService[] }

declare module 'claude-code' {
  interface PluginState {
    'ember-stack': { reading: StackReading }
  }
}
