# Testing

## Test Naming

You **MUST** write descriptive test names that explain the scenario:

- Use complete sentences or clear phrases
- Describe the expected behaviour, not implementation
- Make failures self-explanatory

Example:

```typescript
// Good
test('calculateOrderTotalIncludingVAT adds 20% VAT to subtotal')
test('user authentication fails when password is incorrect')

// Poor
test('test1')
test('calcTotal')
```

## Test Structure

You **SHOULD** follow an Arrange-Act-Assert pattern:

- Set up test data (Arrange)
- Execute the code under test (Act)
- Verify outcomes (Assert)

## What Makes a Good Test

You **MUST** write tests that:

- Test exactly one behaviour. If the test name contains the word "and", split it into two tests.
- Exercise real code. Mocks are permitted only at true system boundaries (network, filesystem beyond `tmp_path`, clocks, randomness).
- Demonstrate how the code should be used, not how it is implemented.
- Are deterministic. A test that sometimes passes and sometimes fails is broken and **MUST** be fixed, unless the Meaningful Assertions section below allows its removal.

You **MUST NOT** mock:

- The code under test
- Pure functions or data classes
- Internal collaborators that you own and can drive with real data

## Meaningful Assertions

A test exists to catch a genuine regression in the behaviour it names; if you cannot name the defect an assertion would catch, narrow or drop it. Assert the specific behaviour the name promises, never incidental structure: no collection-size assertions unless the behaviour is about the count, no full-object or snapshot equality unless it is about the object's complete shape. A test **MUST NOT** fail because unrelated code changed.

A test earns its place only when it catches a defect that no other test catches. Remove a test in only two cases. Another test fails on the same defect, or the test can fail on no defect at all. Never remove the last test that can catch a defect in a behaviour.

## Test-Driven Development

### The Iron Law

**No production code without a failing test first.**

You **MUST** write the test before the production code. You **MUST** watch the test fail before writing the code that makes it pass. If you did not watch the test fail, you do not know that the test exercises what you think it exercises.

If you wrote production code before a test, you **MUST** delete that code and start again from a failing test. Delete means delete: not "keep as reference", not "adapt as I write the test".

### When TDD Applies

You **MUST** apply TDD to:

- New features
- Bug fixes
- Refactors that change observable behaviour
- Any change to code whose behaviour is externally visible

You **MAY** skip TDD for instruction files (rules, skills, prompts, documentation) and for non-executable configuration. Instead, write a check first, for example a grep or a diff. The check fails before the edit and passes after it. Run it and cite the output. This is a standing approval. Throwaway prototypes and generated code are also exceptions, but they require explicit approval from your human partner. Executable scripts and hooks are code: TDD applies to them.

### Verification is Mandatory

Every RED step **MUST** end with you running the test and watching it fail for the expected reason. A test that errors (syntax error, import error, missing symbol) does not count as RED. A test that passes on its first run is testing behaviour that already exists; fix the test.

Every GREEN step **MUST** end with you running the test and watching it pass and confirming that no other tests broke. Output **MUST** be pristine: no warnings, no stray errors, no skipped tests you did not intend to skip.

### YAGNI During GREEN

In the GREEN step you **MUST** write only the minimal code required to pass the test. You **MUST NOT** add unrequested options, configurability, error paths for cases the test does not cover, or "while I am here" improvements. See `coding-style.md` for the general YAGNI rule.

### Bug Fixes

You **MUST NOT** fix a bug without first writing a failing test that reproduces it. The test proves the fix works and prevents the bug from returning.

### Procedural Rules

The procedural rules that bind once the `test-driven-development` skill is running (the rationalisation table, the red-flags stop list) live in `../../skills/test-driven-development/RULES.md` and load when the skill is invoked.
