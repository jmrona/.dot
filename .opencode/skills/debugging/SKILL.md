---
name: debugging
description: "Runs a disciplined, evidence-driven investigation to reproduce a bug, identify its root cause, and deliver a minimal verified fix. Triggered by bugs, errors, failing tests, unexpected behaviour, or anything described as not working. Enforces the hard gate (no fix without reproduction and identified root cause), scope discipline, the investigation budget, and the minimal fix principle."
---

# Debugging

The iron-law rules (the Hard Gate, Evidence Over Intuition, and the bug-fixes-still-need-tests-and-verification cross-references) live in `../../rules/common/debugging.md` and load on every session. The procedural rules that bind once this skill is running (scope discipline, the re-focus rule, the investigation budget, root cause vs symptom, the minimal fix principle, the rationalisation table) live in `RULES.md` alongside this file. The bug-fix TDD rule lives in `../../rules/common/testing.md`. The post-fix verification gate lives in `../../rules/common/verification.md`. This skill is the 7-phase procedure that produces the evidence and the fix those rules require.

Before running the procedure below, you **MUST** read `RULES.md` (sibling file in this skill directory) and `../_shared/subagent-dispatch.md` (the debugging skill dispatches an investigator subagent) using the Read tool if you have not already read them in this session. The procedure below assumes those rules are in your context.

**Precondition**: the user has reported something not working, pasted an error, reported a failing test, or described behaviour differing from what was intended. If you are unsure whether the report is a bug or a feature request, clarify during Phase 1.

## Mode Selection

At the start of the investigation, select the mode. If the user has not indicated a preference, pick based on context. If unclear, default to **Collaborative**.

| Mode              | When                                                                           | User involvement                                          |
|-------------------|--------------------------------------------------------------------------------|-----------------------------------------------------------|
| **Collaborative** | User has domain knowledge, complex system, or wants to guide the investigation | High: user helps direct each phase                        |
| **Guided**        | User wants to understand the debugging process, learning context               | High: you explain the reasoning behind each step          |
| **Autonomous**    | User wants the fix; clear error; well-tested codebase                          | Low: you investigate independently and present findings   |

## The Seven Phases

The parent owns and runs the complete investigation workflow, all user questions, root-cause decisions, and approval gates. Investigators only gather bounded evidence for a specific question; they never take over the debugging workflow or a fix.

Run the phases in order. You **MUST NOT** skip a phase, and you **MUST NOT** reorder them.

### Phase 1: Understand the Problem

Before touching code, establish:

- **Expected behaviour**: what should happen?
- **Actual behaviour**: what happens instead?
- **Trigger conditions**: when does it happen? Always, or only under specific conditions?
- **Recency**: when did it last work? What changed since then?

If the bug report is ambiguous, ask clarifying questions. Do not guess at what "broken" means.

In **Guided mode**, explain why each question matters for narrowing the search space.

### Phase 2: Reproduce

Run the failing scenario and observe the actual output:

- Run the failing test, command, or user action
- Capture the exact error output, stack trace, or incorrect behaviour
- Confirm the bug exists in the current state of the code

If reproduction fails, check whether the environment matches (dependencies, config, data), ask the user for reproduction steps, and apply the non-reproducibility rule in `../../rules/common/debugging.md` if the bug is truly non-reproducible.

In **Guided mode**, explain why reproduction matters: without it, you cannot verify that any fix works.

### Phase 3: Gather Scoped Evidence

Apply the scope discipline in `../../rules/common/debugging.md`. The initial-scope allowlist and the explicit prohibitions on wider reading are the rules; this phase is where they bite.

The parent may delegate bounded evidence gathering in every interaction mode through the native OpenCode V2 subagent interface using `investigator-prompt.md`. Assign `stack-specialist` on `openai/easy` for simple, bounded evidence collection. In Collaborative and Guided as well as Autonomous mode, delegate known difficult substantive hypothesis or root-cause analysis, integration reasoning, and security analysis to `complex-worker` on `openai/hard`; do not spend an easy attempt first or ask it to run this debugging workflow. The parent provides the full brief, evidence, hypothesis, and scoped files, and retains responsibility for investigation phases and user interaction.

In Autonomous mode, the parent may split independent evidence gathering across two or three investigators in parallel:

- One reads the error site and its immediate context
- One checks recent git history for affected files
- One traces the specific code path from the error

Parallel investigation is optional and mode-specific; use `dispatching-parallel-agents` only when multiple investigations are independent. In Collaborative and Guided modes, the parent may delegate one difficult analysis while continuing user questions, explanations, and hypothesis presentation. Per `../../rules/common/subagents.md`, give each investigator exactly the context it needs and nothing more.

