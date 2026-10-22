import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractReferences, type ConversationMessage } from './tool-references.ts'

function toolCall(name: string, input: unknown): ConversationMessage {
  return { role: 'assistant', content: [{ type: 'tool-call', id: 'call-1', name, input }] }
}

test('extracts the path of a read call', () => {
  assert.deepEqual(extractReferences([toolCall('read', { path: '/repo/a.go' })]), ['/repo/a.go'])
})

test('extracts the filePath of an edit call', () => {
  assert.deepEqual(extractReferences([toolCall('edit', { filePath: '/repo/a.rs' })]), ['/repo/a.rs'])
})

test('extracts the file_path of a write call', () => {
  assert.deepEqual(extractReferences([toolCall('write', { file_path: '/repo/a.py' })]), ['/repo/a.py'])
})

test('extracts the include pattern of a grep call', () => {
  const references = extractReferences([toolCall('grep', { pattern: 'TODO', include: '*.php' })])

  assert.ok(references.includes('*.php'))
})

test('extracts the glob pattern of a glob call', () => {
  assert.deepEqual(extractReferences([toolCall('glob', { pattern: '**/*.ts' })]), ['**/*.ts'])
})

test('extracts every file header from a patch input', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: src/new.ts',
    '*** Update File: src/old.php',
    '*** Delete File: src/gone.go',
    '*** End Patch',
  ].join('\n')

  const references = extractReferences([toolCall('patch', { patchText: patch })])

  assert.deepEqual(references, ['src/new.ts', 'src/old.php', 'src/gone.go'])
})

test('ignores user messages and non tool-call parts', () => {
  const messages: ConversationMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'edit a.go' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  ]

  assert.deepEqual(extractReferences(messages), [])
})

test('ignores tool calls with no object input', () => {
  assert.deepEqual(extractReferences([toolCall('read', undefined), toolCall('edit', 'x')]), [])
})
