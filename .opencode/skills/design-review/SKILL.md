---
name: design-review
description: "Reviews a consolidated design summary for completeness, consistency, clarity, scope, and YAGNI issues by dispatching a reviewer subagent against the summary text and iterating until the design is approved or escalated."
---

# Design Review

Runs a holistic review, passes over a consolidated design summary, catches issues that incremental approval missed, and either returns an approved design or escalates after the iteration budget is exhausted.

For the rule that no implementation may begin until a design has been approved, see `../../rules/common/workflow.md`. For the context-isolation rule on dispatching the reviewer subagent, see `../../rules/common/subagents.md`. For type selection and model selection, see `../_shared/subagent-dispatch.md`.

## Preconditions

This skill **MUST NOT** be invoked until the caller has produced a consolidated design summary as a single block of text covering goal, architecture, components, interfaces, data flow, error handling, and testing strategy. Reviewing a design that lives only in conversation history is forbidden because the reviewer must receive the design text directly and **MUST NOT** inherit session context.

## Procedure

1. **Confirm the summary is consolidated.** If the caller has not produced a single design summary block, stop and tell the caller to consolidate before invoking this skill.
2. **Dispatch the reviewer.** Use `architect-reviewer` on `openai/hard` and the native OpenCode V2 subagent interface with `agent`, `description`, and `prompt`; omit `sessionID` for a new child and use `background: false` or omit it because review is a dependent step. Paste the full consolidated design summary into the prompt and do not pass session history. Paste the original user request verbatim above the design summary, split into numbered requirements (`S1`, `S2`, ...). If the summary already starts with the numbered request, paste that block once. The reviewer is read-only: it does not run shell commands, invoke review workflows, launch nested reviewers, or ask the human. If the role or alias is unavailable, report `BLOCKED`.
3. **Read the reviewer's status.**
   - **Approved**: return the design summary unchanged to the caller. Done.
   - **Issues Found**: extract each issue, decide whether the fix is a wording change, a missing section, or a substantive design change.
4. **Revise the summary.** The parent may make mechanical wording or formatting changes only. For a substantive design revision, choose who drafts it. Delegate to `stack-planner` unless your instructions say that you author design content yourself. In that case, you author the design content directly. When you delegate, send the reviewer findings, full summary, and approved context to `stack-planner` on `openai/hard` to draft the change. The planner returns proposed revisions and questions to the parent and does not decide user or committee questions. When you author design content yourself, draft the revision directly. In both cases, relay decisions to the user and, where relevant, the committee, then scope-check the revision against approved context. Flag every substantive change to the user before continuing; do not add an unapproved requirement.
5. **Re-dispatch.** Run the reviewer again against the updated summary.
6. **Iteration budget.** Maximum three reviewer dispatches. If the third dispatch still returns issues, **STOP** and surface the remaining issues plus the current summary to the caller. The caller decides whether to escalate to the human partner.
7. **Return the approved summary.** When a dispatch returns Approved, return the (possibly updated) design summary text to the caller along with a one-line note recording how many iterations the review took and whether any substantive changes were made.

## What the Reviewer Checks

| Category     | What to look for                                                               |
|--------------|--------------------------------------------------------------------------------|
| Completeness | Gaps, undefined behaviour, missing components, unanswered questions            |
| Consistency  | Contradictions between sections, conflicting requirements                      |
| Clarity      | Requirements ambiguous enough that someone could build the wrong thing         |
| Scope        | Focused enough for a single plan, not covering multiple independent subsystems |
| YAGNI        | Unrequested features, over-engineering, unnecessary complexity                 |
| Traceability | Every design element cites an S# or is marked derived with its reason; every S# is covered |

## Calibration

The reviewer **MUST** only flag issues that would cause real problems during implementation planning. A missing component, a contradiction, or a requirement so ambiguous it could be interpreted two different ways are issues. Minor wording improvements, stylistic preferences, and "sections less detailed than others" are not.

The full prompt with calibration language and output format lives in `design-reviewer-prompt.md`.

## Worked Example

The caller (a brainstorming skill, delegating root) consolidates a design summary for a new ingest pipeline and invokes this skill.

- **Iteration 1** (delegating root): the reviewer flags that error handling for malformed upstream records is unspecified and that an `IngestWorker` interface is unclear. The parent sends the findings, summary, and approved context to `stack-planner` on `openai/hard`. The planner returns a proposed revision and identifies the decision that needs approval; it does not invent a dead-letter queue or another unapproved behaviour. The parent relays the decision to the user and, where relevant, the committee. After approval, the planner updates the summary; the parent flags the substantive change and checks it against the agreed scope.
- **Iteration 2**: the parent re-dispatches the updated summary for review. The reviewer returns Approved with one advisory recommendation about consistent terminology; the approved summary and substantive-change note go back to the caller.

## Completion Gate

You **MUST NOT** return Approved to the caller unless the most recent reviewer dispatch in this invocation returned Approved. A previous Approved from earlier in the session, or your own belief that the issues are minor, does not count.

## Common Mistakes

| Mistake                                                  | Why it is wrong                                                                                                                   |
|----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| Passing session history to the reviewer                  | Violates context isolation. The reviewer must read only the design summary, otherwise it grades the conversation, not the design. |
| Skipping the dispatch and reviewing the summary yourself | The orchestrator's perspective is not a fresh review. The whole point is the second pair of eyes.                                 |
| Continuing past three iterations                         | The budget exists to prevent endless polish loops. Past three, the caller and the human need to decide whether to redesign.       |
| Treating advisory recommendations as blockers            | Recommendations are advisory. Only Issues block.                                                                                  |
| Returning Approved without re-dispatching after fixes    | The Approved status must come from a reviewer run against the updated summary, not the original.                                  |
