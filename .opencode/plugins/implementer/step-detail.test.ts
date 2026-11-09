import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildStepDetail, visibleBlocks } from './step-detail.ts'
import { finishStep, startStep, startWave } from './progress.ts'
import type { ProgressStep, StepKey, StepStart } from './progress.ts'

const stepKey: StepKey = { taskID: 'task-a', phase: 'implement', attempt: 1 }
const stepStart: StepStart = { ...stepKey, title: 'Task A', model: 'model-one' }

function stepAfter(finish: 'done' | 'failed' | null, model: string = stepStart.model): ProgressStep {
  const started = startStep(startWave('root-session', 0), { ...stepStart, model }, 1)
  const progress = finish === null ? started : finishStep(started, stepKey, finish, 2)
  return progress.steps[0]
}

function userMessage(text: string): unknown {
  return { type: 'user', text }
}

function assistantMessage(content: readonly unknown[]): unknown {
  return { type: 'assistant', content }
}

function textPart(text: string): unknown {
  return { type: 'text', text }
}

function toolPart(name: string, input: unknown): unknown {
  return { type: 'tool', name, state: { status: 'completed', input } }
}

function toolCallsMessage(names: readonly string[]): unknown {
  return assistantMessage(names.map((name) => toolPart(name, { path: `${name}.ts` })))
}

