---
name: brainstorming-committee
description: "Turns an idea into an approved design through autonomous deliberation by three subagents with different perspectives, who debate decisions and converge on consensus without user involvement until the final design is ready for review. Then runs design-review and hands off to create-tickets or subagent-driven-development."
---

# Brainstorming (Committee)

Hands-off design dialogue. The user provides the initial brief, then three subagents with deliberately different perspectives deliberate on each design decision and converge on consensus. The parent owns all user dialogue and approval; the user only sees the final design.

For the rule that no implementation may begin until the user has approved a design, see `../../rules/common/workflow.md`. The iron-law rules on subagent dispatch (context isolation, git ban, worktree ban, privilege ban) live in `../../rules/common/subagents.md`. The procedural dispatch rules (subagent type selection, model selection, escalation) live in `../_shared/subagent-dispatch.md`. The design review step is delegated to the `design-review` skill.

## Load Required Files First

This skill depends on two sibling/shared files that are **not** always in context:

- `committee-member-prompt.md` (sibling) - prompt templates paste-filled in step 4
- `../_shared/subagent-dispatch.md` - procedural rules for dispatching the committee members

Before running the procedure below, you **MUST** read both files using the read tool if you have not already read them in this session.

## Preconditions

- You **MUST** be in plan mode before invoking this skill. Use `entering plan mode (in OpenCode, plan mode is toggled by the user pressing Tab; ask the user to enter plan mode before reviewing the design)` if you are not.
- This skill is invoked either directly or by the `brainstorming` router after the user selects committee mode.
- Use this skill only when there are at least two meaningful design decisions to make. For trivial requests (a single config change, a one-line fix), `brainstorming-standard` is the right tool.

## Procedure

1. **Confirm the brief.** This is the only point where you ask the user a question during deliberation. Restate what you understand they want to build, the scope as you see it, and any assumptions, then confirm via `question`. Once confirmed, the user is hands-off until step 7.
2. **Explore project context.** Read the area of the codebase relevant to the brief. Stay narrow: every file you read here gets passed to every committee member in every round, so unnecessary context dilutes focus and wastes capacity. Identify the project's primary language and framework now because the Pragmatist brief must name the stack (see Pragmatist Brief below). If the feature touches more than ~3 subsystems, or you cannot determine which code is relevant, surface what you have found and ask the user for guidance via `question`. This is the only other point where you may ask the user a question.
3. **Develop the agenda.** Delegate to `stack-planner` unless your instructions say that you author design content yourself. In that case, you author the design content directly. When you delegate, send the complete brief, scoped codebase evidence, constraints, and assumptions to `stack-planner` on `openai/hard` through the native subagent interface. Ask for substantive agenda development: the key design decisions, evidence, and coherent round groupings. When you delegate, the planner returns questions and a proposed agenda to the parent, and the parent does not author the substantive decision framing. When you author design content yourself, you develop the agenda directly. In both cases, scope-check the agenda against the brief, control the round sequence, and relay unresolved questions. Do not answer questions on the user's behalf.
4. **Run committee deliberation rounds.** For each parent-approved agenda group, dispatch three committee members in parallel in one message through the native subagent interface, using the templates in `committee-member-prompt.md`. Use each configured role and `openai/hard`; include identical full context: the brief, relevant codebase context, the specific decisions, and any decisions already made. Set `background: true` for these independent calls and wait for completion notifications before synthesis, tiebreaking, review, or approval; do not poll. Each returns a recommendation, reasoning, and concerns to the parent. Committee members must not ask the human, invoke workflows, or dispatch nested agents.
5. **Administer the vote and consensus process.** The parent administers the process: after each round, it applies the outcomes in the table below, records consensus and substantive dissent, and carries flagged concerns forward before moving to the next round.
6. **Author the final design summary.** Delegate to `stack-planner` unless your instructions say that you author design content yourself. In that case, you author the design content directly. When you delegate, send the complete brief, scoped evidence, every recorded committee consensus, dissent, and flagged concern to `stack-planner` on `openai/hard` through the native subagent interface. The planner authors the single design summary from that record. If you author design content yourself, you write that summary directly from the same record. The parent scope-checks the summary against the brief and recorded votes and does not add, remove, or change substantive decisions. Surface unresolved questions rather than deciding them silently.
7. **Present the design to the user.** The parent presents the design summary, a brief note on decisions where the committee was split and the consensus reasoning, and any flagged risks. **MUST NOT** dump the deliberation transcripts. The parent obtains any required user decision and explicit approval; members and planner do not ask the human.
8. **Invoke `design-review`** via `skill` against the consolidated summary. If the review surfaces issues that require new decisions (not just wording fixes), feed the affected decisions back into a targeted committee round, update the summary, and re-invoke `design-review`. If `design-review` escalates after three iterations, stop and ask the user how to proceed.
9. **Get explicit final approval.** Present the reviewed summary and ask directly. "Looks fine" is not approval.
10. **Decide the next step.** Before you ask, save the approved design once with `write` to `/Users/jose.romero/.opencode/plan/<ticket>-<short-topic>.md`. Use the ticket key, or `no-ticket` if there is none. Use a new short topic for each design, so that an earlier plan is never overwritten. Do not write or edit that file before final approval, and do not edit it afterwards. The auto-compact plugin then compacts the session, and the compaction summary carries the plan path. Use `question` to ask whether to create tickets or start implementation. The only permitted downstream skills are `create-tickets` and `subagent-driven-development`; invoke whichever the user picks via `skill`. If the user picks implementation, invoke `subagent-driven-development` now, even if Plan mode is still active. The mode-switch plugin moves the session to Build before the skill loads. Do not ask the user to switch agents unless the plugin reports that the switch failed.

