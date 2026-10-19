import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const smokeEnabled = process.env.OPENCODE_ROUTING_SMOKE === '1'
const commitPrompt = 'This is a read-only commit-message request, not an instruction to create a commit or edit files. Give me only a conventional commit message for this complete change: update the copyright year in a documentation footer from 2025 to 2026. Ticket key SYNTH-1 is supplied. There is no repository and no git command is needed. The description and ticket key are the full input.'
const reviewPrompt = 'Please independently review this self-contained Python change for correctness. This is a read-only review of an inline specimen, not a code-edit request. There is no repository and no git commands are needed; the inline before/after is the entire review range. Before: def ratio(total, count): return total / count. After: def ratio(total, count): return total // count. Requirement: return the exact mathematical mean as a float for integer total and count. Example: total=5,count=2 should return 2.5. Do not implement a fix. Report concrete defects briefly.'

async function api(method, path, payload, cwd, timeout = 30000) {
  const args = [method, path]
  if (payload !== undefined) args.push('--data', JSON.stringify(payload))
  const { stdout } = await execFileAsync('opencode', ['api', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout,
  })
  const output = stdout.trim()
  return output ? JSON.parse(output) : undefined
}

function sessionIDFrom(response) {
  return response?.data?.id
}

function sessionPermissions() {
  const dataPath = resolve(homedir(), '.config/opencode/data/**')
  return [
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'shell', resource: '*', effect: 'deny' },
    { action: 'question', resource: '*', effect: 'deny' },
    { action: 'read', resource: dataPath, effect: 'deny' },
  ]
}

function messagesFrom(response) {
  assert.ok(Array.isArray(response?.data), 'The session messages response contains data')
  return response.data
}

function toolCallsFrom(messages) {
  return messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .filter((part) => part.type === 'tool' && part.name === 'subagent')
}

function textFrom(message) {
  const content = Array.isArray(message.content) ? message.content : []
  return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
}

function latestAssistant(messages) {
  return messages.filter((message) => message.type === 'assistant').at(-1)
}

function childSessionID(toolCall) {
  const metadataID = toolCall.state?.metadata?.sessionID
  if (metadataID) return metadataID
  const content = toolCall.state?.content
  const result = typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n')
  return result.match(/\bses_[A-Za-z0-9_-]+\b/)?.[0]
}

function verificationDirectory() {
  const base = process.env.OPENCODE_VERIFICATION_DIR || tmpdir()
  mkdirSync(base, { recursive: true, mode: 0o700 })
  return mkdtempSync(join(base, 'opencode-routing-'))
}

function createEvidence(title) {
  return {
    title,
    invokedAgents: [],
    parentSessionID: null,
    parentAlias: null,
    childSessionID: null,
    childAlias: null,
    toolStatus: null,
  }
}

function writeEvidence(directory, evidence) {
  appendFileSync(join(directory, 'routing-evidence.jsonl'), `${JSON.stringify(evidence)}\n`, { mode: 0o600 })
}

async function createSession(request, title, sandbox) {
  const response = await request('post', '/api/session', {
    title,
    agent: 'build',
    location: { directory: sandbox },
    permissions: sessionPermissions(),
  })
  const sessionID = sessionIDFrom(response)
  assert.ok(typeof sessionID === 'string' && sessionID.startsWith('ses_'), 'A fresh session was created')
  return sessionID
}

function isTimeout(error) {
  return error?.code === 'ETIMEDOUT' || error?.killed === true
}

async function promptAndWait(request, sessionID, prompt) {
  try {
    await request('post', `/api/session/${sessionID}/prompt`, { text: prompt })
    await request('post', `/api/experimental/session/${sessionID}/wait`, undefined, 180000)
  } catch (error) {
    if (!isTimeout(error)) throw error
    await request('post', `/api/session/${sessionID}/interrupt`)
    throw error
  }
}

async function loadMessages(request, sessionID) {
  const response = await request('get', `/api/session/${sessionID}/message?limit=100&order=asc`)
  return messagesFrom(response)
}

function assertParentAlias(messages, evidence) {
  const reply = latestAssistant(messages)
  assert.ok(reply, 'The parent session returned an assistant response')
  evidence.parentAlias = reply.model?.id
  assert.equal(reply.model?.providerID, 'openai')
  assert.equal(reply.model?.id, 'easy', 'The parent uses the default build alias')
}

function recordInvocations(messages, evidence) {
  const toolCalls = toolCallsFrom(messages)
  evidence.invokedAgents = toolCalls.map((toolCall) => ({
    agent: toolCall.state?.input?.agent,
    status: toolCall.state?.status,
    childSessionID: childSessionID(toolCall) ?? null,
  }))
  return toolCalls
}

function expectedRoute(toolCalls, expectedAgent, evidence) {
  const route = toolCalls.find((toolCall) => toolCall.state?.input?.agent === expectedAgent)
  assert.ok(route, `Expected automatic routing to ${expectedAgent}; actual routes: ${JSON.stringify(evidence.invokedAgents)}`)
  evidence.toolStatus = route.state?.status
  assert.equal(route.state?.status, 'completed')
  assert.equal(route.state?.input?.sessionID, undefined, 'The subagent call creates a fresh child session')
  assert.equal(route.state?.input?.model, undefined, 'Routing selects the model without a manual override')
  return route
}

