import type { MountedService } from '../types'

export function parseWhichOutput(output: string): MountedService[] {
  return output
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .filter(fields => fields.length === 3 && fields[2]?.startsWith('/'))
    .map(([service, branch, path]) => ({
      service: service as string,
      branch: branch as string,
      path: path as string,
    }))
}
