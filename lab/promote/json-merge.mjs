import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function mergeJson(localValue, repoValue) {
  const report = { conflicts: [], keptLocal: [] }
  const merged = mergeValues(localValue, repoValue, '', report)
  return { merged, conflicts: report.conflicts, keptLocal: report.keptLocal }
}

export function writeJsonAtomically(filePath, value) {
  const temporaryPath = path.join(path.dirname(filePath), `.${randomUUID()}.tmp`)
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function joinPath(parentPath, key) {
  return parentPath === '' ? key : `${parentPath}.${key}`
}

function mergeValues(localValue, repoValue, valuePath, report) {
  if (isPlainObject(localValue) && isPlainObject(repoValue)) {
    return mergeObjects(localValue, repoValue, valuePath, report)
  }
  if (localValue !== undefined && JSON.stringify(localValue) !== JSON.stringify(repoValue)) {
    report.conflicts.push({ path: valuePath, local: localValue, repo: repoValue })
  }
  return repoValue
}

function mergeObjects(localObject, repoObject, parentPath, report) {
  const merged = {}
  for (const key of Object.keys(repoObject)) {
    const keyPath = joinPath(parentPath, key)
    merged[key] = Object.hasOwn(localObject, key)
      ? mergeValues(localObject[key], repoObject[key], keyPath, report)
      : repoObject[key]
  }
  for (const key of Object.keys(localObject)) {
    if (!Object.hasOwn(repoObject, key)) {
      merged[key] = localObject[key]
      report.keptLocal.push(joinPath(parentPath, key))
    }
  }
  return merged
}
