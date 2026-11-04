function normaliseRemote(remote: string): string {
  return remote
    .trim()
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(':', '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

export function isEmberRemote(remote: string | null, emberRemote: string): boolean {
  const expected = normaliseRemote(emberRemote)
  if (remote === null || expected === '') return false
  const actual = normaliseRemote(remote)

  return actual === expected || actual.endsWith(`/${expected}`)
}
