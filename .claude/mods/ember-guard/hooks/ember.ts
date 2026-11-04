import type { EngineInterface } from 'claude-code'

function normalisedRemote(remote: string): string {
  return remote
    .trim()
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(':', '/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

export function isEmberRemote(remote: string | null, emberRemote: string): boolean {
  return remote !== null && normalisedRemote(remote).endsWith(normalisedRemote(emberRemote))
}

export async function isInEmber($: EngineInterface, emberRemote: string): Promise<boolean> {
  const repo = await $.session.repo()
  return repo !== null && isEmberRemote(repo.remote, emberRemote)
}
