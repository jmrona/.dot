import fs from 'node:fs'
import path from 'node:path'

const PARENT_AGENT = 'parent'

function findParentTranscript({ projectsDir, sessionId }) {
  if (!fs.existsSync(projectsDir)) return undefined
  return fs
    .readdirSync(projectsDir)
    .map((project) => path.join(projectsDir, project, `${sessionId}.jsonl`))
    .find((candidate) => fs.existsSync(candidate))
}

const WORKFLOWS_DIRECTORY = 'workflows'

function transcriptFilesIn(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(directory, name))
}

function workflowRunDirectories(subagentsDirectory) {
  const workflowsDirectory = path.join(subagentsDirectory, WORKFLOWS_DIRECTORY)
  if (!fs.existsSync(workflowsDirectory)) return []
  return fs
    .readdirSync(workflowsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workflowsDirectory, entry.name))
}

function subagentTranscripts({ parentTranscript, sessionId }) {
  const directory = path.join(path.dirname(parentTranscript), sessionId, 'subagents')
  if (!fs.existsSync(directory)) return []
  const files = [
    ...transcriptFilesIn(directory),
    ...workflowRunDirectories(directory).flatMap((runDirectory) => transcriptFilesIn(runDirectory)),
  ]
  return files.map((file) => ({ file, agent: path.basename(file, '.jsonl') }))
}

const CONVERSATION_LINE_TYPES = ['assistant', 'user']

function parseLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
    .filter((line) => CONVERSATION_LINE_TYPES.includes(line.type) && line.timestamp)
}

function contentBlocks(line) {
  const content = line.message?.content
  return Array.isArray(content) ? content : []
}

function resultText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
}

function entriesOf({ file, agent }) {
  const lines = parseLines(file)
  const results = new Map(
    lines
      .flatMap(contentBlocks)
      .filter((block) => block.type === 'tool_result')
      .map((block) => [block.tool_use_id, block]),
  )
  return lines.flatMap((line) =>
    contentBlocks(line)
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        timestamp: line.timestamp,
        name: block.name,
        input: block.input,
        result: resultText(results.get(block.id)?.content),
        isError: results.get(block.id)?.is_error === true,
        agent,
      })),
  )
}

export function loadTimeline({ projectsDir, sessionId }) {
  const parentTranscript = findParentTranscript({ projectsDir, sessionId })
  if (!parentTranscript) return undefined
  const sources = [
    { file: parentTranscript, agent: PARENT_AGENT },
    ...subagentTranscripts({ parentTranscript, sessionId }),
  ]
  return sources.flatMap(entriesOf).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}
