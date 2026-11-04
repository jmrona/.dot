import fs from 'node:fs'

const META_PREFIX = 'export const meta ='
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

export async function parallel(thunks) {
  return Promise.all(thunks.map(settleToNull))
}

async function settleToNull(thunk) {
  try {
    return await thunk()
  } catch {
    return null
  }
}

export async function pipeline(items, ...stages) {
  return Promise.all(items.map((item, index) => runStages(stages, item, index)))
}

async function runStages(stages, item, index) {
  let previous = item
  try {
    for (const stage of stages) {
      previous = await stage(previous, item, index)
    }
    return previous
  } catch {
    return null
  }
}

function forbiddenInWorkflow(name) {
  return () => {
    throw new Error(`${name} is not available inside a workflow script`)
  }
}

const RuntimeDate = new Proxy(Date, {
  construct(target, constructorArguments) {
    if (constructorArguments.length === 0) forbiddenInWorkflow('new Date()')()
    return Reflect.construct(target, constructorArguments)
  },
  get(target, property) {
    if (property === 'now') return forbiddenInWorkflow('Date.now()')
    return Reflect.get(target, property)
  },
})

const RuntimeMath = Object.create(Math, { random: { value: forbiddenInWorkflow('Math.random()') } })

export async function runWorkflow(scriptPath, { agent, args, phase = () => {}, log = () => {} }) {
  const source = fs.readFileSync(scriptPath, 'utf8')
  if (!source.startsWith(META_PREFIX)) {
    throw new Error(`${scriptPath} must begin with "${META_PREFIX}"`)
  }
  const body = `const meta =${source.slice(META_PREFIX.length)}`
  const run = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'Date', 'Math', body)
  return run(agent, parallel, pipeline, phase, log, args, RuntimeDate, RuntimeMath)
}
