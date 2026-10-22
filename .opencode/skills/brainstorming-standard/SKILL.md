---
name: brainstorming-standard
description: "Turns an idea into an approved design through interactive dialogue with a user who already knows the codebase. Explores context, asks one question at a time, proposes alternatives, presents the design in sections, runs design-review, and hands off to create-tickets or subagent-driven-development."
---

# Brainstorming (Standard)

Interactive design dialogue for a user who already knows the codebase. The conversation is the design medium; nothing is written to disk during brainstorming.

For the rule that no implementation may begin until the user has approved a design, see `../../rules/common/workflow.md`. For the rule that this skill must be invoked before creative work, see `../../rules/common/skills-policy.md`. The design review step is delegated to the `design-review` skill.

## Preconditions

- You **MUST** be in plan mode before invoking this skill. If you are not, enter plan mode now using `entering plan mode (in OpenCode, plan mode is toggled by the user pressing Tab; ask the user to enter plan mode before reviewing the design)`. Plan mode's read-only safety enforces the design-before-implementation rule from `../../rules/common/workflow.md`.
- This skill is invoked either directly by the orchestrator or by the `brainstorming` router after the user selects standard mode. If the user has not chosen a mode yet, invoke `brainstorming` instead so they can pick.

## Procedure

1. **Explore project context.** Read files and docs in the area the request touches. Stay focused: do not exhaustively map the codebase. If after the initial pass the request appears to span more than ~3 subsystems, stop and tell the user; help them decompose into subprojects before continuing.
2. **Develop the design.** Delegate to `stack-planner` unless your instructions say that you author design content yourself. In that case, you author the design content directly and keep the same one-question-per-message discipline with the user. Develop 2-3 viable alternatives with trade-offs and identify unanswered decisions. Produce one design question per turn and say when no question remains. When you delegate, give `stack-planner` on `openai/hard` the full user brief, relevant codebase context, constraints, and available evidence. Ask it for those outputs. It returns recommendations and questions to the parent and does not ask the human, invoke skills, seek approval, or run implementation or review workflows. Use the native subagent interface and include the complete context in the prompt. Keep the `sessionID` that the call returns, and use it to continue the same planner in steps 3 to 5.
3. **Ask clarifying questions.** You own all user dialogue and approval. Ask one question per message, preferably as multiple choice, focused on purpose, constraints, and success criteria. When you delegate, `stack-planner` authors every design question. Relay each planner question to the user verbatim. When you delegate, you **MUST NOT** write, reword, or add a design question yourself. Return each answer to the same planner by continuing it with its `sessionID`, and relay the next question it returns. Move to step 4 only when no question remains, which the planner reports when you delegate. **MUST NOT** stack multiple questions in one turn.
4. **Present approaches and approve sections.** Ask the approach choice first, as a separate, earlier question. Present 2-3 alternatives with trade-offs and a recommendation, because the choice decides what the sections describe. After the user picks an approach, present every section (architecture, components, data flow, error handling, and testing) in one message. Then ask one `question` with `multiSelect: true` and one option per section. A selected section is approved. The question text tells the user to write what to change in the custom answer. Rework each unselected section using that custom answer. If the user left no custom answer, ask one plain follow-up for the changes. Then ask again only about the reworked sections. When you delegate, `stack-planner` drafts the 2-3 alternatives with explicit trade-offs and its recommendation. `stack-planner` drafts all sections in one call. Then present each one verbatim, and return the user's feedback to the same planner with its `sessionID`. When you delegate, relay its revised sections and do not draft, reword, or decide design content yourself. Do not delegate user-facing presentation or approval. Otherwise you draft the alternatives and all sections yourself.
5. **Consolidate the design summary.** After the sections are approved, a single structured summary must cover goal, architecture, components, interfaces, data flow, error handling, and testing strategy. When you delegate, continue the same `stack-planner` with its `sessionID` and have it author that summary. When you author design content yourself, write that summary directly. The summary works from the full brief, context, answers, and approved sections. The parent checks that the summary is faithful and does not add unapproved requirements.
6. **Invoke `design-review`.** The parent invokes the `design-review` skill against the consolidated summary. If `design-review` returns substantive change notes, surface them to the user before continuing. If `design-review` escalates after three iterations, stop and ask the user how to proceed.
7. **Get explicit final approval.** Present the reviewed summary to the user and obtain explicit approval. Implicit signals ("looks fine", "sure") do not count; ask directly.
8. **Decide the next step.** Before you ask, save the approved design once with `write` to `/Users/jose.romero/.opencode/plan/<ticket>-<short-topic>.md`. Use the ticket key, or `no-ticket` if there is none. Use a new short topic for each design, so that an earlier plan is never overwritten. Do not write or edit that file before final approval, and do not edit it afterwards. The auto-compact plugin then compacts the session, and the compaction summary carries the plan path. If the design input has `Source: work-on-ticket`, invoke `subagent-driven-development` without asking. If the user asks for more tickets at final approval in a ticket run, invoke `create-tickets` instead. If the design input does not have `Source: work-on-ticket`, use `question` to ask whether to create tickets or start implementation. The only permitted downstream skills are `create-tickets` and `subagent-driven-development`; invoke whichever applies via `skill`. If the handoff is implementation, invoke `subagent-driven-development` now, even if Plan mode is still active. The mode-switch plugin moves the session to Build before the skill loads. Do not ask the user to switch agents unless the plugin reports that the switch failed.

