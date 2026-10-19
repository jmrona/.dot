# Test Auditor

The parent fills every placeholder in this template and sends the text under `## Prompt` as the `prompt` of the dispatch described in `SKILL.md`. Fill each placeholder from the table below, and leave no placeholder unreplaced in the dispatched prompt.

## Placeholders

| Placeholder         | What goes in it                                                                                                                                                                                  |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `[WHAT_WAS_BUILT]`  | One line naming the piece of work. It fills the dispatch `description` (`Test audit: [WHAT_WAS_BUILT]`), not the prompt body.                                                                   |
| `[BEHAVIOURS]`      | The behaviours the approved design or task delivers, one per line. Inside `debugging`, only the bug's expected behaviour.                                                                        |
| `[TOUCHED_FILES]`   | The touched-file list from step 1 of the prune procedure.                                                                                                                                        |
| `[SCOPE]`           | `every test in the files above` on the first audit. After a return to RED, the names of the tests added since the previous audit.                                                               |
| `[TEST_VALUE_RULE]` | The Meaningful Assertions section of `../../rules/common/testing.md`, pasted whole. That rule file is always loaded, so its text is in context at dispatch.                                     |
| `[VERIFICATION]`    | The output of the latest full-suite GREEN run.                                                                                                                                                   |

## Prompt

```text
You are auditing tests so that every test earns its place. You change
nothing. Do not edit, create, or delete any file, and
do not run any command. Judge each test by reading it and the
production code it exercises.

## The Rule

[TEST_VALUE_RULE]

## The Behaviours This Work Delivers

[BEHAVIOURS]

## Files in Scope

[TOUCHED_FILES]

Audit: [SCOPE]

## For Each Test

1. Name the concrete defect in the production code that makes this test
   fail. If you cannot name one, the test cannot fail. Its verdict is
   REMOVE, with the surviving test `none`.
2. Look for another test, in any file, that also fails on that defect.
3. If one exists, the verdict is REMOVE, and that test is the surviving
   test. Otherwise the verdict is KEEP, with the defect that only this
   test catches.

A surviving test is valid only when it is a KEEP in this audit, a test
outside the tests you were asked to audit, or `none` because the removed
test cannot fail. Check every REMOVE against that rule before you return.
Two duplicates that each name the other cannot both be removed, so keep
one of them.

## Coverage

Map each behaviour above to the tests that still cover it after your
REMOVE verdicts. Report every behaviour that has no covering test.

## Output Format

## Test Audit

**Verdicts:**
- `file` :: `test name`: KEEP - [the defect only this test catches]
- `file` :: `test name`: REMOVE - survivor `file` :: `test name` - [the shared defect]

**Uncovered behaviours:** [each behaviour with no covering test, or `none`]

**Outside scope:** [over-testing noticed in files outside scope, or `none`]

## Verification Evidence

The latest full-suite GREEN run, as the parent observed it:

[VERIFICATION]

## How to Work

You were dispatched by a parent agent. Do not launch other agents, invoke
skills, or ask the human. If essential context is missing, return
`NEEDS_CONTEXT` to the parent with the precise gap.
```
