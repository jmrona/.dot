# Ember Platform Test Value

These rules apply to Vitest tests under `platform/` in the Ember repository. They fill `[PROJECT_TEST_RULES]` in the test prune.

A Vitest test MUST assert a behaviour that a user or a caller relies on. Examples are the RPC request sent, the cache invalidated, and a state change after an interaction. Others are a permission or feature-flag gate, the error and empty paths, pure logic (parsers, mappers, reducers), and a hook contract.

The test auditor removes tests in these categories in the PRUNE stage. Its verdicts are written REMOVE and MERGE. The red-green-refactor cycle does not change, so a test written to drive a change can exist until the prune.

1. Static render (wrong layer): the test asserts only that a text, icon or class renders, with no data or permission condition. Playwright covers this when it arrives.
2. Test-driven development (TDD) scaffolding: a test that proves the code exists or runs, not a behaviour. The items are:
   - "renders without crashing" or "exports X".
   - Module or type shape.
   - A constant equal to its literal.
   - A test that asserts its own mock.
   - An intermediate step that a full-flow test covers.
   - Extra cases from an input class that already has one case. For that last item only, one case per input class always survives. The error path and the empty path are classes of their own. The definition of an input class follows the categories.
3. Implementation detail: internal call counts, CSS class names, DOM structure, or props passed to a child.
4. Duplicate: the test fails on the same defect as another test.
5. Timing-dependent: the test uses real timers or `waitFor` chains with no deterministic signal.

An input class is defined by the rewrites that would treat its members differently, not by how the inputs look. Two cases belong to one class only if no plausible rewrite of the condition passes one and fails the other. Keep one case for each of these splits even when it looks like a duplicate:

- A literal against a parameter, where a rule must block both (`users/abc` and `users/:id`).
- An allowlist against a denylist, where a security check accepts only named values (`data:` as well as `javascript:` for a URL protocol check).
- A strict match against a lenient parser, where a flag accepts one literal (`'1'` as well as `'TRUE'` for a `=== 'true'` flag).

Two exceptions apply to categories 1 and 2. The kept splits and these exceptions take precedence over every bullet below:

- A registration list that decides what ships, such as the plugin list, is wiring and not a constant equal to its literal. Keep it when no other test fails if an entry goes missing.
- A notice that warns the user about a consequence, such as public visibility or an irreversible action, is behaviour and not a static render. The same applies to an input constraint such as `accept`. Prefer a MERGE into the test that renders the form.

- If in doubt and no kept split or exception above applies, remove the test. A test can be added back later if it is needed.
- For categories 1, 2, 3 and 5, this section overrides the rule "never remove the last test that can catch a defect". The removal names its category and needs no surviving test.
- A removal for category 4 MUST name the surviving test.
- A removal can instead be a MERGE. A surviving test gains one or two assertions that cover the defect of the removed test.
- Prefer MERGE over REMOVE when the surviving test renders the same state and one or two assertions cover the removed defect.
- After a prune, every surviving test name still describes its cases. A `test.each` left with one row becomes a plain `test()` with a concrete name, and a test that gained a merged assertion is renamed if its name no longer covers it.
