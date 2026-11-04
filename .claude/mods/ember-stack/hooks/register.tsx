import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { StackReading } from '../types'
import { isEmberRemote } from './ember-detection'
import { parseWhichOutput } from './which-output'
import { describeForeignMounts } from './warning-text'

type Engine = Parameters<Hook<'session.start'>>[0]

const reading = atom({ plugin: 'ember-stack', key: 'reading' } as const, {
  worktreeRoot: null,
  mounts: [],
} as StackReading)

const COMMAND = 'stack'
const MENTIONS_STACK = /docker|worktree\.sh/

async function isEmber($: Engine, emberRemote: string): Promise<boolean> {
  const repo = await $.session.repo()

  return repo !== null && isEmberRemote(repo.remote, emberRemote)
}

async function readStack($: Engine): Promise<StackReading> {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
  if (top.exitCode !== 0) {
    throw new Error(`git rev-parse --show-toplevel exited with ${top.exitCode}: ${top.stderr.trim()}`)
  }
  const worktreeRoot = top.stdout.trim()
  const which = await $.process.run(['just', 'docker', 'which'], { cwd: worktreeRoot })
  if (which.exitCode !== 0) {
    throw new Error(`just docker which exited with ${which.exitCode}: ${which.stderr.trim()}`)
  }

  return { worktreeRoot, mounts: parseWhichOutput(which.stdout) }
}

async function refresh($: Engine, emberRemote: string): Promise<void> {
  try {
    if (!(await isEmber($, emberRemote))) {
      return
    }
    const stack = await readStack($)
    await update($, reading, () => stack)
  } catch (error) {
    await update($, reading, () => ({ worktreeRoot: null, mounts: [] }))
    $.ui.log(`could not read the stack. ${String(error)}`)
  }
}

export const register: Register = (on, options) => {
  const emberRemote = typeof options.emberRemote === 'string' ? options.emberRemote.trim() : ''
  if (emberRemote === '') {
    return
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Refresh the Ember stack warning' })
    await refresh($, emberRemote)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($, emberRemote)

    return { text: 'Stack refreshed.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (MENTIONS_STACK.test(e.command)) {
      await refresh($, emberRemote)
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { worktreeRoot, mounts } = await read($, reading)
    const lines = worktreeRoot === null ? [] : describeForeignMounts(mounts, worktreeRoot)
    if (lines.length === 0) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text key={line} color="yellow">{line}</Text>
        ))}
      </Box>
    )
  })
}
