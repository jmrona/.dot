export interface GitResult {
  readonly exitCode: number
  readonly stdout: string
}

export type RunGit = (args: readonly string[]) => Promise<GitResult>
