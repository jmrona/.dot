# Verification

## The Iron Law

**You MUST NOT claim work is complete, fixed, passing, working, or ready without fresh verification evidence produced in the current message.**

"Fresh" means that you ran the verification command after the last change to the code it verifies. A run from a previous message, a previous task, or before your latest edit does **not** count.

"Evidence" means the actual output of the command: exit code, pass/fail counts, build status. Your belief that the command would pass is not evidence.

If you have not run the verification command in the current message, you **MUST NOT** state or imply that the work is done.

## Scope: What Counts as a Completion Claim

This rule applies to every statement that asserts or implies success, including:

- Direct claims: "tests pass", "build succeeds", "it works", "fixed", "done", "complete", "ready"
- Satisfaction language: "Great!", "Perfect!", "All good", "Looks good"
- Hedged claims: "should pass", "should work now", "probably fine", "seems to work"
- Implicit claims: moving to the next task, committing, opening a PR, handing back to the user, marking a todo complete
- Paraphrases and synonyms of any of the above

You **MUST NOT** evade this rule by choosing different wording. If the reader can take your message to mean that the work is done, the rule applies.

## When the Rule Fires

You **MUST** run fresh verification before any of these:

- Committing, pushing, opening, or updating a pull request
- Claiming a task, subtask, or todo is complete
- Moving on to the next task in a sequence
- Handing control back to the human partner with any implication of success
- Accepting a subagent's report that it succeeded (see `subagents.md`)
- Stating that a bug is fixed, a regression is closed, or a requirement is met

## Procedural Rules and Procedure

When the `verification-before-completion` skill runs, `skills/verification-before-completion/RULES.md` holds its procedural rules, and `skills/verification-before-completion/SKILL.md` holds the executable Gate Function.
