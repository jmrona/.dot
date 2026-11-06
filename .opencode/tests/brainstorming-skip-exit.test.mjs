import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const skill = readFileSync(new URL('../skills/brainstorming-skip/SKILL.md', import.meta.url), 'utf8')
const EXIT_PLAN_MODE_TEXT = "exiting plan mode (in OpenCode, present the design as the plan content; the user's explicit approval, given before you presented it or in reply to it, is the exit: once you have it, continue to the next step without waiting, and the mode-switch plugin moves the session to Build when the implementation skill loads)"
const nextStepBody = skill.split('\n5. **')[1].split('\n6. **')[0]


test('skill no longer waits for the user to toggle out of plan mode with Tab', () => {
  assert.doesNotMatch(skill, /toggles out of plan mode with Tab/)
})

test('skill states the exit from plan mode as the plan content on eight lines', () => {
  const linesWithExitText = skill.split('\n').filter((line) => line.includes(EXIT_PLAN_MODE_TEXT))
  assert.equal(linesWithExitText.length, 8)
})

test('completion gate accepts an approval that already asked for implementation', () => {
  assert.match(
    skill,
    /- Without a `Source: work-on-ticket` line, the user picked an implementation next step via `question` or the user's approval already asked for implementation/,
  )
})

test('skill states that presenting the design and receiving approval is the explicit approval step', () => {
  assert.match(
    skill,
    /^ {3}Presenting the design and receiving the user's explicit approval, given before you presented it or in reply to it, is the explicit approval step\.$/m,
  )
  assert.doesNotMatch(skill, /call IS the explicit approval step/)
})

test('next step treats an approval that already asks for implementation as the answer to the question', () => {
  assert.match(
    nextStepBody,
    /approval already asks for implementation \(for example 'apply the fix'\), that answers the question, so do not ask it and invoke `subagent-driven-development`\./,
  )
})

test('next step gives the implementation answer before the question about tickets or implementation', () => {
  const answerPosition = nextStepBody.search(/approval already asks for implementation/)
  const questionPosition = nextStepBody.search(/use `question` to ask whether to create tickets or start implementation/)

  assert.ok(answerPosition >= 0, 'the implementation answer sentence is present')
  assert.ok(questionPosition > answerPosition, 'the question sentence follows the implementation answer')
})
