export interface StepTokens {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

export interface ModelLimit {
  readonly context: number
  readonly input?: number
  readonly output: number
}

export function contextTokensOf(tokens: StepTokens): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

export function inputLimitOf(limit: ModelLimit): number | undefined {
  const { input, context } = limit
  if (typeof input === 'number' && input > 0) {
    return input
  }
  return context > 0 ? context : undefined
}
