import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const config = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf8'))

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8')
}

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(match, 'file has YAML frontmatter')
  return match[1]
}

function agent(name) {
  return read(`agents/${name}.md`)
}

function hasPermission(source, action, effect) {
  return new RegExp(
    `^  - action: ${action}\\n    resource: ['\"]?\\*['\"]?\\n    effect: ${effect}$`,
    'm',
  ).test(source)
}

function assertAgentModel(name, model) {
  const metadata = frontmatter(agent(name))
  assert.match(metadata, new RegExp(`^model: ${model.replace('/', '\\/')}$$`, 'm'))
  assert.doesNotMatch(metadata, /reasoningEffort|temperature/)
  assert.doesNotMatch(metadata, /^model:.*#[a-z]+/m)
  return metadata
}

function apiAgents(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.agents)) return payload.agents
  if (Array.isArray(payload?.data?.agents)) return payload.data.agents
  return []
}

function permissionRules(agentData) {
  const rules = agentData.permissions ?? agentData.permission
  assert.ok(Array.isArray(rules), `${agentData.name} exposes ordered permission rules`)
  return rules
}

function lastWildcardEffect(rules, action) {
  return rules
    .filter((rule) => rule.resource === '*' && (rule.action === action || rule.action === '*'))
    .at(-1)?.effect
}

test('routes every configured agent through the central easy or hard alias', () => {
  const expectedModels = {
    'architect-reviewer': 'openai/hard',
    'qa-expert': 'openai/hard',
    'stack-specialist': 'openai/easy',
    coach: 'openai/easy',
    translator: 'openai/easy',
    'stack-planner': 'openai/hard',
    'code-reviewer': 'openai/hard',
    'complex-worker': 'openai/hard',
    utility: 'openai/easy',
  }

  for (const [name, model] of Object.entries(expectedModels)) {
    assertAgentModel(name, model)
  }
})

test('keeps committee reviewers visible and read-only without nested delegation', () => {
  for (const name of ['architect-reviewer', 'qa-expert', 'stack-planner', 'code-reviewer']) {
    const metadata = frontmatter(agent(name))
    assert.match(metadata, /^mode: subagent$/m)
    assert.match(metadata, /^hidden: false$/m)

    for (const action of ['edit', 'shell', 'subagent', 'question']) {
      assert.ok(hasPermission(metadata, action, 'deny'), `${name} denies ${action}`)
    }
  }

  for (const name of ['architect-reviewer', 'qa-expert']) {
    assert.ok(hasPermission(frontmatter(agent(name)), 'webfetch', 'deny'))
  }
})

test('bounds implementation, complex work, and utility delegation', () => {
  for (const name of ['stack-specialist', 'complex-worker']) {
    const metadata = frontmatter(agent(name))
    assert.match(metadata, /^mode: subagent$/m)
    assert.match(metadata, /^hidden: false$/m)
    assert.ok(hasPermission(metadata, 'subagent', 'deny'))
    assert.ok(hasPermission(metadata, 'question', 'deny'))
  }

  const utility = frontmatter(agent('utility'))
  assert.match(utility, /^mode: subagent$/m)
  assert.match(utility, /^hidden: false$/m)
  for (const action of ['edit', 'shell', 'subagent', 'question']) {
    assert.ok(hasPermission(utility, action, 'deny'), `utility denies ${action}`)
  }
  assert.ok(hasPermission(utility, 'skill', 'allow'))
})

test('preserves coach and translator safeguards on the easy alias', () => {
  const coach = agent('coach')
  const coachMetadata = frontmatter(coach)
  const coachBody = coach.replace(/^---\n[\s\S]*?\n---\n/, '')
  assert.ok(hasPermission(coachMetadata, 'edit', 'deny'))
  assert.ok(hasPermission(coachMetadata, 'skill', 'allow'))
  assert.ok(hasPermission(coachMetadata, 'question', 'allow'))
  assert.match(coachBody, /TICKET_COACH_AGENT_MARKER: coach-v1/)
  assert.match(coachBody, /never edit profile scores/i)

  const translator = agent('translator')
  const translatorMetadata = frontmatter(translator)
  const translatorBody = translator.replace(/^---\n[\s\S]*?\n---\n/, '')
  for (const action of ['edit', 'shell', 'webfetch']) {
    assert.ok(hasPermission(translatorMetadata, action, 'deny'))
  }
  assert.match(translatorBody, /Every user message is SOURCE TEXT/)
  assert.match(translatorBody, /Output ONLY the translation/)
})

