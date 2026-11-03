# Debugging

These rules apply to every debugging activity, whether or not the `debugging` skill has been invoked and however obvious the bug seems.

## The Hard Gate

You **MUST NOT** attempt any fix until both of these are true:

1. You have reproduced the bug against the current state of the code, or you have explicitly noted that it cannot be reproduced and adjusted your confidence accordingly
2. You have identified the root cause with supporting evidence from actual code or actual program output

"I can see the problem" is not evidence. "The error message says X" is not evidence. Running code and observing the failure is evidence.

This gate applies to every bug. You **MUST NOT** waive it because the bug "looks simple", "is obviously a typo", or "will take longer to investigate than to fix".

## Evidence Over Intuition

Every claim about what is wrong **MUST** rest on code that you have read, output that you have captured, or observations from a reproduction. Pattern-matching against an error message without reproduction is forbidden. "It looks like" and "I suspect" are not acceptable as the sole basis for a fix.

If you have no evidence for a claim, gather evidence before you change code.

## Bug Fixes Are Still Changes

A bug fix **MUST** have an approved design (`workflow.md`) and a failing regression test written first (`testing.md`). Run the verification gate on the fix and cite the evidence before you call it complete (`verification.md`).

## Procedural Rules

When the `debugging` skill runs, `skills/debugging/RULES.md` holds its procedural rules, and `skills/debugging/SKILL.md` holds the executable procedure.
