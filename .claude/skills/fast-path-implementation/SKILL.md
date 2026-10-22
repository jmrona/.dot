---
name: fast-path-implementation
description: Implements a batch of uniformly simple changes via a single implementer dispatch and a single combined review. Only invoked when complexity-triage has classified the work as SIMPLE.
---

# Fast Path Implementation

When `complexity-triage` has classified the work as SIMPLE with full evidence, implementation collapses to two subagent dispatches plus a user checkpoint. This skill covers that shortened process. The iron-law rules on subagent dispatch (context isolation, git ownership, worktree ban, privilege ban) live in `../../rules/common/subagents.md`. The procedural rules (subagent type selection, model selection, escalation) live in `../_shared/subagent-dispatch.md` and apply throughout.

Before running the procedure below, you **MUST** read `../_shared/subagent-dispatch.md` using the Read tool if you have not already read it in this session.

## Precondition

You **MUST NOT** enter this skill without a SIMPLE classification from `complexity-triage` that has been presented to the user. If you have not run triage, run it first. If triage returned COMPLEX, use `subagent-driven-development` instead.

If `git rev-parse --is-inside-work-tree` fails, the working directory is not a git repository. In that case you **MUST** follow `../_shared/no-git-flow.md` in place of every git step in this skill.

The caller of this skill is responsible for having asked the commit preference question before arriving here.

## Process

### 1. Single Implementation Dispatch

Dispatch one implementer with every change as a single batch. Use `../subagent-driven-development/implementer-prompt.md` with the task description covering the full scope of changes. Select the specialised subagent type and pick one concrete model at the Low-cost default tier, resolved per `../_shared/subagent-dispatch.md`. If the work is simple enough for this path, it is simple enough for the cheapest model. The orchestrator declares the exact file paths of the batch as the implementer's `writes`. The orchestrator records the wave base before the dispatch, as `## Per-Wave Pipeline` in `../subagent-driven-development/SKILL.md` describes.

### 2. Single Combined Review

Dispatch one reviewer that checks spec compliance and code quality in a single pass, using `./fast-path-reviewer-prompt.md`. This is not a weaker review than the full path. It covers the same ground; the combination is possible because the small scope makes separation unnecessary overhead. Pick one concrete model at the Low-cost default tier, resolved per `../_shared/subagent-dispatch.md`.

The reviewer returns one of three outcomes:

- **PASS**: proceed to the user checkpoint
- **FAIL**: continue the same implementer through `SendMessage` with the review issues as fix instructions, then re-review. Repeat until PASS.
- **TRIAGE_INVALID**: the reviewer judges the work is more complex than the triage concluded. Stop the fast path, reclassify as COMPLEX, and hand back to `subagent-driven-development` for re-decomposition.

### 3. Wave Gate

After the reviewer approves and **before** the user checkpoint, run the wave gate against the implementer's work yourself. Fast-path work is a wave of one task, and `../../rules/common/verification.md` requires the gate. Even on the fast path, "the reviewer said it was fine" is not a substitute for running the wave gate yourself.

Run the wave gate from the `## Wave Gate` section of `../subagent-driven-development/SKILL.md` on this wave of one. If any check fails, continue the same implementer through `SendMessage` with the failure as fix instructions, then run the wave gate again.

A wave of one treats `BLOCKED_BY_SIBLING` as `BLOCKED`.

The implementer report must include RED to GREEN evidence for each new behaviour, per `../subagent-driven-development/implementer-prompt.md`. Pure string replacements add no new behaviour.

The verification evidence (commands, exit codes, pass/fail counts) is shown to the user as part of the user checkpoint.

### 4. User Checkpoint

Present the changes to the user:

1. Summarise what was implemented and what the reviewer found
2. Cite the verification evidence: commands run, exit codes, pass/fail counts
3. Show a `git diff` of the uncommitted changes
4. Follow the `## User Checkpoint` section of `../subagent-driven-development/SKILL.md` unchanged for the commit question and the path-limited commit rules. This wave of one uses the same options: "Commit all tasks", "Adjust first" and "Skip commit".

