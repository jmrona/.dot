import type { EngineInterface } from 'claude-code'

const GENERATED_DIRECTORIES = [
  'api/app/Shared/Proto/',
  'governor/proto/',
  'platform/src/shared/rpc/slices/',
]
const GENERATED_PODS_CRATE_DIRECTORY = /^pods\/[^/]+\/src\/generated\//

type LocatedPath = { real: string; directoryForGit: string }

function normalised(path: string): string {
  const kept: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '..') kept.pop()
    else if (segment !== '' && segment !== '.') kept.push(segment)
  }
  return `/${kept.join('/')}`
}

function parentOf(path: string): string {
  return normalised(`${path}/..`)
}

function absoluteFrom(cwd: string, path: string): string {
  return normalised(path.startsWith('/') ? path : `${cwd}/${path}`)
}

async function realPathOf($: EngineInterface, path: string): Promise<string> {
  const stat = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
  return stat?.realPath ?? path
}

async function nearestExisting($: EngineInterface, path: string): Promise<string> {
  let candidate = path
  while (candidate !== '/' && !(await $.fs.exists(candidate))) candidate = parentOf(candidate)
  return candidate
}

function withoutTrailingSlash(path: string): string {
  return path === '/' ? '' : path
}

async function locate($: EngineInterface, path: string): Promise<LocatedPath> {
  const existing = await nearestExisting($, path)
  const realExisting = await realPathOf($, existing)
  const tail = path.slice(withoutTrailingSlash(existing).length)
  return {
    real: `${withoutTrailingSlash(realExisting)}${tail}`,
    directoryForGit: existing === path ? parentOf(realExisting) : realExisting,
  }
}

async function topLevelIn($: EngineInterface, directory: string): Promise<string | undefined> {
  const ran = await $.process
    .run(['git', 'rev-parse', '--show-toplevel'], { cwd: directory })
    .catch(() => undefined)
  const topLevel = ran?.exitCode === 0 ? ran.stdout.trim() : ''
  return topLevel === '' ? undefined : normalised(await realPathOf($, topLevel))
}

async function worktreeRootFor($: EngineInterface, directoryForGit: string, cwd: string): Promise<string> {
  const root = (await topLevelIn($, directoryForGit)) ?? (await topLevelIn($, cwd))
  if (root === undefined) throw new Error(`No git top level found for ${directoryForGit} or ${cwd}.`)
  return root
}

function isGeneratedRelativePath(relative: string): boolean {
  return (
    GENERATED_DIRECTORIES.some(directory => relative.startsWith(directory)) ||
    GENERATED_PODS_CRATE_DIRECTORY.test(relative)
  )
}

export async function isGeneratedPath($: EngineInterface, path: string): Promise<boolean> {
  const cwd = normalised(await realPathOf($, normalised(await $.session.cwd())))
  const { real, directoryForGit } = await locate($, absoluteFrom(cwd, path))
  const root = await worktreeRootFor($, directoryForGit, cwd)
  return real.startsWith(`${root}/`) && isGeneratedRelativePath(real.slice(root.length + 1))
}
