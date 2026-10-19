import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function markdownFilesUnder(directory) {
  return readdirSync(new URL(directory, root), { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => `${directory}${entry}`)
}

function frontmatterLines(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  return match ? match[1].split('\n') : null
}

test('no rule file uses the ignored globs frontmatter key', () => {
  const offenders = markdownFilesUnder('rules/').filter((file) => /^globs:/m.test(read(file)))

  assert.deepEqual(offenders, [])
})

const languageFolders = ['go', 'javascript', 'typescript', 'python', 'php', 'rust']
const languageRuleFiles = languageFolders.flatMap((folder) =>
  markdownFilesUnder(`rules/${folder}/`),
)

for (const file of languageRuleFiles) {
  test(`${file} declares its patterns under a paths frontmatter list`, () => {
    const lines = frontmatterLines(read(file))

    assert.ok(lines, 'file starts with a frontmatter block')
    assert.equal(lines[0], 'paths:')
    const entries = lines.slice(1)
    assert.ok(entries.length >= 1, 'paths has at least one entry')
    for (const entry of entries) {
      assert.match(entry, /^ {2}- "[^"]+"$/)
    }
  })
}

function pathsListOf(file) {
  return frontmatterLines(read(file)).slice(1).map((entry) => entry.slice(5, -1))
}

test('javascript rules load for jsx files', () => {
  const codingStylePaths = pathsListOf('rules/javascript/coding-style.md')
  const testingPaths = pathsListOf('rules/javascript/testing.md')

  assert.ok(codingStylePaths.includes('**/*.jsx'))
  assert.ok(testingPaths.includes('**/*.test.jsx'))
  assert.ok(testingPaths.includes('**/*.spec.jsx'))
  assert.ok(testingPaths.includes('**/tests/**/*.jsx'))
})

test('skills policy limits TDD exemptions to the When TDD Applies section', () => {
  const policy = read('rules/common/skills-policy.md')

  assert.ok(!policy.includes('one-line bug fixes'))
  assert.ok(!policy.includes('edits to non-code files'))
  assert.ok(policy.includes('When TDD Applies'))
  assert.match(read('rules/common/testing.md'), /^### When TDD Applies$/m)
})

test('skills policy names the Skill tool wherever it says via the Skill', () => {
  const policy = read('rules/common/skills-policy.md')

  assert.doesNotMatch(policy, /via the Skill(?! tool)/)
  assert.ok((policy.match(/via the Skill tool/g) ?? []).length >= 2)
})

for (const file of [
  'skills/brainstorming-standard/SKILL.md',
  'skills/brainstorming-committee/SKILL.md',
]) {
  test(`${file} gives the final approval through ExitPlanMode`, () => {
    const approvalStep = read(file)
      .split('\n')
      .find((line) => /^\d+\. \*\*Get explicit final approval\./.test(line))

    assert.ok(approvalStep, 'file has a step titled Get explicit final approval')
    assert.ok(approvalStep.includes('ExitPlanMode'))
  })
}

test('debugging skill cites RULES.md for every procedural rule it applies', () => {
  const proceduralRule =
    /non-reproducib|scope discipline|Refocus Rule|Investigation Budget|root-cause|minimal fix/
  const lines = read('skills/debugging/SKILL.md').split('\n')
  const frontmatterEnd = lines.indexOf('---', 1)
  const introLine = lines.findIndex((line) => line.startsWith('The iron-law rules'))
  assert.ok(introLine > frontmatterEnd, 'file has the intro line that starts with The iron-law rules')
  const ruleLines = lines
    .filter((line, index) => index > frontmatterEnd && index !== introLine)
    .filter((line) => proceduralRule.test(line) && /debugging\.md|RULES\.md/.test(line))

  assert.ok(ruleLines.length >= 7)
  for (const line of ruleLines) {
    assert.ok(line.includes('RULES.md'), line)
    assert.ok(!line.includes('rules/common/debugging.md'), line)
  }
})

test('code reviewer template only uses placeholders that the skill fills', () => {
  const placeholderPattern = /\{[A-Z][A-Z_]*\}/g
  const skill = read('skills/requesting-code-review/SKILL.md')
  const fillStep = skill.slice(skill.indexOf('3. **Fill the template.**'), skill.indexOf('4. **Dispatch.**'))
  const filled = new Set(fillStep.match(placeholderPattern))
  const used = new Set(read('skills/requesting-code-review/code-reviewer.md').match(placeholderPattern))

  assert.ok(filled.size >= 5)
  assert.deepEqual([...used].filter((placeholder) => !filled.has(placeholder)), [])
})

test('requesting code review sets the orchestrated base at the start of the feature', () => {
  const skill = read('skills/requesting-code-review/SKILL.md')

  assert.ok(!skill.includes('start of the current task'))
  assert.match(skill, /`BASE_SHA` is the commit at the start of the feature/)
})

test('code reviewer template also reviews uncommitted work against the base', () => {
  const template = read('skills/requesting-code-review/code-reviewer.md')

  assert.ok(template.includes('git status --porcelain'))
  assert.match(template, /git diff \{BASE_SHA\}(?!\.\.)/)
})

test('settings do not reference the uninstalled gitkraken marketplace', () => {
  const settings = JSON.parse(read('settings.json'))

  assert.ok(!Object.hasOwn(settings.extraKnownMarketplaces, 'gitkraken'))
  assert.ok(!Object.hasOwn(settings.enabledPlugins, 'gitkraken-hooks@gitkraken'))
})
