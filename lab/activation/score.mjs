import { findRegressions } from '../evals/compare.mjs'

const SKILL_TOOL_NAME = 'Skill'
const NO_WINNER = 'none'

class EnvironmentFailure extends Error {
  name = 'EnvironmentFailure'
}

export function parseStreamJson(text) {
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

export function findInitEvent(events) {
  return events.find((event) => event.type === 'system' && event.subtype === 'init')
}

function skillInvocations(event) {
  if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return []
  return event.message.content
    .filter((block) => block.type === 'tool_use' && block.name === SKILL_TOOL_NAME)
    .filter((block) => typeof block.input?.skill === 'string')
    .map((block) => block.input.skill)
}

export function firstInvokedSkill(events) {
  return events.flatMap(skillInvocations)[0] ?? null
}

export function findFirstSkill(streamJsonText) {
  const events = parseStreamJson(streamJsonText)
  if (!findInitEvent(events)) {
    throw new EnvironmentFailure('The stream has no system init event. Check that claude started.')
  }
  return firstInvokedSkill(events)
}

function rate(passes, runs) {
  return runs === 0 ? null : passes / runs
}

function countWinners(missedPositives) {
  const winners = {}
  for (const result of missedPositives) {
    const winner = result.activated ?? NO_WINNER
    winners[winner] = (winners[winner] ?? 0) + 1
  }
  return winners
}

function summariseSkill(results) {
  const scored = results.filter((result) => !result.environmentFailure)
  const positives = scored.filter((result) => result.kind === 'positive')
  const nearMisses = scored.filter((result) => result.kind === 'nearMiss')
  const missed = positives.filter((result) => result.activated !== result.skill)
  const falseActivations = nearMisses.filter((result) => result.activated === result.skill)
  const failures = results.filter((result) => result.environmentFailure)
  return {
    positivePasses: positives.length - missed.length,
    positiveRuns: positives.length,
    positiveRate: rate(positives.length - missed.length, positives.length),
    nearMissPasses: nearMisses.length - falseActivations.length,
    nearMissRuns: nearMisses.length,
    nearMissFalseActivations: falseActivations.length,
    falseActivationRate: rate(falseActivations.length, nearMisses.length),
    winners: countWinners(missed),
    environmentFailures: failures.length,
    environmentFailureReasons: failures.map((result) => result.reason),
  }
}

export function summariseActivation(results) {
  const skills = [...new Set(results.map((result) => result.skill))]
  return Object.fromEntries(
    skills.map((skill) => [skill, summariseSkill(results.filter((result) => result.skill === skill))]),
  )
}

const KINDS = [
  { suffix: 'positive', passes: 'positivePasses', runs: 'positiveRuns' },
  { suffix: 'nearMiss', passes: 'nearMissPasses', runs: 'nearMissRuns' },
]

function passCasesOf(skills) {
  const entries = Object.entries(skills).flatMap(([skill, summary]) =>
    KINDS.map((kind) => [`${skill}:${kind.suffix}`, { passes: summary[kind.passes], runs: summary[kind.runs] }]),
  )
  return { cases: Object.fromEntries(entries) }
}

export function findActivationRegressions({ baseline, current }) {
  const regressedCases = findRegressions({
    baseline: passCasesOf(baseline.cases),
    current: passCasesOf(current.cases),
  })
  return [...new Set(regressedCases.map((id) => id.split(':')[0]))].sort()
}
