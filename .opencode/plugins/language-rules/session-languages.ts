export interface SessionLanguages {
  add(sessionID: string, languages: Iterable<string>): void
  get(sessionID: string): ReadonlySet<string>
  forget(sessionID: string): void
}

export function createSessionLanguages(): SessionLanguages {
  const languagesBySession = new Map<string, Set<string>>()
  return {
    add(sessionID, languages) {
      const known = languagesBySession.get(sessionID) ?? new Set<string>()
      for (const language of languages) known.add(language)
      languagesBySession.set(sessionID, known)
    },
    get(sessionID) {
      return languagesBySession.get(sessionID) ?? new Set<string>()
    },
    forget(sessionID) {
      languagesBySession.delete(sessionID)
    },
  }
}
