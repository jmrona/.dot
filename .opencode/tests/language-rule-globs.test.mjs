import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { parseGlobs } from '../plugins/language-rules/frontmatter.ts'

const rulesRoot = new URL('../rules/', import.meta.url)

function languageDirectories() {
  return readdirSync(rulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'common')
    .map((entry) => entry.name)
}

function languageRuleFiles() {
  return languageDirectories().flatMap((language) =>
    readdirSync(new URL(`${language}/`, rulesRoot))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `rules/${language}/${name}`),
  )
}

test('gives every language rule file at least one glob', () => {
  const files = languageRuleFiles()
  assert.notEqual(files.length, 0, 'no language rule files were found under rules/')
  for (const file of files) {
    const globs = parseGlobs(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
    assert.ok(globs.length > 0, `${file} has no globs in its frontmatter`)
  }
})
