import type { MountedService } from '../types'

const ADVICE = 'No pruebes en el navegador ni con docker compose exec.'

function groupByMount(mounts: MountedService[]): Map<string, MountedService[]> {
  const groups = new Map<string, MountedService[]>()
  for (const mount of mounts) {
    const key = `${mount.path}\n${mount.branch}`
    groups.set(key, [...(groups.get(key) ?? []), mount])
  }

  return groups
}

function withoutTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, '')
}

export function describeForeignMounts(mounts: MountedService[], worktreeRoot: string): string[] {
  const foreign = mounts.filter(
    mount => withoutTrailingSlashes(mount.path) !== withoutTrailingSlashes(worktreeRoot),
  )
  const sentences = [...groupByMount(foreign).values()].map(group => {
    const [first] = group as [MountedService]
    const services = group.map(mount => mount.service).join(', ')

    return `Stack: ${services} montan ${first.path} (${first.branch}). Esta sesión está en ${worktreeRoot}.`
  })

  return sentences.length === 0 ? [] : [...sentences, ADVICE]
}