In **Guided mode**, explain what evidence you are gathering and what you are deliberately not looking at yet.

If you hit the Refocus Rule in `../../rules/common/debugging.md` (five files read without a clear hypothesis), stop and surface what you know to the user before doing anything else.

### Phase 4: Form Hypotheses

Based on the evidence, form two to four ranked hypotheses. Each hypothesis **MUST** include:

- **What**: the specific claim about the root cause
- **Evidence**: the specific observations that support it
- **Predicted observation**: what you would expect to see if the hypothesis is correct

In **Collaborative** and **Guided** modes, present the ranked list to the user. In **Autonomous** mode, rank internally and proceed to test the top two or three.

In **Guided mode**, explain the reasoning behind the ranking. What makes one hypothesis more likely than another?

### Phase 5: Test Hypotheses

Test the most likely hypothesis first:

1. Identify a specific check that would confirm or eliminate it
2. Run the check: read code, add temporary logging, run a test with different input
3. Record the result as evidence for or against
4. If confirmed, proceed to Phase 6. If disproven, move to the next hypothesis.

When a hypothesis requires substantive difficult analysis, the parent delegates that bounded hypothesis to `complex-worker` on `openai/hard` in every interaction mode; bounded evidence checks may go to `stack-specialist` on `openai/easy`. In Autonomous mode, the parent may test independent hypotheses in parallel using investigators, each with one focused question. Parallel investigation is optional; Collaborative and Guided modes retain their user-facing hypothesis discussion and explanations while the parent relays bounded analysis requests and evidence. Invoke `dispatching-parallel-agents` only when more than one investigation is independent. Investigators return evidence only and never run nested workflows.

Apply the Investigation Budget from `../../rules/common/debugging.md`: three cycles maximum before you stop and refocus with the user.

### Phase 6: Identify Root Cause

State the root cause clearly, per the root-cause-not-symptom rule in `../../rules/common/debugging.md`:

- **What**: the specific code, configuration, or data causing the issue
- **Why**: the causal chain from the root cause to the observed symptom
- **Since when**: if determinable, when the bug was introduced (commit reference)

Present the root cause and your proposed fix approach to the user for confirmation. Per `../../rules/common/workflow.md`, this is the approved design for the bug fix. You **MUST** wait for explicit approval before moving to Phase 7.

### Phase 7: Fix

Once the user has approved the root cause and the fix approach:

1. **Invoke the `test-driven-development` skill** to write a failing regression test that reproduces the bug. Before writing the test, record the base as that skill's "Before the First RED: Record the Base" section describes. Per `../../rules/common/testing.md`, the test **MUST** fail before the fix and pass after. Watch it fail for the right reason. The skill's prune waits for step 3.
2. **Implement the minimal fix** per the minimal fix principle in `../../rules/common/debugging.md`. Do not refactor, do not add features, do not fix unrelated issues.
3. **Prune the tests.** Once the fix is green, run the "PRUNE: Every Test Earns Its Place" stage of the `test-driven-development` skill. That stage presents its results to the user and removes nothing until the user answers. The prune therefore never audits a RED state. Here `[BEHAVIOURS]` holds only the bug's expected behaviour, so the only uncovered behaviour it can report is the root-cause behaviour.
4. **Invoke the `verification-before-completion` skill** to run the full relevant test suite, confirm the regression test passes, confirm no other tests broke, and cite the evidence before claiming the fix complete.

## Investigator Dispatch

The parent remains the debugging orchestrator in every mode. Investigators perform only bounded evidence collection or analysis; they do not own investigation phases, ask the human, seek approval, or fix anything.

- Use `stack-specialist` on `openai/easy` for bounded evidence collection.
- In Collaborative and Guided as well as Autonomous mode, route all known difficult substantive hypothesis or root-cause analysis, integration reasoning, and security analysis to `complex-worker` on `openai/hard`.
- Use `skills/debugging/investigator-prompt.md` and provide the expected and actual behaviour, the specific hypothesis, scoped files, full relevant evidence, and one question to answer.
- In Collaborative and Guided modes, the parent retains user questions, explanations, hypothesis presentation, and approval. In Autonomous mode, parallel investigations remain optional and are used only for independent questions.
- The parent reconciles all returned evidence and controls the next phase. Investigators never fix anything; the parent holds fix authority.

## When the Bug Cannot Be Found

If you exhaust the Investigation Budget without a confirmed root cause, follow the rule in `../../rules/common/debugging.md`: present everything you investigated, everything you ruled out, and everything that remains uncertain, and ask the user to help refocus. Do not start guessing. Do not apply a speculative fix.
