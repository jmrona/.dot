# Routine skill dispatch

## Ownership

OpenCode's native skill loader does not select a model from skill metadata. A skill's `metadata.model` is only a documented alias policy marker; native delegation through the configured `utility` agent performs the routing.

For a routine skill request, the parent invokes the skill, gathers its prerequisites and permitted evidence, then delegates the complete task through the native subagent interface to the configured visible utility agent:

```ts
subagent({ agent: 'utility', description: 'Run the requested routine skill', prompt: fullBrief })
```

A new call omits `sessionID`. To continue work, use only the child ID returned by an earlier call for that same child. Do not add a model override, a variant, a fallback, or a per-skill effort setting.

The parent owns prerequisite flows, human questions, current tool-catalogue discovery, project/source inspection, other tool operations, and any writes. It supplies the utility with a complete brief, task inputs, relevant source or tool evidence, and only the user data that the particular skill permits and needs. The utility may read skill methods but must never read private profile or coaching data itself; the parent supplies only permitted results and never sends unnecessary private data.

After delegation, the parent relays the utility's result and does not independently redo the child's content. If native delegation or the provider fails, report that failure explicitly as `BLOCKED`. Never silently substitute another model or execution path.

## Utility child

When already running as the utility child, load or follow the named routine skill method and execute it directly. Do not delegate again, invoke a parent-only prerequisite flow, or attempt to call the parent. The child is read-only: it does not use shell or other discovery tools, launch nested agents, ask the human questions, or perform writes. The parent supplies the outputs of any required lookups or operations.

The child starts from a fresh complete context supplied in the brief. Use only the brief and evidence supplied by the parent; do not infer missing conversation context or fetch it independently. If required context, evidence, or an explicit status is missing, return `NEEDS_CONTEXT` with the precise missing items so the parent can gather them and resume the same child. Never invent results or profile status.