## Working in Existing Codebases

- Follow existing patterns. Where existing code has problems that affect the work, include targeted improvements in the design.
- **MUST NOT** propose unrelated refactoring. Per the YAGNI rule in `../../rules/common/coding-style.md`, "while we are here" cleanups are forbidden during a brainstorming pass.

## Worked Example

Delegating root. User: "I want to add structured logging across the API service."

1. **Explore.** The parent reads `src/api/`, locates the existing logger setup, and checks for a structured logging library. The evidence shows `log/slog`-equivalent use in three handlers, ad-hoc `print` calls elsewhere, and a previous reverted attempt.
2. **Planner draft.** The parent sends the brief and relevant evidence to `stack-planner` on `openai/hard`, which returns the alternatives and identifies questions for the parent.
3. **Clarify.** The parent relays the planner's questions verbatim, one per message: whether to migrate every log call or only new code, then which consumer has priority. The user chooses all calls and an aggregator, and the parent returns each answer to the same planner.
4. **Alternatives.** The planner recommends standardising on `slog` and migrating everything in one pass, against introducing a thin facade or changing only new code. The parent presents the planner's trade-offs verbatim and asks the approach choice as its own question. The user picks the recommendation.
5. **Sections.** The planner drafts all five sections in one call. The parent presents them verbatim in one message and asks one `multiSelect` question. The user selects all sections except data flow and writes a change in the custom answer. The parent returns that change to the same planner, then asks again about data flow only.
6. **Consolidate.** The planner writes the single structured summary from the approved sections; the parent checks it is faithful.
7. **Design review.** The parent invokes `design-review`; after the reviewer flags that JSON assertions are unspecified, the parent brings the issue back for an approved summary change and runs the review again.
8. **Final approval.** The parent presents the reviewed summary and obtains explicit user approval.
9. **Next step (no `Source: work-on-ticket`).** The parent asks whether to create tickets or implement; the user chooses tickets.

## Completion Gate

You **MUST NOT** invoke `create-tickets` or `subagent-driven-development` until all of these are true:

- The design summary was consolidated into a single text block
- `design-review` returned Approved
- The user gave explicit final approval against the reviewed summary

If any one of these is false, the gate has not been crossed, and you **MUST NOT** hand off.

## Common Mistakes

| Mistake                                                                             | Why it is wrong                                                                                                              |
|-------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| Stacking multiple questions in one message                                          | Drowns the user. One question per message, prefer multiple choice.                                                           |
| Skipping the consolidation step and dispatching review against the conversation     | `design-review` requires a single summary block. Conversation history is not a design.                                       |
| Treating "looks fine" as final approval                                             | Explicit approval is required. Ask directly.                                                                                 |
| Inventing requirements the user did not state                                       | YAGNI. The design covers what was asked for, not what you would also build.                                                  |
| Invoking an implementation skill before the gate is crossed                         | Violates the `../../rules/common/workflow.md` design-before-implementation rule.                                             |
| Proposing unrelated refactors discovered during exploration                         | Log them as separate items for the user. Do not bundle them into the design.                                                 |
| Rewording a planner question or drafting a design section yourself while delegating | Delegated design judgement belongs to `stack-planner` on `openai/hard`. Author it yourself only if your instructions say so. |
