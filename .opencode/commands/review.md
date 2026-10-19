---
description: Run an independent implementation or specification review in a hard-model child session.
agent: code-reviewer
model: openai/hard
subagent: true
---

Independently review the complete request and materials below:

$ARGUMENTS

The child may not receive the rest of the conversation or project context. Apply the relevant review checklist supplied with the materials or available in the project rules; identify missing context as NEEDS_CONTEXT for the parent. Report actionable findings with severity and file references, or state that no findings were found and note review limits. This command is the review; do not invoke review orchestration or launch another reviewer.
