import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const config = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf8'))

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(match, 'file has YAML frontmatter')
  return match[1]
}

const routineSkills = [
  'commit-msg',
  'summarize-diff',
  'learning-trend',
  'detect-ticketing-system',
  'explain',
  'complexity-triage',
]

test('retires the old routing plugin and moves v1-format plugins and commands out of the harness', () => {
  const disabled = new URL('../../opencode-plugins-v1-disabled-2026-10-19/', import.meta.url)
  for (const path of [
    'plugins/index.ts',
    'plugins/compaction',
    'plugins/session-title-policy',
    'plugins/temp-session',
    'commands/temp-session.md',
    'commands/compaction-preview.md',
  ]) {
    assert.equal(existsSync(new URL(path, root)), false, `${path} is out of the harness`)
    assert.ok(existsSync(new URL(path, disabled)), `${path} is preserved outside the harness`)
  }
  assert.equal(existsSync(new URL('../plugins/skill-model-router', import.meta.url)), false)
  assert.equal(existsSync(new URL('../vendor/opencode-subagent-model-alias', import.meta.url)), true)
  const archived = new URL('../vendor/legacy-plugins/skill-model-router/', import.meta.url)
  for (const name of ['README.md', 'config.json', 'index.ts', 'lib.test.ts', 'lib.ts', 'node_modules']) {
    assert.ok(existsSync(new URL(name, archived)), `${name} is preserved in the archive`)
  }
  assert.deepEqual(readdirSync(archived).sort(), [
    'README.md',
    'config.json',
    'index.ts',
    'lib.test.ts',
    'lib.ts',
    'node_modules',
  ])

  assert.equal(config.model, 'openai/easy')
  assert.ok(config.providers.openai.models.routine)
  assert.ok(config.providers.openai.models.easy)
  assert.ok(config.providers.openai.models.hard)
  assert.doesNotMatch(JSON.stringify(config), /opencode-subagent-model-alias|skill-model-router/)
})

