export type EvalTally = { full: number; filtered: number; allowance: number }

declare module 'claude-code' {
  interface PluginState {
    'ember-evals-budget': { tally: Shaped<EvalTally> }
  }
}
