---
description: Implement an explicitly approved bounded task in an easy-model child session.
agent: stack-specialist
model: openai/easy
subagent: true
---

Implement only the explicitly approved task described in the full command arguments below:

$ARGUMENTS

The child may not receive the rest of the conversation or project context. Do not treat this command invocation as design approval or bypass brainstorming and design approval. If approval or essential context is not present in the supplied brief, stop and return NEEDS_CONTEXT for the parent. Otherwise keep the implementation within the approved scope and report changes, checks, tests, and remaining risks to the parent.
