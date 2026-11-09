import type { ProgressStep, StepState } from './progress.ts'

export interface ToolCall { readonly name: string; readonly summary: string }
export interface StepDetail { readonly status: 'Running' | 'Completed' | 'Failed'; readonly model: string; readonly agent: string; readonly toolCallCount: number; readonly promptLines: readonly string[]; readonly toolCalls: readonly ToolCall[]; readonly outcomeLines: readonly string[] | null }
export interface BlockView { readonly heading: string; readonly lines: readonly string[]; readonly hidden: number }
export interface CardBlocks { readonly prompt: BlockView; readonly activity: BlockView; readonly outcome: BlockView }

interface UserMessage { readonly type: 'user'; readonly text: string }
interface AssistantMessage { readonly type: 'assistant'; readonly content: readonly unknown[] }
interface TextPart { readonly type: 'text'; readonly text: string }
interface ToolPart { readonly type: 'tool'; readonly name: string; readonly state: { readonly status: string; readonly input: unknown } }

type RecordValue = Record<string, unknown>

const STATUS_BY_STATE: Readonly<Record<StepState, StepDetail['status']>> = {
  running: 'Running',
  done: 'Completed',
  failed: 'Failed',
}
const SEPARATOR = ' · '
const ACTIVITY_VISIBLE_COUNT = 3
const OUTCOME_VISIBLE_COUNT = 3
const PROMPT_VISIBLE_COUNT = 1
const PENDING_LINE = 'pending'

export function buildStepDetail(step: ProgressStep, messages: readonly unknown[], agent: string | undefined): StepDetail {
  const toolCalls = collectToolCalls(messages)
  return {
    status: STATUS_BY_STATE[step.state],
    model: step.model,
    agent: agent === undefined || agent.length === 0 ? '-' : agent,
    toolCallCount: toolCalls.length,
    promptLines: findPromptLines(messages),
    toolCalls,
    outcomeLines: step.state === 'running' ? null : findOutcomeLines(messages),
  }
}

export function visibleBlocks(detail: StepDetail, expanded: boolean): CardBlocks {
  return {
    prompt: promptBlock(detail.promptLines, expanded),
    activity: activityBlock(detail.toolCalls, expanded),
    outcome: outcomeBlock(detail.outcomeLines, expanded),
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null
}

function isUserMessage(message: unknown): message is UserMessage {
  return isRecord(message) && message.type === 'user' && typeof message.text === 'string'
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return isRecord(message) && message.type === 'assistant' && Array.isArray(message.content)
}

function isTextPart(part: unknown): part is TextPart {
  return isRecord(part) && part.type === 'text' && typeof part.text === 'string'
}

function isToolPart(part: unknown): part is ToolPart {
  return (
    isRecord(part) &&
    part.type === 'tool' &&
    typeof part.name === 'string' &&
    isRecord(part.state) &&
    typeof part.state.status === 'string'
  )
}

function findPromptLines(messages: readonly unknown[]): readonly string[] {
  const firstUserMessage = messages.find(isUserMessage)
  return firstUserMessage === undefined ? [] : firstUserMessage.text.split('\n')
}

function collectToolCalls(messages: readonly unknown[]): readonly ToolCall[] {
  return messages
    .filter(isAssistantMessage)
    .flatMap((message) => message.content.filter(isToolPart))
    .map(describeToolCall)
}

function describeToolCall(part: ToolPart): ToolCall {
  return { name: part.name, summary: `${part.name}(${summariseInput(part.state.input)})` }
}

function summariseInput(input: unknown): string {
  if (!isRecord(input)) {
    return ''
  }
  const firstString = Object.values(input).find((value): value is string => typeof value === 'string')
  return firstString === undefined ? '' : firstString.replace(/\s+/g, ' ')
}

function findOutcomeLines(messages: readonly unknown[]): readonly string[] {
  const lastTextLines = messages
    .filter(isAssistantMessage)
    .map((message) => message.content.filter(isTextPart).map((part) => part.text))
    .filter((texts) => texts.length > 0)
    .at(-1)
  return lastTextLines === undefined ? [] : lastTextLines.join('\n').split('\n')
}

function promptBlock(lines: readonly string[], expanded: boolean): BlockView {
  return viewBlock(`Prompt${SEPARATOR}${lines.length} lines`, lines, visibleLines(lines, PROMPT_VISIBLE_COUNT, expanded))
}

function activityBlock(toolCalls: readonly ToolCall[], expanded: boolean): BlockView {
  const summaries = toolCalls.map((call) => call.summary)
  if (expanded) {
    return viewBlock(`Activity${SEPARATOR}${summaries.length} tool calls`, summaries, summaries)
  }
  const lastSummaries = summaries.slice(-ACTIVITY_VISIBLE_COUNT)
  return viewBlock(
    `Activity${SEPARATOR}last ${lastSummaries.length} of ${summaries.length} tool calls`,
    summaries,
    lastSummaries,
  )
}

function outcomeBlock(outcomeLines: readonly string[] | null, expanded: boolean): BlockView {
  if (outcomeLines === null) {
    return { heading: 'Outcome', lines: [PENDING_LINE], hidden: 0 }
  }
  return viewBlock(
    `Outcome${SEPARATOR}${outcomeLines.length} lines`,
    outcomeLines,
    visibleLines(outcomeLines, OUTCOME_VISIBLE_COUNT, expanded),
  )
}

function visibleLines(lines: readonly string[], limit: number, expanded: boolean): readonly string[] {
  return expanded ? lines : lines.slice(0, limit)
}

function viewBlock(heading: string, lines: readonly string[], visible: readonly string[]): BlockView {
  return { heading, lines: visible, hidden: lines.length - visible.length }
}
