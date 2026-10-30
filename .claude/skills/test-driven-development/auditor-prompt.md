# Test Auditor

The parent fills every placeholder in this template and sends the text under `## Prompt` as the `prompt` of the dispatch described in `SKILL.md`. Fill each placeholder from the table below, and leave no placeholder unreplaced in the dispatched prompt.

## Placeholders

| Placeholder            | What goes in it                                                                                                                                             |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `[WHAT_WAS_BUILT]`     | One line naming the piece of work. It fills the dispatch `description` (`Test audit: [WHAT_WAS_BUILT]`), not the prompt body.                               |
| `[BEHAVIOURS]`         | The behaviours the approved design or task delivers, one per line. Inside `debugging`, only the bug's expected behaviour.                                   |
| `[TOUCHED_FILES]`      | The touched-file list from step 1 of the prune procedure.                                                                                                   |
| `[SCOPE]`              | `every test in the files above` on the first audit. After a return to RED, the names of the tests added since the previous audit.                           |
| `[TEST_VALUE_RULE]`    | The Meaningful Assertions section of `../../rules/common/testing.md`, pasted whole. That rule file is always loaded, so its text is in context at dispatch. |
| `[PROJECT_TEST_RULES]` | Step 2 of the prune procedure names the source. Paste it whole, or write `none` when there is no source.                                                             |
| `[VERIFICATION]`       | The output of the latest full-suite GREEN run.                                                                                                              |

## Prompt

```text
You are auditing tests so that every test earns its place. You change
nothing. Do not edit, create, or delete any file, and
do not run any command. Judge each test by reading it and the
production code it exercises.

## The Rule

[TEST_VALUE_RULE]

## Project Test Rules

[PROJECT_TEST_RULES]

If a project rule and a generic category below differ, the project rule takes precedence.

## Removal Categories

These categories apply to every project.

- `scaffolding`: a test that asserts "renders without crashing" or "exports X". It also covers module or type shape, a constant equal to its literal, and a test that asserts its own mock. The category covers an intermediate step that a full-flow test already covers. It covers extra cases from an input class that already has one case.
- `implementation-detail`: a test that asserts internal call counts, CSS class names, DOM structure, or props passed to a child.
- `duplicate`: a test that fails on the same defect as another test.
- `timing-dependent`: a test that uses real timers or `waitFor` chains with no deterministic signal.

A `scaffolding`, `implementation-detail` or `timing-dependent` removal needs one of two things. The first is a named surviving test that fails on the defect the removed test guards. The second is a statement that the removed test cannot fail on any defect. If neither holds, the verdict is not REMOVE, and the audit continues with the remaining steps for that test. Only the project test rules can relax this last-test rule. A wrong-layer category exists only when the project test rules define one.

## The Behaviours This Work Delivers

[BEHAVIOURS]

## Files in Scope

[TOUCHED_FILES]

Audit: [SCOPE]

## For Each Test

1. Check the categories first. Compare the test with the project test rules and with each removal category. If one applies, the verdict is a candidate REMOVE with that category. If the last-test rule blocks the candidate under the generic rules, the audit continues with steps 2 to 5 for that test.
2. Name the concrete defect in the production code that makes this test
   fail. If you cannot name one, the test cannot fail. Its verdict is
   REMOVE, with the best-fitting category and the surviving test `none`.
3. Look for another test, in any file, that also fails on that defect.
   If one exists, the verdict is REMOVE (`duplicate`), and that test is
   the surviving test.
4. If the test guards a defect that no other test catches, check whether one small assertion added to a surviving KEEP test would catch it too. If so, the verdict is MERGE. Name the survivor, the assertion, the production line that the assertion guards, and the reason that the assertion fails when that line breaks. A MERGE removes the audited test and adds the named assertion to the survivor.
5. Otherwise the verdict is KEEP, with the defect that only this
   test catches.

A surviving test, for a REMOVE or a MERGE, is valid only when it is a KEEP in this audit or a test outside the tests you were asked to audit. It is never a test that this audit removes. For a REMOVE only, the survivor can also be `none` because the removed test cannot fail. Check every REMOVE and MERGE against that rule before you return.
Two duplicates that each name the other cannot both be removed, so keep
one of them. A MERGE survivor must be a KEEP in this audit or a test outside the audit, never a test that this audit removes.

## Coverage

Map each behaviour above to the tests that still cover it after your
REMOVE and MERGE verdicts. Report every behaviour that has no covering test.

## Output Format

## Test Audit

**Verdicts:**
- `file` :: `test name`: KEEP - [the defect only this test catches]
- `file` :: `test name`: REMOVE (<category>) - survivor `file` :: `test name` or none - [the reason]
- `file` :: `test name`: MERGE - survivor `file` :: `test name` - add assertion: [the assertion] - guards: [file:line of the production line] - fails with: [the expected failure reason]

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
