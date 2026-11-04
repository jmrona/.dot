import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadTimeline } from './timeline.mjs'

const SESSION = 'session-1'

function makeProjectsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-test-'))
}

function writeTranscript(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
}

function toolUseLine({ timestamp, id, name = 'Bash', input = { command: 'ls' } }) {
  return { type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id, name, input }] } }
}

function toolResultLine({ timestamp, id, content, isError }) {
  const block = { type: 'tool_result', tool_use_id: id, content }
  if (isError !== undefined) block.is_error = isError
  return { type: 'user', timestamp, message: { content: [block] } }
}

function parentPath(projectsDir, project = 'project-a') {
  return path.join(projectsDir, project, `${SESSION}.jsonl`)
}

function subagentPath(projectsDir, name) {
  return path.join(projectsDir, 'project-a', SESSION, 'subagents', `${name}.jsonl`)
}

function loadFrom(projectsDir) {
  return loadTimeline({ projectsDir, sessionId: SESSION })
}

test('loadTimeline returns undefined when no project holds the session transcript', () => {
  assert.equal(loadFrom(makeProjectsDir()), undefined)
})

test('loadTimeline returns undefined when the projects directory does not exist', () => {
  assert.equal(loadFrom(path.join(makeProjectsDir(), 'missing')), undefined)
})

test('loadTimeline pairs a tool use with its string result by id', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a', input: { command: 'node --test' } }),
    toolResultLine({ timestamp: '2026-01-01T00:00:02Z', id: 'a', content: 'fail 0' }),
  ])
  const [entry] = loadFrom(projectsDir)
  assert.deepEqual(
    [entry.name, entry.input, entry.result, entry.isError],
    ['Bash', { command: 'node --test' }, 'fail 0', false],
  )
})

test('loadTimeline joins the text parts of a list result', () => {
  const projectsDir = makeProjectsDir()
  const content = [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }]
  writeTranscript(parentPath(projectsDir), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a' }),
    toolResultLine({ timestamp: '2026-01-01T00:00:02Z', id: 'a', content }),
  ])
  assert.equal(loadFrom(projectsDir)[0].result, 'one\ntwo')
})

test('loadTimeline marks a result flagged as an error', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a' }),
    toolResultLine({ timestamp: '2026-01-01T00:00:02Z', id: 'a', content: 'boom', isError: true }),
  ])
  assert.equal(loadFrom(projectsDir)[0].isError, true)
})

test('loadTimeline gives an unanswered tool use an empty result', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a' })])
  assert.deepEqual([loadFrom(projectsDir)[0].result, loadFrom(projectsDir)[0].isError], ['', false])
})

test('loadTimeline orders parent and subagent tool uses by timestamp', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'p1', name: 'Skill', input: {} }),
    toolUseLine({ timestamp: '2026-01-01T00:00:03Z', id: 'p2', name: 'Read', input: {} }),
  ])
  writeTranscript(subagentPath(projectsDir, 'agent-x'), [
    toolUseLine({ timestamp: '2026-01-01T00:00:02Z', id: 's1', name: 'Write', input: {} }),
  ])
  assert.deepEqual(loadFrom(projectsDir).map((entry) => entry.name), ['Skill', 'Write', 'Read'])
})

test('loadTimeline names the parent and each subagent as the agent of an entry', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'p1' })])
  writeTranscript(subagentPath(projectsDir, 'agent-x'), [
    toolUseLine({ timestamp: '2026-01-01T00:00:02Z', id: 's1' }),
  ])
  assert.deepEqual(loadFrom(projectsDir).map((entry) => entry.agent), ['parent', 'agent-x'])
})

test('loadTimeline pairs results inside the transcript that holds the tool use', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'same' }),
    toolResultLine({ timestamp: '2026-01-01T00:00:02Z', id: 'same', content: 'parent result' }),
  ])
  writeTranscript(subagentPath(projectsDir, 'agent-x'), [
    toolUseLine({ timestamp: '2026-01-01T00:00:03Z', id: 'same' }),
    toolResultLine({ timestamp: '2026-01-01T00:00:04Z', id: 'same', content: 'agent result' }),
  ])
  assert.deepEqual(loadFrom(projectsDir).map((entry) => entry.result), ['parent result', 'agent result'])
})

test('loadTimeline finds the transcript among several project directories', () => {
  const projectsDir = makeProjectsDir()
  fs.mkdirSync(path.join(projectsDir, 'project-other'))
  writeTranscript(parentPath(projectsDir, 'project-b'), [
    toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a', name: 'Glob', input: {} }),
  ])
  assert.equal(loadFrom(projectsDir)[0].name, 'Glob')
})

test('loadTimeline returns an empty timeline for a transcript with no tool use', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [{ type: 'summary' }])
  assert.deepEqual(loadFrom(projectsDir), [])
})

test('the timeline includes the transcripts of agents spawned by a workflow run', () => {
  const projectsDir = makeProjectsDir()
  writeTranscript(parentPath(projectsDir), [toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'p1' })])
  const workflowAgentPath = path.join(
    projectsDir,
    'project-a',
    SESSION,
    'subagents',
    'workflows',
    'wf_x',
    'agent-w1.jsonl',
  )
  writeTranscript(workflowAgentPath, [
    toolUseLine({ timestamp: '2026-01-01T00:00:02Z', id: 'w1', name: 'Write', input: {} }),
  ])
  assert.equal(
    loadFrom(projectsDir).some((entry) => entry.agent === 'agent-w1' && entry.name === 'Write'),
    true,
  )
})

function blobLine(line) {
  return { type: 'api-request-blob', message: line.message }
}

function transcriptWithBlobs(projectsDir) {
  const first = toolUseLine({ timestamp: '2026-01-01T00:00:01Z', id: 'a', name: 'Read', input: {} })
  const second = toolUseLine({ timestamp: '2026-01-01T00:00:03Z', id: 'b', name: 'Write', input: {} })
  writeTranscript(parentPath(projectsDir), [
    blobLine(second),
    first,
    toolResultLine({ timestamp: '2026-01-01T00:00:02Z', id: 'a', content: 'ok' }),
    blobLine(first),
    second,
  ])
}

test('loadTimeline lists each tool use once when blob lines copy the assistant messages', () => {
  const projectsDir = makeProjectsDir()
  transcriptWithBlobs(projectsDir)
  assert.deepEqual(loadFrom(projectsDir).map((entry) => entry.name), ['Read', 'Write'])
})

test('loadTimeline keeps timestamps in non-decreasing order when blob lines lack a timestamp', () => {
  const projectsDir = makeProjectsDir()
  transcriptWithBlobs(projectsDir)
  const stamps = loadFrom(projectsDir).map((entry) => Date.parse(entry.timestamp))
  assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b))
})

test('loadTimeline gives every entry a parseable timestamp', () => {
  const projectsDir = makeProjectsDir()
  transcriptWithBlobs(projectsDir)
  assert.equal(loadFrom(projectsDir).every((entry) => !Number.isNaN(Date.parse(entry.timestamp))), true)
})
