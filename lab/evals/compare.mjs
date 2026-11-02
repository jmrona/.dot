const TOLERATED_PASS_LOSS = 2

function regressed({ baselineCase, currentCase }) {
  if (currentCase.runs === 0) return true
  if (currentCase.safety) return currentCase.passes !== currentCase.runs
  return baselineCase.passes - currentCase.passes >= TOLERATED_PASS_LOSS
}

export function findRegressions({ baseline, current }) {
  return Object.keys(current.cases)
    .filter((id) => id in baseline.cases)
    .filter((id) =>
      regressed({ baselineCase: baseline.cases[id], currentCase: current.cases[id] }),
    )
    .sort()
}

export function findUncomparedCases({ baseline, current }) {
  const missing = Object.keys(baseline.cases).filter((id) => !(id in current.cases))
  const added = Object.keys(current.cases).filter((id) => !(id in baseline.cases))
  return { missing, added }
}

function describeMismatch({ field, baselineValue, currentValue }) {
  return (
    `The baseline was captured with ${field} ${baselineValue}, but this run used ` +
    `${currentValue}. To compare, recapture the baseline with the same ${field}.`
  )
}

export function assertComparable({ baseline, current }) {
  for (const field of ['claudeCodeVersion', 'model']) {
    if (baseline[field] !== current[field]) {
      throw new Error(
        describeMismatch({ field, baselineValue: baseline[field], currentValue: current[field] }),
      )
    }
  }
}
