import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const citationRule =
  "The summary starts with the user's request verbatim, numbered `S1` to `Sn`. Every design element ends with `[S#]` (one or more) or `[derived: <reason>]`. A derived element is allowed, and it states why it exists."

const consolidationSteps = [
  ['skills/brainstorming-standard/SKILL.md', /^5\. \*\*Consolidate the design summary\.\*\*.*$/m],
  ['skills/brainstorming-committee/SKILL.md', /^6\. \*\*(?:Assemble|Author) the (?:final )?design summary\.\*\*.*$/m],
]

function consolidationStep(path, pattern) {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const match = text.match(pattern)
  assert.ok(match, `${path} has no consolidation step`)
  return match[0]
}

for (const [path, pattern] of consolidationSteps) {
  test(`${path} consolidation step numbers the verbatim request`, () => {
    const step = consolidationStep(path, pattern)
    assert.ok(step.includes("starts with the user's request verbatim, numbered `S1` to `Sn`"))
  })

  test(`${path} consolidation step requires a citation or a derived reason on every element`, () => {
    const step = consolidationStep(path, pattern)
    assert.ok(step.includes('ends with `[S#]` (one or more) or `[derived: <reason>]`'))
  })

  test(`${path} consolidation step carries the citation rule verbatim`, () => {
    assert.ok(consolidationStep(path, pattern).endsWith(citationRule))
  })
}
