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

const expectedRulePaths = {
  'rules/go/coding-style.md': ['**/*.go'],
  'rules/go/testing.md': ['**/*_test.go'],
  'rules/go/tooling.md': ['**/go.mod', '**/go.sum', '**/go.work'],
  'rules/javascript/coding-style.md': ['**/*.js', '**/*.mjs', '**/*.cjs'],
  'rules/javascript/testing.md': [
    '**/*.test.js',
    '**/*.spec.js',
    '**/tests/**/*.js',
    '**/jest.config.js',
    '**/vitest.config.js',
  ],
  'rules/javascript/tooling.md': [
    '**/package.json',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
  ],
  'rules/typescript/coding-style.md': ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
  'rules/typescript/testing.md': [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/tests/**/*.ts',
    '**/jest.config.ts',
    '**/vitest.config.ts',
  ],
  'rules/typescript/tooling.md': ['**/tsconfig.json', '**/tsconfig.*.json', '**/package.json'],
  'rules/python/coding-style.md': ['**/*.py', '**/*.pyi'],
  'rules/python/testing.md': ['**/test_*.py', '**/*_test.py', '**/tests/**/*.py', '**/conftest.py'],
  'rules/python/tooling.md': [
    '**/pyproject.toml',
    '**/requirements*.txt',
    '**/uv.lock',
    '**/poetry.lock',
  ],
  'rules/php/coding-style.md': ['**/*.php'],
  'rules/php/testing.md': ['**/tests/**/*.php', '**/*Test.php', '**/phpunit.xml'],
  'rules/php/tooling.md': ['**/composer.json', '**/composer.lock'],
  'rules/rust/coding-style.md': ['**/*.rs'],
  'rules/rust/testing.md': ['**/*.rs'],
  'rules/rust/tooling.md': ['**/Cargo.toml', '**/Cargo.lock', '**/rust-toolchain.toml'],
}

function frontmatterLines(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  return match ? match[1].split('\n') : null
}

test('no rule file uses the ignored globs frontmatter key', () => {
  const offenders = markdownFilesUnder('rules/').filter((file) => /^globs:/m.test(read(file)))

  assert.deepEqual(offenders, [])
})

for (const [file, patterns] of Object.entries(expectedRulePaths)) {
  test(`${file} declares its patterns under a paths frontmatter list`, () => {
    const lines = frontmatterLines(read(file))

    assert.ok(lines, 'file starts with a frontmatter block')
    assert.equal(lines[0], 'paths:')
    const entries = lines.slice(1)
    assert.ok(entries.length >= 1, 'paths has at least one entry')
    for (const entry of entries) {
      assert.match(entry, /^ {2}- "[^"]+"$/)
    }
    assert.deepEqual(
      entries.map((entry) => entry.slice(5, -1)),
      patterns,
    )
  })
}

test('skills policy limits TDD exemptions to the When TDD Applies section', () => {
  const policy = read('rules/common/skills-policy.md')

  assert.ok(!policy.includes('one-line bug fixes'))
  assert.ok(!policy.includes('edits to non-code files'))
  assert.ok(policy.includes('When TDD Applies'))
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
  const ruleLines = read('skills/debugging/SKILL.md')
    .split('\n')
    .slice(9)
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
