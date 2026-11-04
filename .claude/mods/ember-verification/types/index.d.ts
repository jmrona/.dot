export type Pillar = 'api' | 'governor' | 'platform' | 'pods' | 'proto'

export type Outcome = 'pass' | 'fail'

export type Run = { at: number; outcome: Outcome; isPartial: boolean }

export type PillarRecord = { editedAt: number | null; check: Run | null; test: Run | null }

export type VerificationState = {
  pillars: Partial<Record<Pillar, PillarRecord>>
  evalsEditedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'ember-verification': { verification: VerificationState; branchHeader: string | null }
  }
}
