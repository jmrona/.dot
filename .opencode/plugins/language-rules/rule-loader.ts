import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { parseGlobs } from './frontmatter.ts'

export interface LanguageRules {
  readonly language: string
  readonly globs: string[]
  readonly texts: string[]
}

interface RuleFile {
  readonly globs: string[]
  readonly text: string
}

async function readRuleFile(path: string): Promise<RuleFile | undefined> {
  try {
    const text = await readFile(path, 'utf8')
    const globs = parseGlobs(text)
    if (globs.length > 0) return { globs, text }
    console.warn(`language-rules: skipping ${path}: no globs in frontmatter`)
  } catch (error) {
    console.warn(`language-rules: skipping ${path}: ${String(error)}`)
  }
  return undefined
}

async function ruleFileNames(directory: string): Promise<string[]> {
  try {
    const names = await readdir(directory)
    return names.filter((name) => name.endsWith('.md')).sort()
  } catch {
    return []
  }
}

async function loadLanguage(root: string, language: string): Promise<LanguageRules | undefined> {
  const directory = join(root, language)
  const names = await ruleFileNames(directory)
  const files = await Promise.all(names.map((name) => readRuleFile(join(directory, name))))
  const loaded = files.filter((file): file is RuleFile => file !== undefined)
  if (loaded.length === 0) return undefined
  return {
    language,
    globs: [...new Set(loaded.flatMap((file) => file.globs))],
    texts: loaded.map((file) => file.text),
  }
}

export async function loadLanguageRules(
  root: string,
  languages: readonly string[],
): Promise<LanguageRules[]> {
  const loaded = await Promise.all(languages.map((language) => loadLanguage(root, language)))
  return loaded.filter((rules): rules is LanguageRules => rules !== undefined)
}