## The Three Perspectives

Each committee member uses a specialised subagent type that reinforces its perspective. The full prompt templates live in `committee-member-prompt.md`.

| Role        | What it prioritises                                                                  | Subagent type           |
|-------------|--------------------------------------------------------------------------------------|-------------------------|
| Pragmatist  | Simplicity, maintenance cost, shipping quickly, reusing what already exists          | `stack-planner` on `openai/hard` |
| Architect   | Patterns, separation of concerns, well-defined interfaces, testability               | `architect-reviewer` on `openai/hard` |
| Advocate    | Correctness, edge cases, robustness under failure, hard-to-misuse interfaces         | `qa-expert` on `openai/hard` |

Each required role is configured on `openai/hard`. Check the current agent catalogue and alias availability per `../_shared/subagent-dispatch.md`; if a role or alias is unavailable, report `BLOCKED` rather than silently substituting another agent.

### Pragmatist Brief

The Pragmatist brief **MUST** name the project's primary language or framework (identified during step 2), so `stack-planner` can apply its conventions while assessing simplicity and maintenance cost.

## Synthesising Consensus

| Outcome             | Action                                                                            |
|---------------------|-----------------------------------------------------------------------------------|
| All three agree     | Take that approach.                                                               |
| Two of three agree  | Take the majority view; record the dissenting concern if it is substantive.       |
| All three disagree  | Run a tiebreaking round (see below).                                              |

Concerns flagged by two or more members **MUST** be addressed in the design, even if the specific recommendation differs.

## Tiebreaking

If a round produces irreconcilable disagreement (not just preference differences), dispatch a single tiebreaking round. All three positions are passed to a single `architect-reviewer` subagent on `openai/hard` that must converge to a final decision. The tiebreaking template is in `committee-member-prompt.md`. **MUST NOT** run more than one tiebreaking round per decision; if the tiebreaker still cannot converge, surface the unresolved decision to the user.

## Working in Existing Codebases

- Follow existing patterns. Where existing code has problems that affect the work, include targeted improvements in the design.
- **MUST NOT** propose unrelated refactoring. Committee members are explicitly instructed in their prompts to stay within scope; the synthesiser must reject any recommendation that exceeds it.

## Completion Gate

You **MUST NOT** invoke `create-tickets` or `subagent-driven-development` until all of these are true:

- Every identified decision group has a recorded consensus
- The design summary was assembled from those consensuses into a single text block
- `design-review` returned Approved
- The user gave explicit final approval against the reviewed summary

## Common Mistakes

| Mistake                                                                | Why it is wrong                                                                                                                |
|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Asking the user clarifying questions during deliberation               | The committee replaces user questioning. The only allowed user questions are step 1 and the optional step 2 escape hatch.      |
| Dispatching committee members sequentially                             | They **MUST** run concurrently. One message, three tool calls.                                                                 |
| Passing session history to committee members                           | Violates context isolation from `../../rules/common/subagents.md`. Pass the brief, the codebase context, the decisions, and prior consensus only. |
| Substituting an unavailable committee role without authorisation | Violates the required-role and alias policy in `../_shared/subagent-dispatch.md`.                                                                            |
| Showing the user the full deliberation transcripts                     | The user wants the design, not the process. Surface only the result, splits, and flagged risks.                                |
| Skipping `design-review` because the committee already reviewed itself | The committee deliberates, it does not review. `design-review` is a separate, holistic check.                                  |
| Running more than one tiebreaking round                                | If one tiebreaker cannot converge, the decision is genuinely unresolved and belongs to the user.                               |
| Letting the synthesiser quietly drop a concern flagged by two members  | Two members flagging a concern is signal. Address it in the design or the round did not really converge.                       |
