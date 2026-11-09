import { execFile, spawn } from 'node:child_process'

export const OUTPUT_TAIL_LINES = 40
export interface GateInput { readonly directory: string; readonly baseSha: string; readonly proofCommands: readonly string[]; readonly proofTimeoutSeconds: number; readonly attributablePaths: readonly string[] }
export interface GateCommandResult { readonly command: string; readonly exitCode: number | null; readonly outputTail: string; readonly reason?: 'environment-timeout' }
export interface GateResult { readonly passed: boolean; readonly headMoved: boolean; readonly headSha: string; readonly commands: readonly GateCommandResult[]; readonly changedPaths: readonly string[]; readonly unattributed: readonly string[] }

interface CommandRun {
  readonly exitCode: number | null
  readonly output: string
  readonly timedOut: boolean
}

function lastLines(output: string): string {
  return output.split('\n').slice(-OUTPUT_TAIL_LINES - 1).join('\n').trimEnd()
}

function terminateProcessGroup(pid: number | undefined, chunks: Buffer[]): void {
  if (pid === undefined) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') chunks.push(Buffer.from(`${(error as Error).message}\n`))
  }
}

function runOnce(command: string, directory: string, timeoutSeconds: number): Promise<CommandRun> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd: directory, detached: true })
    const chunks: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      terminateProcessGroup(child.pid, chunks)
    }, timeoutSeconds * 1000)
    child.on('error', (error) => chunks.push(Buffer.from(`${error.message}\n`)))
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({ exitCode, output: Buffer.concat(chunks).toString('utf8'), timedOut })
    })
  })
}

async function runProofCommand(command: string, directory: string, timeoutSeconds: number): Promise<GateCommandResult> {
  let run = await runOnce(command, directory, timeoutSeconds)
  if (run.timedOut) run = await runOnce(command, directory, timeoutSeconds)
  const outputTail = lastLines(run.output)
  if (run.timedOut) return { command, exitCode: null, outputTail, reason: 'environment-timeout' }
  return { command, exitCode: run.exitCode, outputTail }
}

function git(directory: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error(`git ${args.join(' ')} failed in ${directory}: ${error.message}. Check that the directory is a git repository.`))
      else resolve(stdout)
    })
  })
}

function bareChangedPath(statusLine: string): string {
  const withoutStatus = statusLine.slice(3)
  return withoutStatus.includes(' -> ') ? withoutStatus.split(' -> ').pop()! : withoutStatus
}

export async function runGate(input: GateInput): Promise<GateResult> {
  const commands: GateCommandResult[] = []
  for (const command of input.proofCommands) {
    commands.push(await runProofCommand(command, input.directory, input.proofTimeoutSeconds))
  }
  const headSha = (await git(input.directory, ['rev-parse', 'HEAD'])).trim()
  const status = await git(input.directory, ['status', '--porcelain', '-uall'])
  const changedPaths = status.split('\n').filter((line) => line !== '').map(bareChangedPath)
  const attributable = new Set(input.attributablePaths)
  const unattributed = changedPaths.filter((changedPath) => !attributable.has(changedPath))
  const headMoved = headSha !== input.baseSha
  const passed = !headMoved && commands.every((entry) => entry.exitCode === 0) && unattributed.length === 0
  return { passed, headMoved, headSha, commands, changedPaths, unattributed }
}