describe('buildStepDetail', () => {
  it('reports the Running status while the step runs', () => {
    const detail = buildStepDetail(stepAfter(null), [], 'reviewer')

    assert.equal(detail.status, 'Running')
  })

  it('reports the Completed status when the step is done', () => {
    const detail = buildStepDetail(stepAfter('done'), [], 'reviewer')

    assert.equal(detail.status, 'Completed')
  })

  it('reports the Failed status when the step failed', () => {
    const detail = buildStepDetail(stepAfter('failed'), [], 'reviewer')

    assert.equal(detail.status, 'Failed')
  })

  it('reports the model of the step', () => {
    const detail = buildStepDetail(stepAfter(null, 'model-two'), [], 'reviewer')

    assert.equal(detail.model, 'model-two')
  })

  it('reports the given agent name', () => {
    const detail = buildStepDetail(stepAfter(null), [], 'reviewer')

    assert.equal(detail.agent, 'reviewer')
  })

  it('falls back to a dash when the agent is undefined', () => {
    const detail = buildStepDetail(stepAfter(null), [], undefined)

    assert.equal(detail.agent, '-')
  })

  it('falls back to a dash when the agent is empty', () => {
    const detail = buildStepDetail(stepAfter(null), [], '')

    assert.equal(detail.agent, '-')
  })

  it('takes prompt lines from the first user message split on newlines', () => {
    const detail = buildStepDetail(stepAfter(null), [userMessage('Line one\nLine two'), userMessage('Other')], 'a')

    assert.deepEqual(detail.promptLines, ['Line one', 'Line two'])
  })

  it('reports no prompt lines when there is no user message', () => {
    const detail = buildStepDetail(stepAfter(null), [toolCallsMessage(['read'])], 'a')

    assert.deepEqual(detail.promptLines, [])
  })

  it('skips malformed user messages when finding the prompt', () => {
    const messages = [null, { type: 'user' }, { type: 'user', text: 42 }, userMessage('Valid prompt')]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.deepEqual(detail.promptLines, ['Valid prompt'])
  })

  it('lists tool calls of every assistant message in order', () => {
    const messages = [toolCallsMessage(['read']), userMessage('Interleaved'), toolCallsMessage(['edit', 'bash'])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.deepEqual(
      detail.toolCalls.map((call) => call.name),
      ['read', 'edit', 'bash'],
    )
  })

  it('counts every tool call across assistant messages', () => {
    const messages = [toolCallsMessage(['read']), toolCallsMessage(['edit', 'bash'])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.equal(detail.toolCallCount, 3)
  })

  it('summarises a tool call with the first string input value', () => {
    const messages = [assistantMessage([toolPart('read', { count: 3, path: 'src/a.ts', extra: 'x' })])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.equal(detail.toolCalls[0].summary, 'read(src/a.ts)')
  })

  it('collapses whitespace runs in tool call summaries to one space', () => {
    const messages = [assistantMessage([toolPart('bash', { command: 'npm   run\n\tbuild' })])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.equal(detail.toolCalls[0].summary, 'bash(npm run build)')
  })

  it('summarises a tool call without string input as empty parentheses', () => {
    const messages = [assistantMessage([toolPart('read', { count: 3 })])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.equal(detail.toolCalls[0].summary, 'read()')
  })

  it('skips malformed assistant messages and tool parts when collecting tool calls', () => {
    const messages = [
      { type: 'assistant', content: 'not a list' },
      assistantMessage([{ type: 'tool', state: { status: 'completed', input: {} } }, toolPart('glob', {})]),
      null,
    ]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.deepEqual(
      detail.toolCalls.map((call) => call.name),
      ['glob'],
    )
  })

  it('reports null outcome lines while the step runs', () => {
    const messages = [assistantMessage([textPart('Partial answer')])]

    const detail = buildStepDetail(stepAfter(null), messages, 'a')

    assert.equal(detail.outcomeLines, null)
  })

  it('takes outcome lines from the last assistant message with text', () => {
    const messages = [assistantMessage([textPart('First answer')]), assistantMessage([textPart('Final answer')])]

    const detail = buildStepDetail(stepAfter('done'), messages, 'a')

    assert.deepEqual(detail.outcomeLines, ['Final answer'])
  })

  it('ignores tool-only assistant messages when taking the outcome', () => {
    const messages = [assistantMessage([textPart('Written answer')]), toolCallsMessage(['edit'])]

    const detail = buildStepDetail(stepAfter('done'), messages, 'a')

    assert.deepEqual(detail.outcomeLines, ['Written answer'])
  })

  it('splits multi-line text parts into outcome lines', () => {
    const messages = [assistantMessage([textPart('first'), textPart('second\nthird')])]

    const detail = buildStepDetail(stepAfter('done'), messages, 'a')

    assert.deepEqual(detail.outcomeLines, ['first', 'second', 'third'])
  })

  it('ignores reasoning parts when taking the outcome', () => {
    const messages = [assistantMessage([{ type: 'reasoning', text: 'Private thoughts' }, textPart('Done')])]

    const detail = buildStepDetail(stepAfter('done'), messages, 'a')

    assert.deepEqual(detail.outcomeLines, ['Done'])
  })

  it('reports empty outcome lines when no assistant message has text', () => {
    const messages = [toolCallsMessage(['read'])]

    const detail = buildStepDetail(stepAfter('done'), messages, 'a')

    assert.deepEqual(detail.outcomeLines, [])
  })
})

describe('visibleBlocks', () => {
  const promptMessages = [userMessage('Read the plan\nThen edit the file\nRun the tests')]
  const fiveCallMessages = [toolCallsMessage(['read', 'glob', 'grep', 'edit', 'bash'])]
  const fourOutcomeMessages = [assistantMessage([textPart('One\nTwo\nThree\nFour')])]

  it('shows only the first prompt line when collapsed', () => {
    const detail = buildStepDetail(stepAfter(null), promptMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, false).prompt, {
      heading: 'Prompt · 3 lines',
      lines: ['Read the plan'],
      hidden: 2,
    })
  })

  it('shows every prompt line when expanded', () => {
    const detail = buildStepDetail(stepAfter(null), promptMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, true).prompt, {
      heading: 'Prompt · 3 lines',
      lines: ['Read the plan', 'Then edit the file', 'Run the tests'],
      hidden: 0,
    })
  })

  it('shows the last three tool call summaries when collapsed', () => {
    const detail = buildStepDetail(stepAfter(null), fiveCallMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, false).activity, {
      heading: 'Activity · last 3 of 5 tool calls',
      lines: ['grep(grep.ts)', 'edit(edit.ts)', 'bash(bash.ts)'],
      hidden: 2,
    })
  })

  it('shows every tool call summary when expanded', () => {
    const detail = buildStepDetail(stepAfter(null), fiveCallMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, true).activity, {
      heading: 'Activity · 5 tool calls',
      lines: ['read(read.ts)', 'glob(glob.ts)', 'grep(grep.ts)', 'edit(edit.ts)', 'bash(bash.ts)'],
      hidden: 0,
    })
  })

  it('shows the pending outcome while the step runs', () => {
    const detail = buildStepDetail(stepAfter(null), fourOutcomeMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, false).outcome, {
      heading: 'Outcome',
      lines: ['pending'],
      hidden: 0,
    })
  })

  it('shows the first three outcome lines when collapsed', () => {
    const detail = buildStepDetail(stepAfter('done'), fourOutcomeMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, false).outcome, {
      heading: 'Outcome · 4 lines',
      lines: ['One', 'Two', 'Three'],
      hidden: 1,
    })
  })

  it('shows every outcome line when expanded', () => {
    const detail = buildStepDetail(stepAfter('done'), fourOutcomeMessages, 'a')

    assert.deepEqual(visibleBlocks(detail, true).outcome, {
      heading: 'Outcome · 4 lines',
      lines: ['One', 'Two', 'Three', 'Four'],
      hidden: 0,
    })
  })
})