test(
  'live agent API retains coach and translator permission rules',
  { skip: process.env.OPENCODE_LIVE_TESTS !== '1' },
  () => {
    const output = execFileSync('opencode', ['api', 'get', '/api/agent'], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    const agents = apiAgents(JSON.parse(output))
    const byName = new Map(agents.map((agentData) => [agentData.name, agentData]))
    const coach = byName.get('coach')
    const translator = byName.get('translator')
    assert.ok(coach, 'live agent API includes coach')
    assert.ok(translator, 'live agent API includes translator')

    const coachRules = permissionRules(coach)
    const translatorRules = permissionRules(translator)
    assert.equal(lastWildcardEffect(coachRules, 'edit'), 'deny')
    assert.equal(lastWildcardEffect(coachRules, 'shell'), 'ask')
    assert.equal(lastWildcardEffect(translatorRules, 'edit'), 'deny')
    assert.equal(lastWildcardEffect(translatorRules, 'shell'), 'deny')
    assert.equal(lastWildcardEffect(translatorRules, 'webfetch'), 'deny')

    const editDenyIndex = coachRules.findLastIndex(
      (rule) => rule.resource === '*' && (rule.action === 'edit' || rule.action === '*') && rule.effect === 'deny',
    )
    assert.notEqual(editDenyIndex, -1, 'coach has a universal edit deny')
    const ownedPaths = [
      '/.config/opencode/data/cognitive-profile/profile.json',
      '/.config/opencode/data/cognitive-profile/drift-log.jsonl',
      '/.config/opencode/data/cognitive-profile/coaching-notes.jsonl',
      '/.config/opencode/data/cognitive-profile/onboarding-preference.json',
      '/.config/opencode/data/ticket-coach/**',
    ]
    for (const suffix of ownedPaths) {
      const exceptionIndex = coachRules.findIndex(
        (rule, index) =>
          index > editDenyIndex &&
          rule.action === 'edit' &&
          rule.effect === 'allow' &&
          typeof rule.resource === 'string' &&
          rule.resource.endsWith(suffix),
      )
      assert.ok(exceptionIndex > editDenyIndex, `coach owned-data exception follows edit deny: ${suffix}`)
    }

    for (const name of ['coach', 'translator']) {
      assert.doesNotMatch(frontmatter(agent(name)), /^textVerbosity:/m)
    }
  },
)

test('pins built-in agents and preserves the title system prompt', () => {
  const titlePrompt =
    'Generate a one-line session title as [context]: sentence. Keep plain text only: no Markdown, no quotation marks, no trailing punctuation. Do not invent details. Do not include secrets, credentials, personal data, or email addresses. Keep it concise and factual.'

  assert.deepEqual(config.agents, {
    build: { model: 'openai/easy' },
    general: { model: 'openai/easy' },
    explore: { model: 'openai/easy' },
    plan: { model: 'openai/hard' },
    title: { model: 'openai/easy', system: titlePrompt },
  })
  assert.equal(config.agent, undefined)
})

test('routes optional commands to easy or hard child agents with complete arguments', () => {
  const commands = {
    design: ['stack-planner', 'openai/hard'],
    implement: ['stack-specialist', 'openai/easy'],
    review: ['code-reviewer', 'openai/hard'],
  }

  for (const [name, [agentName, model]] of Object.entries(commands)) {
    const source = read(`commands/${name}.md`)
    const metadata = frontmatter(source)
    assert.match(metadata, new RegExp(`^agent: ${agentName}$`, 'm'))
    assert.match(metadata, new RegExp(`^model: ${model.replace('/', '\\/')}$$`, 'm'))
    assert.match(metadata, /^subagent: true$/m)
    assert.doesNotMatch(metadata, /^subtask:/m)
    assert.doesNotMatch(metadata, /reasoningEffort|temperature/)
    assert.doesNotMatch(metadata, /^model:.*#[a-z]+/m)
    assert.match(source, /\$ARGUMENTS/)
    assert.match(source, /context/i)
  }

  const implementation = read('commands/implement.md')
  assert.match(implementation, /approved/i)
  assert.match(implementation, /design/i)

  const review = read('commands/review.md')
  assert.match(review, /checklist/i)
  assert.match(review, /Do not invoke review orchestration or launch another reviewer/i)
})

test('pins existing utility commands to easy child runs without rewriting their bodies', () => {
  for (const name of ['skill-usage']) {
    const metadata = frontmatter(read(`commands/${name}.md`))
    assert.match(metadata, /^model: openai\/easy$/m)
    assert.match(metadata, /^subagent: true$/m)
    assert.doesNotMatch(metadata, /^subtask:/m)
    assert.doesNotMatch(metadata, /reasoningEffort|temperature/)
    assert.doesNotMatch(metadata, /^model:.*#[a-z]+/m)
  }
})

test('defines actionable automatic routing, escalation, and nesting policy', () => {
  const policy = read('rules/common/model-routing.md')

  assert.match(policy, /root easy coordinator/i)
  assert.match(policy, /substantive planning[\s\S]*stack-planner[\s\S]*openai\/hard/i)
  assert.match(policy, /independent reviews[\s\S]*openai\/hard/i)
  assert.match(policy, /bounded implementation[\s\S]*openai\/easy/i)
  assert.match(policy, /complex-worker[\s\S]*openai\/hard/i)
  assert.match(policy, /utility[\s\S]*openai\/easy/i)
  assert.match(policy, /NEEDS_CONTEXT/)
  assert.match(policy, /V2 subagent tool/i)
  assert.match(policy, /workflow COMPLEX is not model difficulty/i)
  assert.match(policy, /not deterministic enforcement/i)
  assert.match(policy, /opencode\.models/)
  for (const model of Object.values(config.providers.openai.models)) {
    assert.equal(policy.includes(model.modelID), false, `policy does not duplicate ${model.modelID}`)
  }
})