test('uses native routine dispatch metadata without per-skill overrides', () => {
  const shared = read('skills/_shared/routine-skill-dispatch.md')

  for (const name of routineSkills) {
    const source = read(`skills/${name}/SKILL.md`)
    const metadata = frontmatter(source)
    assert.match(metadata, new RegExp(`^name: ${name}$`, 'm'))
    assert.match(metadata, /^metadata:\n  model: openai\/routine$/m)
    assert.doesNotMatch(metadata, /fallback_model|reasoning_effort|reasoning:/)
    assert.match(source, /routine-skill-dispatch\.md/)
  }

  assert.match(shared, /native skill loader[\s\S]*does not select (?:a )?model/i)
  assert.match(shared, /metadata\.model[\s\S]*documented alias policy marker/i)
  assert.match(shared, /native subagent interface/i)
  assert.match(shared, /agent: ["']utility["']/)
  assert.match(shared, /NEEDS_CONTEXT/)
  assert.match(shared, /delegation.{0,50}(?:fail|error)[\s\S]*explicit/i)
  assert.match(shared, /never silently substitute/i)
  assert.match(shared, /already running as (?:the )?utility[\s\S]*directly/i)
  assert.match(shared, /fresh complete context/i)
  assert.match(shared, /child[\s\S]*read-only[\s\S]*(?:no shell|does not use shell)[\s\S]*nested agents[\s\S]*human questions/i)
  assert.match(shared, /parent.{0,100}(?:lookups|tool operations|writes)/i)
  assert.match(shared, /privacy|private profile or coaching data/i)
  assert.doesNotMatch(shared, /fallback_model|reasoning_effort|#(?:low|medium|high|xhigh)/)
})

test('keeps commit and diff summarisation as fully supplied text-in text-out work', () => {
  const commit = read('skills/commit-msg/SKILL.md')
  assert.match(commit, /parent.{0,100}(?:full )?diff/i)
  assert.match(commit, /branch.{0,50}(?:ticket )?key/i)
  assert.match(commit, /text-in[ /-]text-out/i)
  assert.match(commit, /type\(scope\): summary \(TICKET-KEY\)/)
  assert.match(commit, /at most 72 characters/i)
  assert.match(commit, /never guess/i)
  assert.match(commit, /Output only the commit message/i)

  const summary = read('skills/summarize-diff/SKILL.md')
  assert.match(summary, /parent.{0,100}(?:full )?diff/i)
  assert.match(summary, /text-in[ /-]text-out/i)
  assert.match(summary, /2-3 sentence plain-language summary/i)
  assert.match(summary, /Risks: none obvious/)
  assert.match(summary, /Do not restate the diff hunk by hunk/i)
  assert.match(summary, /NEEDS_CONTEXT/)
})

test('keeps all six complexity criteria and strict evidence rules unchanged in substance', () => {
  const source = read('skills/complexity-triage/SKILL.md')
  const criteria = [
    'Uniform change type',
    'No new logic',
    'No new interfaces',
    'Deterministic from spec',
    'Independently verifiable',
    'Small total delta',
  ]

  for (const criterion of criteria) assert.ok(source.includes(criterion), `${criterion} remains`)
  assert.match(source, /same kind of edit applied across locations/i)
  assert.match(source, /zero new functions, classes, conditionals, loops, error handling, or business rules/i)
  assert.match(source, /no new exports, API endpoints, contracts, events, or public surface area/i)
  assert.match(source, /fully specified with no room for interpretation/i)
  assert.match(source, /verified by reading it in isolation/i)
  assert.match(source, /under roughly 50 lines of meaningful content/i)
  assert.match(source, /default classification is COMPLEX/i)
  assert.match(source, /ALL.{0,5}criteria must be true/i)
  assert.match(source, /specific evidence/i)
  assert.match(source, /under roughly 50 lines/i)
  assert.match(source, /qualifying language[\s\S]*criterion fails/i)
  assert.match(source, /override during execution[\s\S]*reclassify as COMPLEX/i)
  assert.match(source, /approved design or a well-defined change request/i)
  assert.match(source, /NEEDS_CONTEXT/)
  assert.match(source, /utility[\s\S]*table/i)
})

test('keeps ticket-system discovery in the parent and supports current tool catalogue names', () => {
  const source = read('skills/detect-ticketing-system/SKILL.md')

  assert.match(source, /parent.{0,100}(?:current )?(?:Code Mode )?tool catalogue/i)
  assert.match(source, /mcp-atlassian[\s\S]*jira_/i)
  assert.match(source, /github[\s\S]*issue/i)
  assert.match(source, /gitlab/i)
  assert.match(source, /linear/i)
  assert.match(source, /MCP[\s\S]*remote[\s\S]*CLI/i)
  assert.match(source, /utility.{0,100}(?:supplied|provided) evidence/i)
  assert.match(source, /ambiguous[\s\S]*parent.{0,60}(?:asks|question)/i)
  assert.match(source, /never writes tickets/i)
  assert.doesNotMatch(source, /command -v|execFileSync|shell.{0,30}(?:run|execute)/i)
})

test('keeps learning-trend evidence retrieval and private profile data with the parent', () => {
  const source = read('skills/learning-trend/SKILL.md')

  assert.match(source, /only on an explicit request/i)
  assert.match(source, /parent.{0,100}FLOW E/i)
  assert.match(source, /parent.{0,100}FLOW C/i)
  assert.match(source, /scorecard history/i)
  assert.match(source, /proficiency[\s\S]*seniority/i)
  assert.match(source, /explicit status/i)
  assert.match(source, /never read.{0,60}(?:profile|scorecard) files/i)
  assert.match(source, /never show raw `?cognitive_profile`? axis scores/i)
  assert.match(source, /fewer than 3-4 scorecard entries/i)
  assert.match(source, /confidence[\s\S]*(?:plain language|plain terms)/i)
  assert.match(source, /five criteria/i)
  assert.match(source, /rough direction/i)
  assert.match(source, /don't fabricate/i)
  assert.match(source, /Never activate this proactively/i)
  assert.match(source, /Don't volunteer these numbers unprompted/i)
})

test('uses parent-resolved profile context for the native explain utility', () => {
  const source = read('skills/explain/SKILL.md')
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, '')
  const coach = read('agents/coach.md')
  const policy = read('rules/common/skills-policy.md')

  assert.doesNotMatch(source, /skill_explain|skill-model-router|quick-explain/)
  assert.match(body, /parent.{0,100}FLOW C/i)
  assert.match(body, /verbatim[\s\S]*language[\s\S]*project context/i)
  assert.match(body, /cognitive_weights[\s\S]*background_context/i)
  assert.match(body, /explicit (?:profile )?status/i)
  assert.match(body, /missing.{0,50}status[\s\S]*NEEDS_CONTEXT/i)
  assert.match(body, /utility[\s\S]*loads explain[\s\S]*directly/i)
  assert.match(body, /never.{0,60}(?:invoke|call).{0,40}(?:FLOW C|cognitive-profile)/i)
  assert.match(body, /relay.{0,30}(?:unedited|as-is)/i)
  assert.match(body, /FLOW A[\s\S]*parent/i)
  assert.match(body, /drift logging is parent-only/i)
  assert.match(body, /Correct the misconception first/i)
  assert.match(body, /real-world analogy/i)
  assert.match(body, /Use headers to separate/i)
  assert.match(body, /Use concrete examples from the current project/i)
  assert.match(body, /Close with the practical consequence/i)
  assert.match(body, /Map `cognitive_weights` to concrete adjustments/i)
  assert.match(body, /None of this is exposed to the user/i)
  assert.match(body, /respond in the user's language/i)
  assert.match(body, /no unsolicited diagrams or visual offers[\s\S]*terminal/i)
  assert.doesNotMatch(coach, /skill_explain|skill-model-router/)
  assert.match(coach, /native utility/i)
  assert.doesNotMatch(policy, /quick-explain|skill_explain|skill-model-router/)
  assert.match(policy, /native utility/i)
})
