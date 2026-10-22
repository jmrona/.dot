import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { DESIGN_ROOT_INSTRUCTION } from '../plugins/mode-switch/index.ts'

const root = new URL('../', import.meta.url)
const config = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf8'))
const files = [
  'skills/_shared/subagent-dispatch.md',
  'skills/brainstorming-standard/SKILL.md',
  'skills/brainstorming-skip/SKILL.md',
  'skills/brainstorming-committee/SKILL.md',
  'skills/brainstorming-committee/committee-member-prompt.md',
  'skills/subagent-driven-development/SKILL.md',
  'skills/subagent-driven-development/implementer-prompt.md',
  'skills/subagent-driven-development/reviewer-prompt.md',
  'skills/fast-path-implementation/SKILL.md',
  'skills/fast-path-implementation/fast-path-reviewer-prompt.md',
  'skills/requesting-code-review/SKILL.md',
  'skills/design-review/SKILL.md',
  'skills/design-review/design-reviewer-prompt.md',
  'skills/debugging/SKILL.md',
  'skills/debugging/investigator-prompt.md',
  'skills/dispatching-parallel-agents/SKILL.md',
  'rules/common/model-routing.md',
]

function read(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function allInstructions() {
  return files.map((path) => [path, read(path)])
}

test('defines the approved role-to-alias map and verifies native availability', () => {
  const dispatch = read('skills/_shared/subagent-dispatch.md')

  assert.match(dispatch, /bounded implementation[\s\S]*openai\/easy/i)
  assert.match(dispatch, /bounded lookup[\s\S]*openai\/easy/i)
  assert.match(dispatch, /openai\/routine/)
  assert.match(dispatch, /planning[\s\S]*design[\s\S]*decomposition[\s\S]*openai\/hard/i)
  assert.match(dispatch, /every independent implementation or specification review[\s\S]*openai\/hard/i)
  assert.match(dispatch, /known difficult[\s\S]*openai\/hard/i)
  assert.match(dispatch, /current (?:visible )?agent catalogue/i)
  assert.match(dispatch, /opencode\.models/)
  assert.match(dispatch, /BLOCKED/)
  assert.match(dispatch, /NEEDS_CONTEXT/)
  assert.match(dispatch, /do not omit the role or alias/i)

  for (const role of [
    ['stack-specialist', 'openai/easy'],
    ['utility', 'openai/routine'],
    ['stack-planner', 'openai/hard'],
    ['architect-reviewer', 'openai/hard'],
    ['qa-expert', 'openai/hard'],
    ['code-reviewer', 'openai/hard'],
    ['complex-worker', 'openai/hard'],
  ]) {
    assert.ok(dispatch.includes(`| \`${role[0]}\` | \`${role[1]}\` |`), `${role[0]} uses ${role[1]}`)
  }
})

test('removes legacy model tiers and obsolete dispatch APIs from workflow instructions', () => {
  for (const [path, source] of allInstructions()) {
    assert.doesNotMatch(source, /opencode models\b/i, `${path} avoids the obsolete CLI`)
    assert.doesNotMatch(source, /subagent_type\s*:|task_id\s*:/, `${path} avoids legacy fields`)
    assert.doesNotMatch(source, /\btask\s*\(/, `${path} avoids the legacy task API`)
    assert.doesNotMatch(source, /general-purpose/, `${path} avoids old generic-agent examples`)
    assert.doesNotMatch(
      source,
      /Low-cost default tier|Standard escalation tier|High-capability tier|cheapest capable model/i,
      `${path} does not use the vendor/tier ladder`,
    )
  }

  const dispatch = read('skills/_shared/subagent-dispatch.md')
  assert.match(dispatch, /generic fallback[\s\S]*explicitly authori[sz]es that fallback and its required alias/i)
  assert.match(dispatch, /required role[\s\S]*BLOCKED/i)
})

test('keeps upstream model IDs out of workflow instructions', () => {
  const modelIds = Object.values(config.providers.openai.models).map((model) => model.modelID)

  for (const [path, source] of allInstructions()) {
    for (const modelId of modelIds) {
      assert.equal(source.includes(modelId), false, `${path} does not duplicate the configured model ID`)
    }
  }
})

test('routes every independent review to a hard reviewer including the fast path', () => {
  const routing = read('rules/common/model-routing.md')
  const requestReview = read('skills/requesting-code-review/SKILL.md')
  const designReview = read('skills/design-review/SKILL.md')
  const designPrompt = read('skills/design-review/design-reviewer-prompt.md')
  const fastPath = read('skills/fast-path-implementation/SKILL.md')
  const fastPrompt = read('skills/fast-path-implementation/fast-path-reviewer-prompt.md')

  assert.match(routing, /implementation or specification review[\s\S]*code-reviewer[\s\S]*openai\/hard/i)
  assert.match(routing, /architect-reviewer.{0,30}openai\/hard.{0,60}design or architecture reviews/i)
  assert.match(requestReview, /code-reviewer[\s\S]*openai\/hard/i)
  assert.match(designReview, /architect-reviewer[\s\S]*openai\/hard/i)
  assert.match(designPrompt, /architect-reviewer[\s\S]*openai\/hard/i)
  assert.match(fastPath, /reviewer[\s\S]*openai\/hard/i)
  assert.match(fastPrompt, /reviewer[\s\S]*openai\/hard/i)
})

test('keeps substantive brainstorming and decomposition with the parent and stack planner', () => {
  const standard = read('skills/brainstorming-standard/SKILL.md')
  const skip = read('skills/brainstorming-skip/SKILL.md')
  const committee = read('skills/brainstorming-committee/SKILL.md')
  const committeePrompt = read('skills/brainstorming-committee/committee-member-prompt.md')
  const development = read('skills/subagent-driven-development/SKILL.md')

  for (const source of [standard, skip, committee, committeePrompt, development]) {
    assert.match(source, /stack-planner/)
    assert.match(source, /openai\/hard/)
  }

  assert.match(standard, /one question per message/i)
  assert.match(standard, /parent[\s\S]*question/i)
  assert.match(standard, /Develop the design[\s\S]*alternatives/i)
  assert.match(standard, /explicit final approval/i)
  assert.match(skip, /capture.{0,30}verbatim/i)
  assert.match(skip, /substantive judgement[\s\S]*stack-planner/i)
  assert.match(skip, /explicit approval/i)
  assert.match(committee, /stack-planner/)
  assert.match(committee, /architect-reviewer/)
  assert.match(committee, /qa-expert/)
  assert.match(committeePrompt, /native(?: OpenCode V2)? subagent/i)
  assert.match(committeePrompt, /Pragmatist[\s\S]*stack-planner/)
  assert.match(development, /decomposition[\s\S]*stack-planner[\s\S]*openai\/hard/i)
  assert.match(development, /workflow COMPLEX[\s\S]*not model difficulty/i)
})

test('preserves approved bounded implementation, TDD, review, and approval gates', () => {
  const development = read('skills/subagent-driven-development/SKILL.md')
  const implementer = read('skills/subagent-driven-development/implementer-prompt.md')
  const standard = read('skills/brainstorming-standard/SKILL.md')
  const skip = read('skills/brainstorming-skip/SKILL.md')
  const committee = read('skills/brainstorming-committee/SKILL.md')

  assert.match(development, /six-criterion complexity triage/i)
  assert.match(development, /bounded implementation[\s\S]*stack-specialist[\s\S]*openai\/easy/i)
  assert.match(development, /complex-worker[\s\S]*openai\/hard/i)
  assert.match(development, /per-wave pipeline/i)
  assert.match(development, /final feature-level review/i)
  assert.match(implementer, /approved task/i)
  assert.match(implementer, /must not (?:re-run|run).{0,40}(?:brainstorming|orchestrat)/i)
  assert.match(implementer, /NEEDS_CONTEXT/)
  assert.match(implementer, /self-review/i)
  assert.match(standard, /design-review/)
  assert.match(standard, /Completion Gate/)
  assert.match(skip, /Completion Gate/)
  assert.match(committee, /consensus/i)
  assert.match(committee, /design-review/)
  assert.match(committee, /Completion Gate/)
})

test('uses native child fields and prevents nested orchestration or human questions', () => {
  const dispatch = read('skills/_shared/subagent-dispatch.md')
  const prompts = [
    read('skills/brainstorming-committee/committee-member-prompt.md'),
    read('skills/subagent-driven-development/implementer-prompt.md'),
    read('skills/subagent-driven-development/reviewer-prompt.md'),
    read('skills/fast-path-implementation/fast-path-reviewer-prompt.md'),
    read('skills/design-review/design-reviewer-prompt.md'),
    read('skills/debugging/investigator-prompt.md'),
  ].join('\n')

  assert.match(dispatch, /native(?: OpenCode V2)? subagent interface/i)
  assert.match(prompts, /subagent\(\{/)
  for (const field of ['agent', 'description', 'prompt']) {
    assert.match(dispatch, new RegExp(`\\b${field}\\b`))
    assert.match(prompts, new RegExp(`\\b${field}\\b`))
  }
  assert.match(dispatch, /`sessionID` field is optional[\s\S]*ID returned by a prior call/i)
  assert.match(dispatch, /`background` is optional/i)
  assert.match(prompts, /dispatch nested agents|launch nested (?:reviewers|agents)/i)
  assert.match(prompts, /not ask the human|not ask the user/i)
  assert.match(dispatch, /children do not ask the human[\s\S]*launch nested agents or orchestration workflows/i)
})

test('keeps debugging evidence gates and annotates parallel tasks with explicit role aliases', () => {
  const debugging = read('skills/debugging/SKILL.md')
  const investigator = read('skills/debugging/investigator-prompt.md')
  const parallel = read('skills/dispatching-parallel-agents/SKILL.md')

  assert.match(debugging, /reproduc/i)
  assert.match(debugging, /root cause/i)
  assert.match(debugging, /explicit approval/i)
  assert.match(debugging, /stack-specialist[\s\S]*openai\/easy/i)
  assert.match(debugging, /complex-worker[\s\S]*openai\/hard/i)
  assert.match(investigator, /(?:does not|do not).{0,30}orchestrat/i)
  assert.match(investigator, /NEEDS_CONTEXT/)
  assert.match(parallel, /each task.{0,80}(?:role|agent).{0,80}alias/i)
  assert.match(parallel, /openai\/easy/)
  assert.match(parallel, /openai\/hard/)
  assert.doesNotMatch(parallel, /Low-cost default tier|cheapest/i)
})
test('omits parent session IDs from new calls and backgrounds only independent work', () => {
  const dispatch = read('skills/_shared/subagent-dispatch.md')
  const routing = read('rules/common/model-routing.md')
  const committeeSkill = read('skills/brainstorming-committee/SKILL.md')
  const parallelSkill = read('skills/dispatching-parallel-agents/SKILL.md')
  const templates = [
    read('skills/brainstorming-committee/committee-member-prompt.md'),
    read('skills/subagent-driven-development/implementer-prompt.md'),
    read('skills/subagent-driven-development/reviewer-prompt.md'),
    read('skills/fast-path-implementation/fast-path-reviewer-prompt.md'),
    read('skills/design-review/design-reviewer-prompt.md'),
  ]
  const calls = templates.flatMap((source) => [...source.matchAll(/subagent\(\{[\s\S]*?\}\)/g)].map((match) => match[0]))
  assert.ok(calls.length > 0, 'templates show native subagent calls')

  for (const call of calls) {
    assert.match(call, /agent:/)
    assert.match(call, /description:/)
    assert.match(call, /prompt:/)
    assert.doesNotMatch(call, /sessionID\s*:/)
    assert.doesNotMatch(call, /parent session ID/i)
  }

  assert.match(dispatch, /`sessionID` field is optional[\s\S]*ID returned by a prior call[\s\S]*same child in the same role/i)
  assert.match(dispatch, /never pass the parent session ID/i)
  assert.match(routing, /`sessionID` is optional[\s\S]*continue that same child/i)
  assert.match(committeeSkill, /background: true[\s\S]*completion notifications/i)
  assert.match(parallelSkill, /completion notifications/i)
  assert.ok(calls.some((call) => /background:\s*false/.test(call)), 'dependent calls stay foreground')
  assert.ok(calls.some((call) => /background:\s*true/.test(call)), 'independent calls run in background')
  assert.match(parallelSkill, /background: true[\s\S]*independent tasks/i)
})

test('delegates committee agenda and summary authorship to the hard planner', () => {
  const committee = read('skills/brainstorming-committee/SKILL.md')

  assert.match(committee, /agenda[\s\S]*`stack-planner` on `openai\/hard`/i)
  assert.match(committee, /substantive agenda development[\s\S]*stack-planner/i)
  assert.match(committee, /Author the final design summary[\s\S]*`stack-planner` on `openai\/hard`/i)
  assert.match(committee, /recorded committee consensus[\s\S]*stack-planner/i)
  assert.match(committee, /parent.{0,80}(?:scope-check|checks the summary against scope)/i)
  assert.match(committee, /Administer the vote and consensus process[\s\S]*The parent administers the process/i)
  assert.match(committee, /parent presents[\s\S]*explicit approval/i)
})

test('routes difficult debugging analysis to the hard worker in every interaction mode', () => {
  const debugging = read('skills/debugging/SKILL.md')

  assert.doesNotMatch(debugging, /Autonomous mode is the only mode in which investigator subagents run/i)
  assert.match(debugging, /every interaction mode[\s\S]*complex-worker[\s\S]*openai\/hard/i)
  assert.match(debugging, /Collaborative and Guided[\s\S]*complex-worker[\s\S]*openai\/hard/i)
  assert.match(debugging, /simple, bounded evidence collection[\s\S]*stack-specialist[\s\S]*openai\/easy/i)
  assert.match(debugging, /parent retains.{0,80}(?:questions|explanations|approval)/i)
  assert.match(debugging, /parallel investigation.{0,80}(?:optional|Autonomous)/i)
  assert.match(debugging, /Investigation Budget[\s\S]*three cycles maximum/i)
})

test('delegates substantive design-review revisions to the hard planner', () => {
  const review = read('skills/design-review/SKILL.md')

  assert.match(review, /substantive.{0,40}revision[\s\S]*stack-planner[\s\S]*openai\/hard/i)
  assert.match(review, /reviewer findings,[\s\S]*approved context/i)
  assert.match(review, /mechanical wording or formatting[\s\S]*parent/i)
  assert.match(review, /substantive changes[\s\S]*user/i)
  assert.match(review, /Maximum three reviewer dispatches/i)
  assert.match(review, /Calibration[\s\S]*real problems/i)
  assert.match(review, /Completion Gate[\s\S]*most recent reviewer dispatch/i)
  assert.doesNotMatch(review, /adds a dead-letter queue/i)
})

test('routes every design question and section through the stack planner verbatim', () => {
  const standard = read('skills/brainstorming-standard/SKILL.md')
  const routing = read('rules/common/model-routing.md')

  assert.ok(standard.includes('When you delegate, `stack-planner` authors every design question. Relay each planner question to the user verbatim.'), 'parent relays planner questions verbatim')
  assert.ok(
    standard.includes('**MUST NOT** write, reword, or add a design question yourself'),
    'parent does not author design questions',
  )
  assert.ok(standard.includes('continuing it with its `sessionID`'), 'user answers return to the same planner')
  assert.ok(
    standard.includes('do not draft, reword, or decide design content yourself'),
    'parent does not draft design content',
  )
  assert.ok(
    routing.includes('When the parent delegates, it relays planner questions and design sections to the human verbatim'),
    'routing rule relays planner output verbatim when delegating',
  )
  assert.ok(standard.includes('present each one verbatim'), 'parent presents planner sections verbatim')
  assert.ok(
    standard.includes("return the user's feedback to the same planner with its `sessionID`"),
    'section feedback returns to the same planner',
  )
  assert.ok(
    standard.includes('`stack-planner` drafts the 2-3 alternatives'),
    'planner drafts the alternatives and sections',
  )
  assert.ok(
    standard.includes('continue the same `stack-planner` with its `sessionID`'),
    'same planner authors the consolidated summary',
  )
  assert.ok(standard.includes('Produce one design question per turn'), 'planner returns one question per turn')
  assert.ok(
    standard.includes('Keep the `sessionID` that the call returns'),
    'parent keeps the planner sessionID',
  )
  assert.ok(
    standard.includes('Move to step 4 only when no question remains, which the planner reports when you delegate.'),
    'planner decides when clarification ends',
  )
})

test('routes a picked-up ticket through the brainstorming router before implementation', () => {
  const workOnTicket = read('skills/work-on-ticket/SKILL.md')
  const policyExample = read('rules/common/skills-policy.md')
    .split('\n')
    .find((line) => line.includes('"Work on #42"'))
  const sddTicketLines = read('skills/subagent-driven-development/SKILL.md')
    .split('\n')
    .filter((line) => line.includes('work-on-ticket'))
  const workflow = read('rules/common/workflow.md')

  assert.ok(
    workOnTicket.indexOf('label: "Looks good, proceed"') < workOnTicket.indexOf('skill: "brainstorming"'),
    'router runs only after the user confirms the scope',
  )
  assert.ok(
    workOnTicket.includes('**MUST NOT** invoke `subagent-driven-development` directly'),
    'ticket pickup never skips the design step',
  )
  assert.doesNotMatch(workOnTicket, /skill:\s*"subagent-driven-development"/, 'no direct implementation handoff')
  assert.match(policyExample, /`brainstorming`/, 'policy routes tickets through the router')
  assert.doesNotMatch(policyExample, /subagent-driven-development/, 'policy does not send tickets straight to implementation')
  assert.ok(sddTicketLines.length > 0, 'implementation skill still names work-on-ticket')
  for (const line of sddTicketLines) {
    assert.match(line, /brainstorming/, 'implementation skill reaches work-on-ticket only through the router')
  }
  assert.match(workflow, /ticket pickup[^.]*`brainstorming` router/, 'approved-design rule keeps the router')
})

test('brainstorming modes hand off to implementation from plan mode without a manual agent switch', () => {
  for (const path of [
    'skills/brainstorming-standard/SKILL.md',
    'skills/brainstorming-committee/SKILL.md',
    'skills/brainstorming-skip/SKILL.md',
  ]) {
    const skill = read(path)

    assert.match(skill, /invoke `subagent-driven-development` now, even if Plan mode is still active/, path)
    assert.match(skill, /mode-switch plugin moves the session to Build/, path)
    assert.match(skill, /Do not ask the user to switch agents unless the plugin reports that the switch failed/, path)
  }
})

test('retries rate-limited subagent calls with the same role before reporting blocked', () => {
  const dispatch = read('skills/_shared/subagent-dispatch.md')
  const headingIndex = dispatch.indexOf('## Rate-Limit Retries')

  assert.ok(headingIndex >= 0, 'dispatch rules have a Rate-Limit Retries section')

  const afterHeading = dispatch.slice(headingIndex + 3)
  const nextHeadingIndex = afterHeading.indexOf('\n## ')
  const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex)

  assert.match(section, /`provider\.rate-limit`/)
  assert.match(section, /(wait|waits)[^.]*\b60 seconds/i)
  assert.match(section, /up to (3|three) (times|retries)/i)
  assert.match(section, /same role,? alias,? and prompt/i)
  assert.match(section, /not a model escalation/i)
  assert.match(section, /`sessionID`/)
  assert.match(section, /full context/i)
  assert.match(section, /(third|last) (failed )?retry[^.]*`BLOCKED`[^.]*\buser\b/i)
  assert.doesNotMatch(section, /rework/i)
})

test('brainstorming modes save the approved design once to a plan file before the next-step question', () => {
  for (const path of [
    'skills/brainstorming-standard/SKILL.md',
    'skills/brainstorming-committee/SKILL.md',
    'skills/brainstorming-skip/SKILL.md',
  ]) {
    const skill = read(path)
    const step = skill.match(/\*\*Decide the next step\.\*\*([\s\S]*?)(?=\n\d+\. \*\*|\n## |$)/)?.[1] ?? ''
    const saveIndex = step.indexOf('/Users/jose.romero/.opencode/plan/')

    assert.ok(saveIndex >= 0, `${path} names the plan directory in the next-step step`)
    assert.ok(step.indexOf('`write`') >= 0 && step.indexOf('`write`') < step.indexOf('question'), path)
    assert.ok(saveIndex < step.indexOf('question'), `${path} saves the plan before the question`)
    assert.match(step, /save (the approved design|it) once/, path)
    assert.match(step, /before final approval/, path)
    assert.match(step, /do not edit it afterwards/, path)
  }

  const skipStep = read('skills/brainstorming-skip/SKILL.md').match(/\*\*Decide the next step\.\*\*([\s\S]*?)(?=\n\d+\. \*\*|\n## |$)/)?.[1] ?? ''

  assert.match(skipStep, /^\s*After the design is approved, save it once with `write`/)
})

test('implementation skills pass the plan file path to subagents instead of the design text', () => {
  const sdd = read('skills/subagent-driven-development/SKILL.md')
  const planSection = sdd.match(/## Plan File([\s\S]*?)(?=\n## |$)/)?.[1] ?? ''
  const fastPath = read('skills/fast-path-implementation/SKILL.md')
  const dispatchParagraph = fastPath.split('\n').find((line) => line.startsWith('Dispatch one bounded `stack-specialist` implementer')) ?? ''

  assert.match(planSection, /\/Users\/jose\.romero\/\.opencode\/plan\//)
  assert.match(planSection, /read the design from (that|the) file/i)
  assert.match(planSection, /instead of pasting/)
  assert.match(dispatchParagraph, /\/Users\/jose\.romero\/\.opencode\/plan\//)
  assert.match(dispatchParagraph, /paste only the task scope/)
})

const DESIGN_CONTENT_OPENER =
  'Delegate to `stack-planner` unless your instructions say that you author design content yourself. In that case, you author the design content directly.'
const DESIGN_CONTENT_DISCIPLINE = 'In that case, you author the design content directly and keep the same one-question-per-message discipline with the user.'

test('lets a design root author design content itself instead of relaying through the stack planner', () => {
  for (const path of [
    'skills/brainstorming-standard/SKILL.md',
    'skills/brainstorming-skip/SKILL.md',
    'skills/brainstorming-committee/SKILL.md',
    'skills/design-review/SKILL.md',
  ]) {
    assert.ok(read(path).includes(DESIGN_CONTENT_OPENER.replace(' In that case, you author the design content directly.', '')), `${path} carries the design-content condition`)
    assert.match(read(path), /In that case, you author the design content directly[ .]/, path)
  }
})

test('keeps the one-question discipline clause only in the standard brainstorming skill', () => {
  assert.ok(read('skills/brainstorming-standard/SKILL.md').includes(DESIGN_CONTENT_DISCIPLINE))
  for (const path of [
    'skills/brainstorming-skip/SKILL.md',
    'skills/brainstorming-committee/SKILL.md',
    'skills/design-review/SKILL.md',
  ]) {
    assert.ok(!read(path).includes('one-question-per-message discipline'), path)
    assert.ok(read(path).includes(DESIGN_CONTENT_OPENER), `${path} carries the bare opener`)
  }
})

test('labels the worked examples as a delegating root and keeps lead-in sentences short', () => {
  assert.match(read('skills/brainstorming-standard/SKILL.md'), /Delegating root\. User: "I want to add structured logging/)
  assert.match(read('skills/design-review/SKILL.md'), /\(a brainstorming skill, delegating root\)/)
  assert.match(read('skills/brainstorming-committee/SKILL.md'), /\*\*Author the final design summary\.\*\*/)
  assert.match(read('skills/brainstorming-skip/SKILL.md'), /or the faithful summary when judgement was needed/)
})

test('scopes the planning rule and the planner row to a root that does not author design content', () => {
  const routing = read('rules/common/model-routing.md')
  const dispatch = read('skills/_shared/subagent-dispatch.md')

  assert.match(routing, /instructions say[^.]*author[s]? design content[^.]*itself/i)
  assert.match(routing, /task decomposition goes to it from any root/i)
  assert.match(dispatch, /\| `stack-planner`[^\n]*unless[^\n]*author[s]? design content/i)
})

test('limits the no-authoring prohibitions in the brainstorming skills to delegation', () => {
  const standard = read('skills/brainstorming-standard/SKILL.md')

  assert.match(standard, /\| Rewording a planner question or drafting a design section yourself while delegating +\| Delegated design judgement belongs to `stack-planner`/)
  assert.doesNotMatch(standard, /^2\. \*\*Delegate substantive design work/m)
  assert.match(standard, /^2\. \*\*Develop the design\.\*\*[^\n]*Develop 2-3 viable alternatives/m)
  assert.doesNotMatch(standard, /Have the author produce/)
  assert.doesNotMatch(standard, /(?<!delegate, you )\*\*MUST NOT\*\* write, reword, or add a design question yourself/)
  assert.match(standard, /When you delegate, you \*\*MUST NOT\*\* write, reword, or add a design question yourself/)
})

test('keeps the design-review revision step explicit in both modes', () => {
  const review = read('skills/design-review/SKILL.md')

  assert.doesNotMatch(review, /apply this rule/)
  assert.match(review, /When you delegate, send the reviewer findings[\s\S]*When you author design content yourself, draft the revision directly/)
  assert.doesNotMatch(review, /scope-checks the planner's proposal against approved context/)
})

test('limits the planning bullet no-authoring clause to a delegating parent', () => {
  const routing = read('rules/common/model-routing.md')
  const bullet = routing.split('\n').find((line) => line.startsWith('- Send substantive planning'))

  assert.match(bullet, /When the parent delegates, it does not author design questions or design content/)
  for (const sentence of bullet.split(/(?<=\.) /)) {
    assert.ok(sentence.split(/\s+/).length <= 25, sentence)
  }
})

test('lists the same design content items in the planner row as the design root instruction', () => {
  const dispatch = read('skills/_shared/subagent-dispatch.md')
  const row = dispatch.split('\n').find((line) => line.startsWith('| `stack-planner`'))

  const listed = DESIGN_ROOT_INSTRUCTION.match(/yourself: (.*?)\. Do not/)[1]
  const items = listed.split(/, | and /).map((item) => item.replace(/^(the|design) /, '').replace(/^design /, ''))

  assert.equal(items.length, 6)
  for (const item of items) {
    assert.ok(row.includes(item), item)
  }
})

test('applies the brainstorming-skip planner brief only after the judgement condition', () => {
  const skip = read('skills/brainstorming-skip/SKILL.md')
  const step = skip.split('\n').find((line) => line.startsWith('3. **'))

  assert.ok(step.indexOf('require judgement') < step.indexOf('Delegate to `stack-planner` unless'))
  assert.doesNotMatch(step, /the next two sentences apply/)
  assert.doesNotMatch(step, /If no judgement is needed/)
  assert.match(step, /If the user's statement is already clear, capture the user's statement verbatim/)
})

test('keeps the coordinator bullet wording on other bounded work', () => {
  assert.match(read('rules/common/model-routing.md'), /straightforward discovery, and other bounded work\./)
})
