import { referenceMatchesGlobs } from './glob-match.ts'
import type { LanguageRules } from './rule-loader.ts'

export function matchedLanguages(
  rules: readonly LanguageRules[],
  references: readonly string[],
): string[] {
  return rules
    .filter((rule) => references.some((reference) => referenceMatchesGlobs(reference, rule.globs)))
    .map((rule) => rule.language)
}

export function renderRuleTexts(
  rules: readonly LanguageRules[],
  languages: ReadonlySet<string>,
): string[] {
  return rules
    .filter((rule) => languages.has(rule.language))
    .sort((left, right) => left.language.localeCompare(right.language))
    .map((rule) => rule.texts.join('\n\n'))
}