async function assertChildRoute(request, route, expectedAgent, expectedAlias, evidence, responseCheck) {
  const childID = childSessionID(route)
  assert.ok(childID, 'The completed subagent call identifies its child session')
  evidence.childSessionID = childID
  const childMessages = await loadMessages(request, childID)
  const reply = latestAssistant(childMessages)
  assert.ok(reply, 'The child session returned an assistant response')
  evidence.childAlias = reply.model?.id
  assert.equal(reply.model?.providerID, 'openai')
  assert.equal(reply.model?.id, expectedAlias, `The ${expectedAgent} child uses its configured alias`)
  responseCheck(textFrom(reply))
}

async function checkAutomaticRoute({ title, prompt, expectedAgent, expectedAlias, responseCheck }) {
  const evidenceDirectory = verificationDirectory()
  const sandbox = join(evidenceDirectory, 'sandbox')
  mkdirSync(sandbox, { mode: 0o700 })
  const evidence = createEvidence(title)
  const request = (method, path, payload, timeout) => api(method, path, payload, sandbox, timeout)
  try {
    const sessionID = await createSession(request, title, sandbox)
    evidence.parentSessionID = sessionID
    await promptAndWait(request, sessionID, prompt)
    const parentMessages = await loadMessages(request, sessionID)
    assertParentAlias(parentMessages, evidence)
    const route = expectedRoute(recordInvocations(parentMessages, evidence), expectedAgent, evidence)
    await assertChildRoute(request, route, expectedAgent, expectedAlias, evidence, responseCheck)
  } finally {
    writeEvidence(evidenceDirectory, evidence)
  }
}

function createTimedOutRequest(failedPath, calls) {
  return async (method, path) => {
    calls.push(path)
    if (path === failedPath) throw Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })
  }
}

async function assertTimeoutInterrupt(failedPath, expectedCalls) {
  const calls = []
  const request = createTimedOutRequest(failedPath, calls)
  await assert.rejects(promptAndWait(request, 'ses_fixture', 'fixture prompt'), { code: 'ETIMEDOUT' })
  assert.deepEqual(calls, expectedCalls)
}

test('extracts native subagent tool calls from assistant content', () => {
  const toolCall = { type: 'tool', name: 'subagent', state: { input: { agent: 'utility' } } }
  const messages = [{ type: 'assistant', content: [toolCall] }]

  assert.deepEqual(toolCallsFrom(messages), [toolCall])
})

test('extracts native assistant text from message content', () => {
  const message = { type: 'assistant', content: [{ type: 'text', text: 'review result' }] }

  assert.equal(textFrom(message), 'review result')
})

test('unwraps the session ID from the native create response', () => {
  assert.equal(sessionIDFrom({ data: { id: 'ses_fixture' } }), 'ses_fixture')
})

test('builds native deny permissions for tools and global data', () => {
  const dataPath = resolve(homedir(), '.config/opencode/data/**')

  assert.deepEqual(sessionPermissions(), [
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'shell', resource: '*', effect: 'deny' },
    { action: 'question', resource: '*', effect: 'deny' },
    { action: 'read', resource: dataPath, effect: 'deny' },
  ])
})

test('extracts a child session ID from the native subagent result', () => {
  const toolCall = {
    type: 'tool',
    name: 'subagent',
    state: { content: [{ type: 'text', text: 'Started child session ses_child_fixture' }], metadata: {} },
  }

  assert.equal(childSessionID(toolCall), 'ses_child_fixture')
})

test('interrupts an owned session when prompt submission times out', async () => {
  await assertTimeoutInterrupt('/api/session/ses_fixture/prompt', [
    '/api/session/ses_fixture/prompt',
    '/api/session/ses_fixture/interrupt',
  ])
})

test('interrupts an owned session when waiting times out', async () => {
  await assertTimeoutInterrupt('/api/experimental/session/ses_fixture/wait', [
    '/api/session/ses_fixture/prompt',
    '/api/experimental/session/ses_fixture/wait',
    '/api/session/ses_fixture/interrupt',
  ])
})

test('automatically routes a conventional commit-message request to the utility agent', {
  skip: !smokeEnabled,
}, async () => {
  await checkAutomaticRoute({
    title: 'Automatic routing smoke: commit message',
    prompt: commitPrompt,
    expectedAgent: 'utility',
    expectedAlias: 'easy',
    responseCheck: (reply) => assert.match(reply, /SYNTH-1/),
  })
})

test('automatically routes an inline correctness review to code-reviewer', {
  skip: !smokeEnabled,
}, async () => {
  await checkAutomaticRoute({
    title: 'Automatic routing smoke: code review',
    prompt: reviewPrompt,
    expectedAgent: 'code-reviewer',
    expectedAlias: 'hard',
    responseCheck: (reply) => assert.match(reply, /integer|truncat|floor|2\.5/i),
  })
})
