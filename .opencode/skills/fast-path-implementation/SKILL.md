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

Dispatch one bounded `stack-specialist` implementer on `openai/easy` with every change as a single batch. Use `../subagent-driven-development/implementer-prompt.md` with the complete approved task scope and context. The parent uses the native subagent interface; the implementer does not restart design or orchestration. If the approved design was saved to a plan file under `/Users/jose.romero/.opencode/plan/`, give the implementer that path. Make it read the design from there, and paste only the task scope. The parent declares the exact file paths of the batch as the implementer's `writes`. The parent records the wave base before the dispatch, as `## Per-Wave Pipeline` in `../subagent-driven-development/SKILL.md` describes.

### 2. Single Combined Review

Dispatch `code-reviewer` on `openai/hard` for the independent combined review, using `./fast-path-reviewer-prompt.md`. This is not a weaker review than the full path. It covers the same ground; the combination is possible because the small scope makes separation unnecessary overhead. The parent supplies the diff and verification evidence; the read-only reviewer does not run shell commands or start another review.

The reviewer returns one of three outcomes:

- **PASS**: proceed to the user checkpoint
- **FAIL**: continue the same implementer through `sessionID` with the review issues as fix instructions, then re-review. Repeat until PASS.
- **TRIAGE_INVALID**: the reviewer judges the work is more complex than the triage concluded. Stop the fast path, reclassify as COMPLEX, and hand back to `subagent-driven-development` for re-decomposition.

### 3. Verification Gate

After the reviewer approves and **before** the user checkpoint, run the verification gate against the implementer's work yourself. This is the wave gate of `../subagent-driven-development/SKILL.md`, because fast-path work is a wave of one task, and it is required by `../../rules/common/verification.md`. Even on the fast path, "the reviewer said it was fine" is not a substitute for running the verification yourself.

A wave of one treats `BLOCKED_BY_SIBLING` as `BLOCKED`.

Run the gate in the `## Wave Gate` section of `../subagent-driven-development/SKILL.md` on this wave of one. If any check fails, continue the same implementer through `sessionID` with the failure as fix instructions, then run the gate again.

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
    "Dispatch bounded implementer\n(stack-specialist / openai/easy)" [shape=box];
    "Implementer asks questions?" [shape=diamond];
    "Answer questions, provide context" [shape=box];
    "Implementer implements, tests, self-reviews" [shape=box];
    "Dispatch hard combined reviewer\n(code-reviewer / openai/hard, ./fast-path-reviewer-prompt.md)" [shape=box];
    "Reviewer result?" [shape=diamond];
    "Implementer fixes issues" [shape=box];
    "Hand back to subagent-driven-development\n(re-decompose)" [shape=box];
    "Verification gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" [shape=box, style=bold];
    "Verification passes?" [shape=diamond];
    "User checkpoint:\npresent changes + verification evidence,\ncommit or ask" [shape=box, style=bold];

    "Triage: SIMPLE" -> "Dispatch bounded implementer\n(stack-specialist / openai/easy)";
    "Dispatch bounded implementer\n(stack-specialist / openai/easy)" -> "Implementer asks questions?";
    "Implementer asks questions?" -> "Answer questions, provide context" [label="yes"];
    "Answer questions, provide context" -> "Dispatch bounded implementer\n(stack-specialist / openai/easy)";
    "Implementer asks questions?" -> "Implementer implements, tests, self-reviews" [label="no"];
    "Implementer implements, tests, self-reviews" -> "Dispatch hard combined reviewer\n(code-reviewer / openai/hard, ./fast-path-reviewer-prompt.md)";
    "Dispatch hard combined reviewer\n(code-reviewer / openai/hard, ./fast-path-reviewer-prompt.md)" -> "Reviewer result?";
    "Reviewer result?" -> "Verification gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" [label="PASS"];
    "Reviewer result?" -> "Implementer fixes issues" [label="FAIL"];
    "Reviewer result?" -> "Hand back to subagent-driven-development\n(re-decompose)" [label="TRIAGE_INVALID"];
    "Implementer fixes issues" -> "Dispatch hard combined reviewer\n(code-reviewer / openai/hard, ./fast-path-reviewer-prompt.md)" [label="re-review"];
    "Verification gate (orchestrator):\ngit diff + re-run verification\n(../../rules/common/verification.md)" -> "Verification passes?";
    "Verification passes?" -> "Implementer fixes issues" [label="no"];
    "Verification passes?" -> "User checkpoint:\npresent changes + verification evidence,\ncommit or ask" [label="yes"];
}
```

## Worked Example

```
You: I'm implementing the design for updating copyright headers across the codebase.

[Orchestrator has already asked commit preference]
User chose: Auto-commit after each wave

[Run complexity-triage, classification returns SIMPLE with evidence table]

[Dispatch bounded stack-specialist (openai/easy) with all 8 files as one batch]

Implementer:
  - Updated copyright year in all 8 files
  - Self-review: all changes are consistent string replacements

[Dispatch hard code-reviewer (openai/hard)]

Combined reviewer: [PASS] All 8 files correctly updated. Changes match spec exactly,
no extra modifications, consistent with surrounding code style.

[Verification gate: orchestrator runs git diff + standard verification itself]
$ git diff --stat
 8 files changed, 8 insertions(+), 8 deletions(-)
$ npm test
PASS (78 tests, 78 passed)
$ npm run lint
exit 0

[Verification PASSES]

[Present diff + verification evidence to user]
Here are the changes: 8 files with updated copyright headers.
Verification: 78/78 tests passing, lint exit 0.

[Auto-commit: user chose auto-commit at start, so the single task is committed with its path-limited commit]

Done.
```

## Prompt Templates

- `../subagent-driven-development/implementer-prompt.md`: the implementer prompt (shared with the full path)
- `./fast-path-reviewer-prompt.md`: the combined reviewer prompt specific to the fast path
