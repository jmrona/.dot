import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { createLanguageRules, type ContextEvent, type LanguageRulesApi } from './index.ts'

async function createRulesDirectory(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'language-rules-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeLanguage(root, 'go', ['**/*.go'], 'GO RULES')
  await writeLanguage(root, 'php', ['**/*.php'], 'PHP RULES')
  await writeLanguage(root, 'typescript', ['**/*.ts'], 'TS RULES')
  return root
}

async function writeLanguage(
  root: string,
  language: string,
  globs: string[],
  body: string,
): Promise<void> {
  await mkdir(join(root, language), { recursive: true })
  await writeFile(join(root, language, 'coding-style.md'), `---\nglobs: ${globs.join(', ')}\n---\n${body}`)
}

async function registerPlugin(root: string): Promise<(event: ContextEvent) => Promise<void>> {
  let handler: ((event: ContextEvent) => Promise<void>) | undefined
  const api: LanguageRulesApi = {
    session: {
      async hook(name, registered) {
        assert.equal(name, 'context')
        handler = registered
      },
    },
  }
  await createLanguageRules(root).setup(api)
  assert.ok(handler)
  return handler
}

function eventWithCalls(...calls: Array<{ name: string; input: unknown }>): ContextEvent {
  return {
    sessionID: 's1',
    system: [],
    messages: [
      {
        role: 'assistant',
        content: calls.map((call, index) => ({ type: 'tool-call', id: `c${index}`, ...call })),
      },
    ],
  }
}

function systemTexts(event: ContextEvent): string[] {
  return event.system.map((part) => part.text)
}

test('injects the rules of a language the session has read a file of', async (t) => {
  const handler = await registerPlugin(await createRulesDirectory(t))
  const event = eventWithCalls({ name: 'read', input: { path: '/repo/main.go' } })

  await handler(event)

  assert.equal(systemTexts(event).length, 1)
  assert.match(systemTexts(event)[0] ?? '', /GO RULES/)
})

test('injects nothing when the session touched only unrelated files', async (t) => {
  const handler = await registerPlugin(await createRulesDirectory(t))
  const event = eventWithCalls({ name: 'read', input: { path: '/repo/README.md' } })

  await handler(event)

  assert.deepEqual(systemTexts(event), [])
})

test('injects one part per matched language in a stable order', async (t) => {
  const handler = await registerPlugin(await createRulesDirectory(t))
  const event = eventWithCalls(
    { name: 'edit', input: { filePath: '/repo/a.ts' } },
    { name: 'write', input: { file_path: '/repo/b.php' } },
    { name: 'read', input: { path: '/repo/c.php' } },
  )

  await handler(event)

  assert.match(systemTexts(event)[0] ?? '', /PHP RULES/)
  assert.match(systemTexts(event)[1] ?? '', /TS RULES/)
  assert.equal(systemTexts(event).length, 2)
})

test('injects the rules for a grep include pattern', async (t) => {
  const handler = await registerPlugin(await createRulesDirectory(t))
  const event = eventWithCalls({ name: 'grep', input: { pattern: 'main', include: '*.go' } })

  await handler(event)

  assert.match(systemTexts(event)[0] ?? '', /GO RULES/)
})

test('injects the rules again on every model call', async (t) => {
  const handler = await registerPlugin(await createRulesDirectory(t))
  const first = eventWithCalls({ name: 'read', input: { path: '/repo/main.go' } })
  const second = eventWithCalls({ name: 'read', input: { path: '/repo/main.go' } })

  await handler(first)
  await handler(second)

  assert.equal(systemTexts(second).length, 1)
})

test('injects nothing when the rules directory cannot be read', async () => {
  const handler = await registerPlugin('/nonexistent/language-rules-fixture')
  const event = eventWithCalls({ name: 'read', input: { path: '/repo/main.go' } })

  await handler(event)

  assert.deepEqual(systemTexts(event), [])
})
