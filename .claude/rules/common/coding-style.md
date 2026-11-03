# Code Style

## Self-Documenting Code

You **MUST** prioritise writing descriptive, self-explanatory code over adding comments or docblocks.

- Use meaningful, descriptive variable and function names
- Keep functions small and focused on a single responsibility
- Structure code to reveal intent through organisation and naming
- Use explicit over implicit logic

## Default Rule: Write Code Without Comments

You **MUST NOT** add comments unless ALL of these conditions are met:

1. The code implements a workaround for an external bug/limitation (e.g. browser quirk, library bug) **or** documents a non-obvious performance optimisation with a measurable benchmark
2. You have a specific ticket/issue/benchmark reference to cite
3. The workaround or optimisation cannot be extracted to a well-named function

**Specifically forbidden:**

- Comments explaining what code does (code should be self-documenting)
- Comments before function calls or variable assignments that just narrate the next line
- Comments describing assertion intent in tests
- "Step X" comments in tests, use the test name instead
- Any comment that just repeats what the code says

**Absolute ban in test files.** Tests are documentation. Test names and assertions must be self-explanatory. Zero comments except ticket references for regression tests.

When you think a comment is needed, refactor first: rename variables or functions, extract to a well-named method, simplify the logic. Only add a comment after refactoring has failed, and you have a ticket reference for a workaround.

## Docblocks

You **MUST** avoid docblocks where type systems and function signatures provide sufficient information.

You **MAY ONLY** use docblocks when:

- The project uses a documentation generator that reads them (e.g. phpDocumentor, TypeDoc, JSDoc, Sphinx, Rustdoc, Javadoc), check for a config file such as `phpdoc.xml`, `typedoc.json`, `jsdoc.json`, `docs/conf.py`, etc. before adding any
- Providing usage examples for complex public APIs that are part of a published package
- Documenting framework-specific annotations or decorators that the framework itself requires (e.g. Symfony attributes, NestJS decorators)
- Type information alone cannot convey the contract (e.g. documenting units, ranges, or invariants a type cannot express)

## Function and Method Length

You **MUST** keep functions concise and focused. A function is too long when any of these apply:

- It exceeds 20 lines of logic (excluding signature, braces, and blank lines)
- It mixes multiple levels of abstraction
- It cannot be named with a single clear verb phrase

Exceeding 20 lines is permitted only when the body is a flat, unavoidable structure (e.g. a single `switch` or match statement, configuration object literal, or straight-line setup for an integration test). Decompose in all other cases.

## Naming Conventions

You **MUST** follow language-specific conventions while prioritising clarity:

- Use full words over abbreviations unless the abbreviation is ubiquitous (e.g. `HTTP`, `URL`, `ID`)
- Avoid single-letter variables except in narrow scopes (loop counters, mathematical formulae)
- Boolean variables should read as predicates: `isActive`, `hasPermission`, `canExecute`

## YAGNI: Build Only What Was Asked For

You **MUST NOT** add features, refactor code, or make "improvements" beyond what the current task requires. This is the YAGNI principle (You Aren't Gonna Need It), and it applies to every change you make.

**Specifically forbidden:**

- Adding configurability, options, or flags the task did not ask for
- Adding error handling for cases the task does not cover
- Refactoring surrounding code that is not part of the task
- "While I am here" clean-ups, even small ones
- Designing for hypothetical future requirements
- Creating helpers, utilities, or abstractions for one-time operations
- Adding backwards-compatibility shims when you can change the code
- Adding feature flags for changes that do not need them

The right amount of complexity is what the task actually requires. No speculative abstractions, but no half-finished implementations either. Three similar lines of code are better than a premature abstraction.

If you notice an unrelated issue while working on a task, log it separately (as a ticket, a note, or surface it to your human partner), but **MUST NOT** fix it inside the current change. One task, one change.

YAGNI is referenced from `testing.md` (where it applies during the GREEN step of TDD) and `code-review.md` (where it applies when a reviewer suggests "implementing properly" something that nothing currently uses).

## Commit messages
DO NOT add Co-Authored-By at the end of the commit message

## Code Organisation

### File Structure

You **SHOULD** organise files to reflect domain concepts:

- One primary class or module per file (language-dependent)
- Group related functionality together
- Use directory structure to represent architectural boundaries

### Dependency Management

You **MUST NOT** add new runtime or development dependencies without explicit user approval. When proposing a dependency, you **MUST** tell the user:

- Why the standard library or existing project dependencies are insufficient
- The package name, current version, and licence
- Whether it is actively maintained (last release within 12 months, open issues triaged)
- Its approximate installation size and transitive dependency count

You **SHOULD** prefer the standard library or a small inline implementation when a dependency would add fewer than ~50 lines of logic.

### Import Organisation

You **SHOULD** organise imports logically:

- Group by type (standard library, third-party, local)
- Sort alphabetically within groups (allow formatting tools to handle this if defined in project instructions)
- Remove unused imports

## Consistency

### Follow Existing Patterns

You **MUST** maintain consistency with the existing codebase:

- Match established patterns and conventions, even when you would prefer a different approach
- If you believe a pattern should change, raise it with the user and wait for approval before acting
- If the user approves a pattern change, apply it consistently across every site you touch in that change, not just the one you started from
- Don't mix styles within a file or module

### Formatters and Linters

You **SHOULD** use automated tooling where available:

- Code formatters
- Linters
- Static analysis tools
- Respect existing tool configurations

## Error Handling

### Explicit Error States

You **SHOULD** make error conditions explicit and handled:

- Avoid silent failures
- Use exceptions for exceptional circumstances, not control flow
- Validate input at system boundaries (see the Security section for the definition of a system boundary)
- Return explicit error types (Result/Either) for operations whose failure is an expected outcome rather than a bug (e.g. parsing, network calls, file I/O)

### Error Messages

You **MUST** provide actionable error messages:

- Describe what went wrong
- Include relevant context (what operation was attempted)
- Suggest remediation where applicable

## Performance

### Premature Optimisation

You **SHOULD** prioritise correctness and clarity over premature optimisation:

- Write clear code first
- Measure performance before optimising and cite the measurement when you do
- For comments on optimised code, follow the Default Rule section

### Resource Management

You **MUST** handle resources properly:

- Close file handles, database connections, network sockets
- Use language-appropriate patterns (RAII, defer, using statements, context managers)
- Avoid resource leaks

## Security

### Input Validation

You **MUST** validate and sanitise external input:

- Never trust user input
- Validate at system boundaries
- Use parameterised queries for database access
- Encode output appropriately for context

**System boundaries** are any point where data enters your code from outside its trust zone, including:

- HTTP request handlers (body, query, headers, cookies)
- CLI argument and environment variable parsing
- File system reads and deserialisation (JSON, YAML, XML, binary)
- Database result sets from tables that accept user writes
- Message queue and event bus consumers
- Third-party API responses and webhooks
- Inter-process communication (pipes, sockets, IPC)

### Sensitive Data

You **MUST NOT** commit sensitive data:
You **MUST** point out to the user if there is potential to commit sensitive data:

- Credentials, API keys, tokens
- Personal or confidential information
- Use environment variables or secure secret management

## Documentation

### README Files

You **SHOULD** maintain clear README documentation:

- Installation instructions
- Usage examples
- Architecture overview (for complex projects)
- Contribution guidelines

### Architectural Documentation

You **MAY** provide architectural documentation for complex systems:

- System diagrams
- Decision records (ADRs)
- API specifications
- Deployment guides
