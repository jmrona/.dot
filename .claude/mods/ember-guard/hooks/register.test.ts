import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const ROOT = '/home/dev/app'
const WITH_REMOTE = { options: { emberRemote: 'gitlab.example.com/acme/app' } }
const EMBER_REMOTE = 'https://gitlab.example.com/acme/app.git'

type Scene = {
  remote: string | null
  hasRepo?: boolean
  cwd?: string
  symlinks?: Record<string, string>
  missingUnder?: string[]
  topLevels?: Array<[string, string]>
}

const arrange = (on: On, scene: Scene) => {
  const reached = { count: 0 }
  const resolveSymlinks = (path: string) => {
    const link = Object.keys(scene.symlinks ?? {}).find(prefix => path.startsWith(prefix))
    return link === undefined ? path : scene.symlinks![link]! + path.slice(link.length)
  }
  const isMissing = (path: string) => (scene.missingUnder ?? []).some(prefix => path.startsWith(prefix))
  const topLevels = scene.topLevels ?? [[ROOT, ROOT]]
  on('session.repo', () => ({
    value: scene.hasRepo === false ? null : { root: ROOT, remote: scene.remote, internal: false, name: null },
  }))
  on('session.cwd', () => ({ value: scene.cwd ?? ROOT }))
  on('process.run', (_, e) => {
    const top = topLevels.find(([prefix]) => (e.init?.cwd ?? '').startsWith(prefix))
    return {
      value: {
        exitCode: top === undefined ? 128 : 0,
        stdout: top === undefined ? '' : `${top[1]}\n`,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.exists', (_, e) => ({ value: !isMissing(e.path) }))
  on('fs.stat', (_, e) => {
    if (isMissing(e.path)) throw new Error('ENOENT')
    return { value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath: resolveSymlinks(e.path) } }
  })
  on('tool.call', () => {
    reached.count += 1
    return { result: {} }
  })
  return reached
}

const SWITCH_COMMANDS = [
  'just docker use',
  'cd x && just docker up',
  'docker compose up',
  'docker compose -f x up -d',
  '/home/dev/app/scripts/worktree.sh use FEAT-1',
  './worktree.sh up',
]

const GENERATED_FILES = [
  `${ROOT}/api/app/Shared/Proto/Slices/Flexi/V1/Thing.php`,
  `${ROOT}/governor/proto/slices/flexi/v1/types.pb.go`,
  `${ROOT}/platform/src/shared/rpc/slices/flexi/v1/types_pb.ts`,
  `${ROOT}/pods/page-model/src/generated/ember.slices.pods.v1.rs`,
]

for (const command of SWITCH_COMMANDS) {
  test(`stack switch command "${command}" is denied in Ember`, WITH_REMOTE, async ($, on) => {
    const reached = arrange(on, { remote: EMBER_REMOTE })
    const result = await $.tool.call({ tool: 'Bash', command })
    expect(result.deny).toContain('Do not switch the shared stack. Run `just docker which` and tell the user.')
    expect(reached.count).toBe(0)
  })
}

test('the hyphenated docker-compose up is denied in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'docker-compose up -d' })
  expect(result.deny).toContain('Do not switch the shared stack.')
  expect(reached.count).toBe(0)
})

test('docker compose with a quoted flag value before up is denied in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'docker compose --project-directory "my dir" up' })
  expect(result.deny).toContain('Do not switch the shared stack.')
  expect(reached.count).toBe(0)
})

test('just docker which passes through in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call({ tool: 'Bash', command: 'just docker which' })
  expect(reached.count).toBe(1)
})

for (const file_path of GENERATED_FILES) {
  test(`editing generated file ${file_path} is denied in Ember`, WITH_REMOTE, async ($, on) => {
    const reached = arrange(on, { remote: EMBER_REMOTE })
    const result = await $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })
    expect(result.deny).toContain('Generated code. Change `proto/` and run `just proto generate` (or the pods recipe).')
    expect(reached.count).toBe(0)
  })
}

test('writing a generated file is denied in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Write', file_path: GENERATED_FILES[2]!, content: 'x' })
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('editing a notebook under generated code is denied in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({
    tool: 'NotebookEdit',
    notebook_path: `${ROOT}/platform/src/shared/rpc/slices/a.ipynb`,
    new_source: 'x',
  })
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('a symlink that lands in generated code is denied in Ember', WITH_REMOTE, async ($, on) => {
  const link = `${ROOT}/notes/link.ts`
  const reached = arrange(on, {
    remote: EMBER_REMOTE,
    symlinks: { [link]: GENERATED_FILES[2]! },
  })
  const result = await $.tool.call({ tool: 'Write', file_path: link, content: 'x' })
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('editing procedures.ts next to the generated directory passes in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call({
    tool: 'Edit',
    file_path: `${ROOT}/platform/src/shared/rpc/procedures.ts`,
    old_string: 'a',
    new_string: 'b',
  })
  expect(reached.count).toBe(1)
})

for (const command of ['php artisan test', 'cd api && php artisan test --filter=X', 'just api artisan test']) {
  test(`direct test command "${command}" is denied in Ember`, WITH_REMOTE, async ($, on) => {
    const reached = arrange(on, { remote: EMBER_REMOTE })
    const result = await $.tool.call({ tool: 'Bash', command })
    expect(result.deny).toContain('Use `just api test`, which gives each run its own databases.')
    expect(reached.count).toBe(0)
  })
}

test('just api test passes through in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call({ tool: 'Bash', command: 'just api test' })
  expect(reached.count).toBe(1)
})

