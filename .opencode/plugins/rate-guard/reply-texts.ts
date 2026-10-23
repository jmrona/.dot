export const SAVE_FAILURE_PREFIX = 'Could not save the hard subagent limit'

export const USAGE_TEXT = 'Use /hard-limit to show the limit or /hard-limit <1-10> to set it.'

export const INFO_REPLY_PATTERN = /^At most \d+ openai\/hard subagents/

export function showLimitText(limit: number): string {
  return `At most ${limit} openai/hard subagents run at once.`
}

export function setLimitText(limit: number): string {
  return `At most ${limit} openai/hard subagents now run at once.`
}
