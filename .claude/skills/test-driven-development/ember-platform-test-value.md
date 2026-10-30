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
   - Extra cases from an input class that already has one case. For that last item only, one case per input class always survives. The error path and the empty path are classes of their own.
3. Implementation detail: internal call counts, CSS class names, DOM structure, or props passed to a child.
4. Duplicate: the test fails on the same defect as another test.
5. Timing-dependent: the test uses real timers or `waitFor` chains with no deterministic signal.

- If in doubt, remove the test. A test can be added back later if it is needed.
- For categories 1, 2, 3 and 5, this section overrides the rule "never remove the last test that can catch a defect". The removal names its category and needs no surviving test.
- A removal for category 4 MUST name the surviving test.
- A removal can instead be a MERGE. A surviving test gains one or two assertions that cover the defect of the removed test.
