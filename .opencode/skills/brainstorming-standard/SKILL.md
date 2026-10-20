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
2. **Delegate substantive design work.** Give `stack-planner` on `openai/hard` the full user brief, relevant codebase context, constraints, and available evidence. Ask it to develop 2-3 viable alternatives with trade-offs and to identify unanswered decisions. Ask it to return one design question per turn and to say when no question remains. It returns recommendations and questions to the parent; it does not ask the human, invoke skills, seek approval, or run implementation or review workflows. Use the native subagent interface and include the complete context in the prompt. Keep the `sessionID` that the call returns, and use it to continue the same planner in steps 3 to 5.
3. **Ask clarifying questions.** The parent owns all user dialogue and approval, but `stack-planner` authors every design question. Relay each planner question to the user verbatim, one question per message, preferably as multiple choice. **MUST NOT** write, reword, or add a design question yourself. Return each answer to the same planner by continuing it with its `sessionID`, and relay the next question it returns. The planner's questions focus on purpose, constraints, and success criteria. Move to step 4 only when the planner reports that no question remains. **MUST NOT** stack multiple questions in one turn.
4. **Present approaches and approve sections.** `stack-planner` drafts the 2-3 alternatives with explicit trade-offs, its recommendation, and each design section: architecture, components, data flow, error handling, and testing. Present each one verbatim and get user approval on each section before moving to the next. Return the user's feedback to the same planner with its `sessionID`, and relay its revised or next section. Do not draft, reword, or decide design content yourself. Do not delegate user-facing presentation or approval.
5. **Consolidate the design summary.** After the sections are approved, continue the same `stack-planner` with its `sessionID`. Have it author a single structured summary covering goal, architecture, components, interfaces, data flow, error handling, and testing strategy. It works from the full brief, context, answers, and approved sections. The parent checks that the summary is faithful and does not add unapproved requirements.
6. **Invoke `design-review`.** The parent invokes the `design-review` skill against the consolidated summary. If `design-review` returns substantive change notes, surface them to the user before continuing. If `design-review` escalates after three iterations, stop and ask the user how to proceed.
7. **Get explicit final approval.** Present the reviewed summary to the user and obtain explicit approval. Implicit signals ("looks fine", "sure") do not count; ask directly.
8. **Decide the next step.** Before you ask, save the approved design once with `write` to `/Users/jose.romero/.opencode/plan/<ticket>-<short-topic>.md`. Use the ticket key, or `no-ticket` if there is none. Use a new short topic for each design, so that an earlier plan is never overwritten. Do not write or edit that file before final approval, and do not edit it afterwards. The auto-compact plugin then compacts the session, and the compaction summary carries the plan path. Use `question` to ask whether to create tickets or start implementation. The only permitted downstream skills are `create-tickets` and `subagent-driven-development`; invoke whichever the user picks via `skill`. If the user picks implementation, invoke `subagent-driven-development` now, even if Plan mode is still active. The mode-switch plugin moves the session to Build before the skill loads. Do not ask the user to switch agents unless the plugin reports that the switch failed.

## Working in Existing Codebases

- Follow existing patterns. Where existing code has problems that affect the work, include targeted improvements in the design.
- **MUST NOT** propose unrelated refactoring. Per the YAGNI rule in `../../rules/common/coding-style.md`, "while we are here" cleanups are forbidden during a brainstorming pass.

## Worked Example

User: "I want to add structured logging across the API service."

1. **Explore.** The parent reads `src/api/`, locates the existing logger setup, and checks for a structured logging library. The evidence shows `log/slog`-equivalent use in three handlers, ad-hoc `print` calls elsewhere, and a previous reverted attempt.
2. **Planner draft.** The parent sends the brief and relevant evidence to `stack-planner` on `openai/hard`, which returns the alternatives and identifies questions for the parent.
3. **Clarify.** The parent relays the planner's questions verbatim, one per message: whether to migrate every log call or only new code, then which consumer has priority. The user chooses all calls and an aggregator, and the parent returns each answer to the same planner.
4. **Alternatives.** The planner recommends standardising on `slog` and migrating everything in one pass, against introducing a thin facade or changing only new code. The parent presents the planner's trade-offs and sections verbatim and gets approval on each section.
5. **Consolidate.** The planner writes the single structured summary from the approved sections; the parent checks it is faithful.
6. **Design review.** The parent invokes `design-review`; after the reviewer flags that JSON assertions are unspecified, the parent brings the issue back for an approved summary change and runs the review again.
7. **Final approval.** The parent presents the reviewed summary and obtains explicit user approval.
8. **Next step.** The parent asks whether to create tickets or implement; the user chooses tickets.

## Completion Gate

You **MUST NOT** invoke `create-tickets` or `subagent-driven-development` until all of these are true:

- The design summary was consolidated into a single text block
- `design-review` returned Approved
- The user gave explicit final approval against the reviewed summary

If any one of these is false, the gate has not been crossed, and you **MUST NOT** hand off.

## Common Mistakes

| Mistake                                                                         | Why it is wrong                                                                                 |
|---------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Stacking multiple questions in one message                                      | Drowns the user. One question per message, prefer multiple choice.                              |
| Skipping the consolidation step and dispatching review against the conversation | `design-review` requires a single summary block. Conversation history is not a design.          |
| Treating "looks fine" as final approval                                         | Explicit approval is required. Ask directly.                                                    |
| Inventing requirements the user did not state                                   | YAGNI. The design covers what was asked for, not what you would also build.                     |
| Invoking an implementation skill before the gate is crossed                     | Violates the `../../rules/common/workflow.md` design-before-implementation rule.                |
| Proposing unrelated refactors discovered during exploration                     | Log them as separate items for the user. Do not bundle them into the design.                    |
| Rewording a planner question or drafting a design section yourself              | The parent runs on `openai/easy`. Design judgement belongs to `stack-planner` on `openai/hard`. |
