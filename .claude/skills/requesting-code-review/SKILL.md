---
name: requesting-code-review
description: Dispatches a reviewer subagent against a specific git range with the context it needs to assess production readiness. Selects the most specific reviewer type available, starts on the cheapest capable model, and applies severity discipline to the result.
---

# Requesting Code Review

The iron-law rules (when reviews are mandatory, forbidden response phrases) live in `../../rules/common/code-review.md`. The procedural rules that bind once a review skill is running (verify before acting, severity discipline, when to push back, GitHub inline reply procedure) live in `../_shared/code-review.md`. Subagent iron-law rules live in `../../rules/common/subagents.md` and the dispatch procedure rules live in `../_shared/subagent-dispatch.md`. This skill is the procedure that dispatches a reviewer.

Before running the procedure below, you **MUST** read `../_shared/code-review.md` and `../_shared/subagent-dispatch.md` using the Read tool if you have not already read them in this session.

## Procedure

If `git rev-parse --is-inside-work-tree` fails, the working directory is not a git repository. In that case you **MUST** follow `../_shared/no-git-flow.md` in place of every git step in this skill.

1. **Identify the review range.** Capture the base and head commits of the work to review:

   ```bash
   BASE_SHA=$(git rev-parse HEAD~1)
   HEAD_SHA=$(git rev-parse HEAD)
   ```

   In orchestrated work, `BASE_SHA` is the commit at the start of the feature (the commit before the first task) and `HEAD_SHA` is the current commit. This skill reviews the finished feature, because per-task reviews use the reviewer prompt of `subagent-driven-development`.

2. **Select the subagent type.** Per `../_shared/subagent-dispatch.md`, pick the most specific reviewer type available. Prefer a language- or framework-specific reviewer when the session lists one. If none fits, use `general-purpose` with the template as its full instruction. The reviewer reads and reports. It **MUST NOT** edit files.

3. **Fill the template.** Open `code-reviewer.md` in this skill directory and populate:

   - `{WHAT_WAS_IMPLEMENTED}`: a one-line description of what the change builds
   - `{DESCRIPTION}`: a short paragraph of what the change builds and the design decisions that matter for review
   - `{PLAN_REFERENCE}`: a pointer to the approved design, ticket, or plan the work is delivering against
   - `{BASE_SHA}` and `{HEAD_SHA}`: the commits from step 1

4. **Dispatch.** Send the filled template to the reviewer subagent. Use the cheapest capable model: start at the Low-cost default tier and escalate only on evidence to Standard escalation, resolving each per `../_shared/subagent-dispatch.md`, when the change involves cross-file integration reasoning or architectural judgement.

5. **Act on the output.** Process the reviewer's findings through `receiving-code-review` and apply the severity discipline in `../_shared/code-review.md`: fix Critical before anything else, fix Important before the next task or merge, log Minor for later.

## Worked Example

You have just completed the last task of an orchestrated feature: adding verification and repair functions for a conversation index.

```bash
BASE_SHA=$(git rev-parse <first-task-commit>~1)
HEAD_SHA=$(git rev-parse HEAD)
```

Dispatch a reviewer subagent at the Low-cost default tier, resolved per `../_shared/subagent-dispatch.md`, with the filled template:

- `{WHAT_WAS_IMPLEMENTED}`: Verification and repair functions for the conversation index
- `{DESCRIPTION}`: Added `verifyIndex()` and `repairIndex()` covering four issue types: missing entries, stale entries, hash mismatches, and orphaned files. Repair is idempotent and logs every action.
- `{PLAN_REFERENCE}`: The deployment plan in the approved design
- `{BASE_SHA}`: `a7981ec`
- `{HEAD_SHA}`: `3df7661`

The reviewer returns:

- Strengths: clean separation, real tests, no mocks of code under test
- Important: no progress indicators on long repair runs
- Minor: magic number (100) for the reporting interval
- Assessment: ready to proceed with Important fixed

Fix the Important issue, leave the Minor one logged, then finish the feature. Do not proceed while the Important issue is unfixed (see `../_shared/code-review.md`).

## Template

The full reviewer prompt template lives at `skills/requesting-code-review/code-reviewer.md`. Keep the template's placeholders in sync with the list in step 3 when editing either file.
