# Subagent Dispatch - Procedural Rules

These rules apply to every subagent dispatch made from inside a skill. They are the procedural detail behind the iron laws in `../../rules/common/subagents.md`. The iron laws (context isolation, the git ban, the worktree ban, the privilege ban) live in the always-on rule file and bind whether or not a skill is running. The rules below govern *how* a dispatch is constructed and managed once a skill has decided to dispatch.

Any skill that dispatches a subagent **MUST** read this file before its first dispatch. This includes `subagent-driven-development`, `dispatching-parallel-agents`, `fast-path-implementation`, `brainstorming-committee`, `debugging`, `requesting-code-review`, `design-review`, `test-driven-development` and `code-tour`.

## Automatic Role and Model Routing

The parent owns orchestration and selects a role from the current visible agent catalogue before every dispatch. Use the configured role and alias in this table; do not choose a model by vendor, price, or a retry ladder.

| Role | Alias | Use |
|------|-------|-----|
| `stack-specialist` | `openai/easy` | Bounded implementation of approved tasks, routine lookup, and simple evidence collection |
| `utility` | `openai/easy` | Routine text and skill tasks, or bounded lookup |
| `stack-planner` | `openai/hard` | Substantive planning, design alternatives and summary authorship, and task decomposition |
| `architect-reviewer` | `openai/hard` | Design and architecture review; the Architect committee perspective and tiebreaker |
| `qa-expert` | `openai/hard` | The Advocate committee perspective and quality analysis |
| `code-reviewer` | `openai/hard` | Every independent implementation or specification review |
| `complex-worker` | `openai/hard` | Known difficult root-cause, integration, or security analysis, or explicitly escalated approved work |

Use the `architect-reviewer` for design or architecture reviews and `code-reviewer` for implementation reviews. Known planning, review, or difficult work starts on its required hard role; do not spend a cheap attempt first. A COMPLEX workflow may still contain bounded implementation tasks for `stack-specialist` on `openai/easy`; workflow classification does not set every task's model.

Before dispatch, check that the required agent is present in the current visible agent catalogue. Verify alias availability with the native `opencode.models` tool or native model API when needed, especially after model configuration changes. Never invent a model ID or put upstream model IDs in workflow instructions. Use the configured role profile and required alias; do not omit the role or alias, rely on the caller's model inheritance, or silently substitute another agent or alias. The configured profile supplies the model; an optional model override is allowed only when the user explicitly requests it.

A generic fallback is permitted only when the user explicitly authorises that fallback and its required alias. If a required role or alias is unavailable and no such authorisation exists, report `BLOCKED`; do not choose a substitute. If required task context or approval is missing, report `NEEDS_CONTEXT` rather than guessing or retrying with a cheaper model.

## Native Dispatch and Task Annotation

Use the native OpenCode V2 subagent interface. New calls carry `agent`, `description`, and `prompt`; `background` is optional. The `sessionID` field is optional: omit it for every new child, and set it only to the ID returned by a prior call when continuing that same child in the same role. Never pass the parent session ID. The configured role profile supplies the model. Include the complete task brief, relevant context, approvals, constraints, and verification evidence in `prompt`. Only include an optional model when the user explicitly requested an override. Do not use legacy task APIs or invent alternative dispatch fields.

When decomposing work or preparing parallel dispatches, annotate each task in advance with its required agent role and alias, exact scope, and acceptance criteria. Select `stack-specialist` for bounded implementation by default, and `complex-worker` only when the task is genuinely difficult or explicitly escalated.

## Questions and Process Discipline

For dependent sequential work, use foreground calls (`background: false` or omit it) and wait for each result. Use `background: true` only for independent work; wait for completion notifications before synthesis or dependent work and do not poll. Children do not ask the human questions, seek approval, or launch nested agents or orchestration workflows. They return concise questions and evidence to the parent. The parent resolves missing context and asks the human one decision question at a time when approval is needed. A child must not make an approval decision on the parent's behalf.

If a worker discovers the task is more difficult than expected, it stops and reports the evidence to the parent. The parent may provide missing context, narrow the scope, or dispatch the approved difficult work to `complex-worker` on `openai/hard`. Do not blindly retry the same task. The one exception is a rate-limit error, handled under "Rate-Limit Retries". A missing-context report is `NEEDS_CONTEXT`, not a model-escalation retry.

When orchestrating subagents, you **MUST NOT**:

- Skip reviews, whether combined or separate; every independent review uses its designated hard reviewer
- Proceed to the next task while a review has unfixed issues
- Accept "close enough" on spec compliance. If the reviewer found issues, the task is not done.
- Let the implementer's self-review replace the external review. Both are required.
- Force a worker to retry without changing the context, approved scope, or plan, except after a rate-limit error as described under "Rate-Limit Retries"
- Attempt to fix a subagent's output manually in the orchestrator context. Re-dispatch with a better context instead. Manual fixes pollute the orchestrator's context and defeat isolation.

## Answering Subagent Questions

If a child returns a question, pause its work. Resolve it from the provided context or relay the decision question to the human yourself, then provide the answer before continuing. Do not guess, rush implementation, or let a child ask the human directly.

## Rate-Limit Retries

If a subagent call fails with a `provider.rate-limit` error, the provider is throttling tokens and the task itself is not at fault. The parent retries up to 3 times. Before each retry, the parent waits 60 seconds, for example with `sleep 60` in the shell. Each retry sends the same call again, with the same role, alias and prompt.

If the child already has a `sessionID`, the retry resumes that session with the same `sessionID`. If that session no longer exists, the parent sends a new call with the full context.

These retries are not a model escalation. If the third retry also fails, the parent stops with `BLOCKED` and tells the user, quoting the error.

## Escalation

If a child reports `BLOCKED`, `NEEDS_CONTEXT`, or an unexpected difficulty, do not ignore or conceal it. Provide missing context, narrow the approved task, use the already-approved hard role when the work genuinely requires it, or stop and escalate to the human per `../../rules/common/workflow.md`. Never pretend a failed task succeeded.
