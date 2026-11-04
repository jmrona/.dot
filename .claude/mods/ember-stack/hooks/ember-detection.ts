function normalise(remote: string): string {
  return remote
    .trim()
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(':', '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

export function isEmberRemote(remote: string | null, emberRemote: string): boolean {
  const expected = normalise(emberRemote)

  return remote !== null && expected !== '' && normalise(remote).endsWith(expected)
}
