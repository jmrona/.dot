import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { loadLanguageRules } from './rule-loader.ts'

async function createRulesDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'language-rules-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function writeRule(root: string, language: string, name: string, text: string): Promise<void> {
  await mkdir(join(root, language), { recursive: true })
  await writeFile(join(root, language, name), text)
}

test('groups rule texts and globs by language', async (t) => {
  const root = await createRulesDirectory(t)
  await writeRule(root, 'go', 'testing.md', '---\nglobs: **/*_test.go\n---\nTESTING')
  await writeRule(root, 'go', 'coding-style.md', '---\nglobs: **/*.go\n---\nSTYLE')

  const rules = await loadLanguageRules(root, ['go'])

  assert.deepEqual(rules, [
    {
      language: 'go',
      globs: ['**/*.go', '**/*_test.go'],
      texts: ['---\nglobs: **/*.go\n---\nSTYLE', '---\nglobs: **/*_test.go\n---\nTESTING'],
    },
  ])
})

test('skips a rule file without globs and warns with its name', async (t) => {
  const root = await createRulesDirectory(t)
  await writeRule(root, 'php', 'broken.md', 'no frontmatter')
  await writeRule(root, 'php', 'ok.md', '---\nglobs: **/*.php\n---\nOK')
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: string) => warnings.push(message))

  const rules = await loadLanguageRules(root, ['php'])

  assert.deepEqual(rules[0]?.texts, ['---\nglobs: **/*.php\n---\nOK'])
  assert.ok(warnings.some((warning) => warning.includes('broken.md')))
})

test('skips an unreadable rule file and warns with its name', async (t) => {
  const root = await createRulesDirectory(t)
  await mkdir(join(root, 'rust', 'unreadable.md'), { recursive: true })
  await writeRule(root, 'rust', 'ok.md', '---\nglobs: **/*.rs\n---\nOK')
  const warnings: string[] = []
  t.mock.method(console, 'warn', (message: string) => warnings.push(message))

  const rules = await loadLanguageRules(root, ['rust'])

  assert.deepEqual(rules[0]?.texts, ['---\nglobs: **/*.rs\n---\nOK'])
  assert.ok(warnings.some((warning) => warning.includes('unreadable.md')))
})

test('omits a language whose directory is missing', async (t) => {
  const root = await createRulesDirectory(t)

  assert.deepEqual(await loadLanguageRules(root, ['python']), [])
})
