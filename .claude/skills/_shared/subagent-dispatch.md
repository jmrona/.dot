# Subagent Dispatch - Procedural Rules

These rules apply to every subagent dispatch made from inside a skill. They are the procedural detail behind the iron laws in `../../rules/common/subagents.md`. The iron laws (context isolation, the git ban, the worktree ban, the privilege ban) live in the always-on rule file and bind whether or not a skill is running. The rules below govern *how* a dispatch is constructed and managed once a skill has decided to dispatch.

Any skill that dispatches a subagent **MUST** read this file before its first dispatch. This includes `subagent-driven-development`, `dispatching-parallel-agents`, `fast-path-implementation`, `brainstorming-committee`, `debugging`, `test-driven-development`, `requesting-code-review` and `design-review`.

## Subagent Type Selection

Before every dispatch, you **MUST** check the available subagent types and select the most specific one that fits the task. Generic agents produce generic work; specialised agents understand their domain, follow its conventions, and catch domain-specific issues a general-purpose agent will miss.

The selection process:

1. Identify the language, framework, or domain the task involves
2. Scan the subagent types the current session lists as available for a match (for example, a type named for the task's language or framework, or for code review)
3. If a specialised type matches, use it via the `subagent_type` parameter
4. Fall back to `general-purpose` only when no specialised type fits

This applies to implementers and reviewers equally. A TypeScript task gets a TypeScript implementer and a code-review specialist, not two general-purpose agents.

When decomposing work into tasks, you **MUST** annotate each task with its recommended subagent type during decomposition, not at dispatch time. This makes the choice explicit and reviewable.

## Model Selection

You **MUST** use the cheapest model capable of the task. This is cost and speed discipline, not a suggestion. Choose exactly one concrete model per dispatch.

### Tier Table

| Tier                | Task signal                                    | Anthropic family                                                     | OpenAI family |
|---------------------|------------------------------------------------|----------------------------------------------------------------------|---------------|
| Low-cost default    | Clear spec, 1-3 files in one directory, no tree operations | Haiku                                                                | Luna          |
| Standard escalation | Multi-file integration, judgement              | Sonnet                                                               | Terra         |
| High-capability     | Design judgement, broad codebase understanding | Opus (the inherited session model is also an acceptable choice here) | Sol           |

The Anthropic and OpenAI columns are worked examples, not an allowlist. Some harnesses are provider-agnostic: they may expose providers from any vendor in any combination, so no table that enumerates vendors can ever be authoritative on its own. Treat the table as a guide to tiers and use the resolution procedure below to pick a concrete model for any provider the environment exposes, listed here or not.

### Resolution Procedure

Naming a tier is not the same as producing a value the harness will accept. Before every dispatch:

1. Always enumerate the models the current environment actually exposes by reading the `model` enum on the Agent tool schema, which is the set of values the harness will accept.
2. Map the chosen tier to a concrete value from that enumeration.
3. Never construct an identifier from a pattern. Recognising the shape of an identifier is not the same as confirming it exists.
4. If no family listed in the tier table is exposed, order the available models from cheapest to most capable and take the cheapest one that is still capable of the task.
5. If enumeration is impossible, use the inherited session model and state in your response to the user that you did so. Never fall back silently.

### Escalation Triggers

Start at the Low-cost default tier. Escalate exactly one tier at a time, and only on evidence: a failed attempt at the current tier, or a stated complexity signal from the task (multi-file integration, design judgement, broad codebase understanding). You **MUST NOT** pre-escalate on the assumption that a task might be hard. One failed inexpensive attempt costs less than always paying for the expensive model.

Within `subagent-driven-development`, a task whose difficulty is unsure starts at the Standard escalation tier, as a scoped exception to that ban. The reason is that a wave lasts as long as its slowest task, so one failed inexpensive attempt costs a whole wave round. The High-capability tier is still reached only by escalation on evidence.

Within `design-review`, the reviewer starts at the Standard escalation tier, as a second scoped exception, because the Low-cost default tier blocked clean designs.

If an implementer returns `BLOCKED` with a reasoning-capacity cause, dispatch a new `Agent` one tier up in the same wave. `SendMessage` continues an agent on its own model. The new agent's brief states that the partial edits in its `writes` are still in the tree.

Some tasks are complexity signals: copying, moving, backing up or restructuring files across more than one directory. Rewriting an existing file whose full contents the subagent was not given is another. Start those tasks at the Standard escalation tier. A subagent can need one rework for a structural error, such as a flattened layout, a whole-file overwrite after a failed edit or lost numbering. In that case, escalate one tier for the retry. Do not dispatch the same tier again.

### Rationalisation Prevention

Every thought below means **stop and re-run the resolution procedure**:

| You might think...                                      | Reality                                                                                                                                                           |
|---------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| "I know the naming pattern, I can write the identifier" | Recognising the shape of an identifier is not confirming it exists. Constructing an identifier from a pattern is inventing it; enumerate the environment instead. |
| "This was valid last month"                             | Catalogues change. Re-verify against the current environment before every dispatch, not from memory.                                                              |
| "The table lists it, so it exists"                      | The tier table is a worked example, not an availability guarantee. Confirm the value against the enumerated list.                                                 |
| "I will use the session model to be safe"               | That is pre-escalation. Start at the cheapest tier, except for the unsure-task exception in `### Escalation Triggers`.                                            |

## Waves and Foreground

The tasks of one wave in `subagent-driven-development` are independent work, so dispatch every implementer of a wave together in the background. Dispatch each reviewer in the background as its implementer returns. The implementer of a wave of one, including the fast-path implementer, also runs in the background. The fast-path reviewer is the one exception and runs in the foreground, because the fast path waits for it before its gate. Wait for completion notifications before synthesis or dependent work and do not poll.

## Answering Subagent Questions

When a subagent asks a question before or during its task, you **MUST** answer it clearly and completely before allowing the subagent to proceed. You **MUST NOT** rush a subagent into implementation, and you **MUST NOT** ignore a question in the hope the subagent will work it out alone.

## Process Discipline

When orchestrating subagents, you **MUST NOT**:

- Skip reviews, whether combined or separate
- Close a task or start the next wave while a review has unfixed issues
- Accept "close enough" on spec compliance. If the reviewer found issues, the task is not done.
- Let the implementer's self-review replace the external review. Both are required.
- Force the same model to retry a failed task without changing anything (more context, different model, smaller scope, or escalation to the human)
- Attempt to fix a subagent's output manually in the orchestrator context. Re-dispatch with a better context instead. Manual fixes pollute the orchestrator's context and defeat the isolation.

## Escalation

If a subagent reports BLOCKED or fails repeatedly, you **MUST** do one of the following and nothing else:

- Provide more context and re-dispatch
- Re-dispatch with a more capable model
- Split the task into smaller pieces
- Stop and escalate to the human per `../../rules/common/workflow.md`

You **MUST NOT** ignore an escalation. You **MUST NOT** pretend a failed task succeeded.
