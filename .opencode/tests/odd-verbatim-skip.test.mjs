import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const skill = readFileSync(new URL('../skills/brainstorming-skip/SKILL.md', import.meta.url), 'utf8')
const examples = skill.split('## Worked Example')
const designAlreadyInContext = examples[1]
const noDesignYetInContext = examples[2].split(/\n## (?!Approved Design)/)[0]
const contextCaptureStep = skill.split('\n3. **')[1].split('\n4. **')[0]

test('format block quotes the user words as the first requirement', () => {
  assert.match(skill, /\*\*Requirements \(verbatim\):\*\*\n\s+- S1: "\[the user's words, quoted exactly\]"/)
})

test('format block cites requirements or derived reasons in the design bullets', () => {
  assert.match(skill, /\*\*Design:\*\*\n\s+- \[design element\] \[S1\]\n\s+- \[design element\] \[derived: reason\]/)
})

test('format block has a derived criteria line', () => {
  assert.match(skill, /\*\*Derived criteria:\*\* \[each criterion the user did not state/)
})

test('skill no longer uses an acceptance criteria line in the design statement', () => {
  assert.doesNotMatch(skill, /\*\*Acceptance criteria:\*\*/)
})

test('context capture step forbids listing derived criteria as requirements', () => {
  assert.match(contextCaptureStep, /A derived criterion \*\*MUST NOT\*\* appear among the requirements\./)
})

test('context capture step requires every design bullet to cite a requirement or a derived reason', () => {
  assert.match(
    contextCaptureStep,
    /Every bullet under \*\*Design\*\* ends with `\[S#\]` \(one or more\) or `\[derived: <reason>\]`\./,
  )
})

test('example with a design in context has no derived criteria', () => {
  assert.match(designAlreadyInContext, /- S1: "/)
  assert.match(designAlreadyInContext, /\*\*Derived criteria:\*\* None/)
})

test('example without a design moves the dry-run prefix to derived criteria', () => {
  assert.match(noDesignYetInContext, /\(derived: consistent output marker\)/)
  assert.match(noDesignYetInContext, /\[derived: consistent output marker\]/)
  assert.match(noDesignYetInContext, /\[dry-run\]/)
})

test('example without a design moves the help documentation to derived criteria', () => {
  assert.match(noDesignYetInContext, /\(derived: flags in this script are documented in --help\)/)
  assert.match(noDesignYetInContext, /\[derived: flags in this script are documented in --help\]/)
})

test('example without a design quotes the user words exactly', () => {
  assert.match(
    noDesignYetInContext,
    /- S1: "Add a --dry-run flag to the deploy script that prints what it would do without actually doing it\."/,
  )
})

test('common mistakes table warns against listing a derived criterion as a requirement', () => {
  assert.match(
    skill,
    /\| Listing a derived criterion as a requirement +\| The requirements are the user's words\. Anything you add is derived and carries its reason\. +\|/,
  )
})