## Process Flow

```dot
digraph fast_path {
    rankdir=TB;

    "Triage: SIMPLE" [shape=box, style=bold];
    "Dispatch implementer\n(all changes as single batch,\nLow-cost default tier)" [shape=box];
    "Implementer asks questions?" [shape=diamond];
    "Answer questions, provide context" [shape=box];
    "Implementer implements, tests, self-reviews" [shape=box];
    "Dispatch combined reviewer\n(./fast-path-reviewer-prompt.md,\nLow-cost default tier)" [shape=box];
    "Reviewer result?" [shape=diamond];
    "Implementer fixes issues" [shape=box];
    "Hand back to subagent-driven-development\n(re-decompose)" [shape=box];
    "Wave gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" [shape=box, style=bold];
    "Wave gate passes?" [shape=diamond];
    "User checkpoint:\npresent changes + verification evidence,\ncommit or ask" [shape=box, style=bold];

    "Triage: SIMPLE" -> "Dispatch implementer\n(all changes as single batch,\nLow-cost default tier)";
    "Dispatch implementer\n(all changes as single batch,\nLow-cost default tier)" -> "Implementer asks questions?";
    "Implementer asks questions?" -> "Answer questions, provide context" [label="yes"];
    "Answer questions, provide context" -> "Dispatch implementer\n(all changes as single batch,\nLow-cost default tier)";
    "Implementer asks questions?" -> "Implementer implements, tests, self-reviews" [label="no"];
    "Implementer implements, tests, self-reviews" -> "Dispatch combined reviewer\n(./fast-path-reviewer-prompt.md,\nLow-cost default tier)";
    "Dispatch combined reviewer\n(./fast-path-reviewer-prompt.md,\nLow-cost default tier)" -> "Reviewer result?";
    "Reviewer result?" -> "Wave gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" [label="PASS"];
    "Reviewer result?" -> "Implementer fixes issues" [label="FAIL"];
    "Reviewer result?" -> "Hand back to subagent-driven-development\n(re-decompose)" [label="TRIAGE_INVALID"];
    "Implementer fixes issues" -> "Dispatch combined reviewer\n(./fast-path-reviewer-prompt.md,\nLow-cost default tier)" [label="re-review"];
    "Wave gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" -> "Wave gate passes?";
    "Wave gate passes?" -> "Implementer fixes issues" [label="no"];
    "Wave gate passes?" -> "User checkpoint:\npresent changes + verification evidence,\ncommit or ask" [label="yes"];
}
```

## Worked Example

```
You: I'm implementing the design for updating copyright headers across the codebase.

[Orchestrator has already asked commit preference]
User chose: Auto-commit after each wave

[Run complexity-triage, classification returns SIMPLE with evidence table]

[Dispatch single implementer (Low-cost default tier) with all 8 files as one batch]

Implementer:
  - Updated copyright year in all 8 files
  - Self-review: all changes are consistent string replacements

[Dispatch combined reviewer (Low-cost default tier)]

Combined reviewer: [PASS] All 8 files correctly updated. Changes match spec exactly,
no extra modifications, consistent with surrounding code style.

[Wave gate: orchestrator runs git diff + standard verification itself]
$ git diff --stat
 8 files changed, 8 insertions(+), 8 deletions(-)
$ npm test
PASS (78 tests, 78 passed)
$ npm run lint
exit 0

[Wave gate PASSES]

[Present diff + verification evidence to user]
Here are the changes: 8 files with updated copyright headers.
Verification: 78/78 tests passing, lint exit 0.

[Auto-commit: user chose auto-commit at start, so the single task is committed with its path-limited commit]

Done.
```

## Prompt Templates

- `../subagent-driven-development/implementer-prompt.md`: the implementer prompt (shared with the full path)
- `./fast-path-reviewer-prompt.md`: the combined reviewer prompt specific to the fast path
