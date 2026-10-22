import { referenceMatchesGlobs } from './glob-match.ts'
import type { LanguageRules } from './rule-loader.ts'

export function selectRuleTexts(
  rules: readonly LanguageRules[],
  references: readonly string[],
): string[] {
  return rules
    .filter((language) => references.some((reference) => referenceMatchesGlobs(reference, language.globs)))
    .sort((left, right) => left.language.localeCompare(right.language))
    .map((language) => language.texts.join('\n\n'))
}