test('a stack switch passes through in a non-Ember repository', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: 'git@github.com:acme/other.git' })
  await $.tool.call({ tool: 'Bash', command: 'just docker use' })
  expect(reached.count).toBe(1)
})

test('an edit of generated code passes through in a non-Ember repository', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: 'git@github.com:acme/other.git' })
  await $.tool.call({ tool: 'Edit', file_path: GENERATED_FILES[0]!, old_string: 'a', new_string: 'b' })
  expect(reached.count).toBe(1)
})

test('a direct artisan test passes through when the repository has no remote', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: null })
  await $.tool.call({ tool: 'Bash', command: 'php artisan test' })
  expect(reached.count).toBe(1)
})

test('an edit of generated code passes through outside a repository', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: null, hasRepo: false })
  await $.tool.call({ tool: 'Edit', file_path: GENERATED_FILES[0]!, old_string: 'a', new_string: 'b' })
  expect(reached.count).toBe(1)
})

test('a git remote in ssh form is recognised as Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: 'git@gitlab.example.com:acme/app.git' })
  await $.tool.call({ tool: 'Bash', command: 'just docker use' })
  expect(reached.count).toBe(0)
})

test('a remote with a trailing slash is recognised as Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: 'HTTPS://gitlab.example.com/acme/app.git/' })
  await $.tool.call({ tool: 'Bash', command: 'just docker use' })
  expect(reached.count).toBe(0)
})

test('a look-alike host that only ends with the Ember host is not Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: 'https://evil-gitlab.example.com/acme/app.git' })
  await $.tool.call({ tool: 'Bash', command: 'just docker use' })
  expect(reached.count).toBe(1)
})

test('a stack switch on the second line of a multi-line command is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'echo start\njust docker up' })
  expect(result.deny).toContain('Do not switch the shared stack')
  expect(reached.count).toBe(0)
})

test('a stack switch after a background ampersand is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'echo x & just docker up' })
  expect(result.deny).toContain('Do not switch the shared stack')
  expect(reached.count).toBe(0)
})

test('a stack switch behind a sudo wrapper is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'sudo docker compose up' })
  expect(result.deny).toContain('Do not switch the shared stack')
  expect(reached.count).toBe(0)
})

test('a stack switch inside a subshell is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: '(just docker up)' })
  expect(result.deny).toContain('Do not switch the shared stack')
  expect(reached.count).toBe(0)
})

test('a stack switch inside bash -c is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'bash -c "just docker up"' })
  expect(result.deny).toContain('Do not switch the shared stack')
  expect(reached.count).toBe(0)
})

test('a direct artisan test behind the time wrapper is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call({ tool: 'Bash', command: 'time php artisan test' })
  expect(result.deny).toContain('Use `just api test`')
  expect(reached.count).toBe(0)
})

test('docker compose ps passes through in Ember', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call({ tool: 'Bash', command: 'docker compose ps' })
  expect(reached.count).toBe(1)
})

const editing = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' }) as const

test('a relative path that climbs out of notes into generated code is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE, missingUnder: [`${ROOT}/api/app/Shared/Proto/New.php`] })
  const result = await $.tool.call(editing('notes/../api/app/Shared/Proto/New.php'))
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('a relative path that climbs out of generated code passes through', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE, missingUnder: [`${ROOT}/api/app/Shared/Other.php`] })
  await $.tool.call(editing('api/app/Shared/Proto/../Other.php'))
  expect(reached.count).toBe(1)
})

test('a plain relative path into generated code is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  const result = await $.tool.call(editing('governor/proto/slices/x.go'))
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('a directory that only shares a prefix with governor/proto passes through', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call(editing(`${ROOT}/governor/protobuf/x.go`))
  expect(reached.count).toBe(1)
})

test('a directory that only shares a prefix with a generated pods directory passes through', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call(editing(`${ROOT}/pods/page-model/src/generated-notes/y.rs`))
  expect(reached.count).toBe(1)
})

test('an absolute path into generated code of another worktree is denied', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, {
    remote: EMBER_REMOTE,
    topLevels: [['/home/dev/app-worktrees/FEAT-2', '/home/dev/app-worktrees/FEAT-2'], [ROOT, ROOT]],
  })
  const result = await $.tool.call(editing('/home/dev/app-worktrees/FEAT-2/api/app/Shared/Proto/X.php'))
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('a new file under generated code is denied when the session directory is a symlink', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, {
    remote: EMBER_REMOTE,
    cwd: '/link/app',
    symlinks: { '/link/app': ROOT },
    missingUnder: ['/link/app/api/app/Shared/Proto'],
  })
  const result = await $.tool.call({ tool: 'Write', file_path: 'api/app/Shared/Proto/New.php', content: 'x' })
  expect(result.deny).toContain('Generated code.')
  expect(reached.count).toBe(0)
})

test('a path outside any git repository passes through', WITH_REMOTE, async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE, topLevels: [[ROOT, ROOT]] })
  await $.tool.call(editing('/elsewhere/api/app/Shared/Proto/X.php'))
  expect(reached.count).toBe(1)
})

test('a call is denied when the guard itself fails', WITH_REMOTE, async ($, on) => {
  on('session.repo', () => {
    throw new Error('repository lookup failed')
  })
  on('tool.call', () => ({ result: {} }))
  const result = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(result.deny).toContain('its guard failed')
})

test('the mod does nothing when no Ember remote is configured', async ($, on) => {
  const reached = arrange(on, { remote: EMBER_REMOTE })
  await $.tool.call({ tool: 'Bash', command: 'just docker use' })
  await $.tool.call({ tool: 'Edit', file_path: GENERATED_FILES[0]!, old_string: 'a', new_string: 'b' })
  expect(reached.count).toBe(2)
})
