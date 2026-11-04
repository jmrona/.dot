# Obligation inventory

This file lists every MUST, MUST NOT, SHOULD and MAY in the always-loaded rules before Stage 4, and says where each obligation lives after it. The inventory has 378 rows. The base commit is b441014, and the destinations were checked against the working tree at HEAD.

Rows with strength IMPERATIVE are instructions that carry no modal verb of their own. A destination of `dropped, duplicate of <ID>` means that the other row keeps the obligation.

## ambiguity.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| AMB-1 | When ambiguity is detected, the assistant must ask for clarification rather than guess | IMPERATIVE | ambiguity.md, introduction |
| AMB-2 | [Proceed without clarification when:] Only one interpretation is sensible in context, and resolving it... | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-3 | [Stop and seek clarification when:] Justifying a choice between competing interpretations | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-4 | [Stop and seek clarification when:] Weighing multiple plausible readings | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-5 | [Stop and seek clarification when:] Substituting a guess for information not provided by the user | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-6 | [Stop and seek clarification when:] Reasoning around or reinterpreting an instruction that was already given... | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-7 | If obeying an apparently clear instruction requires deliberation or justification, treat this as a tripwire and... | IMPERATIVE | ambiguity.md, Detecting ambiguous requests |
| AMB-8 | When ambiguity is detected, classify the gap into one of two categories: | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-9 | [User intent or preference (only the user can resolve):] Identify the specific gap clearly | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-10 | [User intent or preference:] Ask one direct question | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-11 | [User intent or preference:] Do not proceed until the user provides an answer | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-12 | [Externally verifiable fact (can be checked from authoritative sources):] Do not ask the user | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-13 | [Externally verifiable fact:] Verify from a current, authoritative source | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-14 | [Externally verifiable fact:] Proceed with the verified information | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-15 | [Externally verifiable fact:] Report what was checked and which source was consulted | IMPERATIVE | ambiguity.md, Resolving detected ambiguity |
| AMB-16 | After resolving ambiguity, evaluate whether the gap warrants one of the following: | IMPERATIVE | ambiguity.md, Post-resolution recommendations |
| AMB-17 | [Standing instruction:] ... Recommend capturing it as a persistent instruction. | IMPERATIVE | ambiguity.md, Post-resolution recommendations |
| AMB-18 | [Skill:] ... Surface the procedure rather than discarding it. | IMPERATIVE | ambiguity.md, Post-resolution recommendations |
| AMB-19 | [Neither:] ... State this plainly so the user can improve future requests rather than creating unnecessary... | IMPERATIVE | ambiguity.md, Post-resolution recommendations |

## code-organisation.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| ORG-1 | You SHOULD organise files to reflect domain concepts: | SHOULD | coding-style.md, Code Organisation, File Structure |
| ORG-2 | One primary class or module per file (language-dependent) | SHOULD | coding-style.md, Code Organisation, File Structure |
| ORG-3 | Group related functionality together | SHOULD | coding-style.md, Code Organisation, File Structure |
| ORG-4 | Use directory structure to represent architectural boundaries | SHOULD | coding-style.md, Code Organisation, File Structure |
| ORG-5 | You MUST NOT add new runtime or development dependencies without explicit user approval. | MUST NOT | coding-style.md, Code Organisation, Dependency Management |
| ORG-6 | [When proposing a dependency, you MUST tell the user:] Why the standard library or existing project... | MUST | coding-style.md, Code Organisation, Dependency Management |
| ORG-7 | [tell the user:] The package name, current version, and licence | MUST | coding-style.md, Code Organisation, Dependency Management |
| ORG-8 | [tell the user:] Whether it is actively maintained (last release within 12 months, open issues triaged) | MUST | coding-style.md, Code Organisation, Dependency Management |
| ORG-9 | [tell the user:] Its approximate installation size and transitive dependency count | MUST | coding-style.md, Code Organisation, Dependency Management |
| ORG-10 | You SHOULD prefer the standard library or a small inline implementation when a dependency would add fewer than... | SHOULD | coding-style.md, Code Organisation, Dependency Management |
| ORG-11 | You SHOULD organise imports logically: | SHOULD | coding-style.md, Code Organisation, Import Organisation |
| ORG-12 | Group by type (standard library, third-party, local) | SHOULD | coding-style.md, Code Organisation, Import Organisation |
| ORG-13 | Sort alphabetically within groups (allow formatting tools to handle this if defined in project instructions) | SHOULD | coding-style.md, Code Organisation, Import Organisation |
| ORG-14 | Remove unused imports | SHOULD | coding-style.md, Code Organisation, Import Organisation |

## code-review.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| CR-1 | [You MUST request a code review before any of the following:] Handing a task back as complete in orchestrated... | MUST | code-review.md, Mandatory Reviews |
| CR-2 | [request a code review before:] Merging to main or opening a pull request | MUST | code-review.md, Mandatory Reviews |
| CR-3 | [request a code review before:] Declaring a major feature complete | MUST | code-review.md, Mandatory Reviews |
| CR-4 | You MUST NOT skip a review because the change "is simple", "is small", "is obvious", or "was tested locally".... | MUST NOT | code-review.md, Mandatory Reviews |
| CR-5 | You MUST NOT respond to code review feedback with any performative, gratitude, or agreement language. This... | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-6 | Banned phrases (non-exhaustive, paraphrases and synonyms are equally banned) | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-7 | [Banned phrases] "You're absolutely right" | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-8 | [Banned phrases] "Great point", "Excellent feedback", "Good catch" | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-9 | [Banned phrases] "Thanks", "Thank you", "Thanks for catching that", or any gratitude expression | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-10 | [Banned phrases] "Let me implement that now" (before verification has happened) | MUST NOT | code-review.md, Forbidden Responses to Feedback |
| CR-11 | [Permitted responses:] Restate the technical requirement in your own words | MAY | code-review.md, Forbidden Responses to Feedback |
| CR-12 | [Permitted responses:] Ask a specific clarifying question | MAY | code-review.md, Forbidden Responses to Feedback |
| CR-13 | [Permitted responses:] Push back with technical reasoning (see "When to Push Back" in the procedural rules) | MAY | code-review.md, Forbidden Responses to Feedback |
| CR-14 | [Permitted responses:] State the fix and its location, or just ship the fix and let the diff speak | MAY | code-review.md, Forbidden Responses to Feedback |
| CR-15 | If you catch yourself about to write "thanks" or "you're right", you MUST delete it and state the fix instead. | MUST | code-review.md, Forbidden Responses to Feedback |
| CR-16 | To request a review, invoke the `requesting-code-review` skill. | IMPERATIVE | code-review.md, Procedural Rules |
| CR-17 | To process incoming review feedback, invoke the `receiving-code-review` skill. | IMPERATIVE | code-review.md, Procedural Rules |

## coding-style.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| CS-1 | You MUST prioritise writing descriptive, self-explanatory code over adding comments or docblocks. | MUST | coding-style.md, Self-Documenting Code |
| CS-2 | Use meaningful, descriptive variable and function names | MUST | coding-style.md, Self-Documenting Code |
| CS-3 | Keep functions small and focused on a single responsibility | MUST | coding-style.md, Self-Documenting Code |
| CS-4 | Structure code to reveal intent through organisation and naming | MUST | coding-style.md, Self-Documenting Code |
| CS-5 | Use explicit over implicit logic | MUST | coding-style.md, Self-Documenting Code |
| CS-6 | You MUST NOT add comments unless ALL of these conditions are met: | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-7 | [no comments unless ALL met:] Workaround for an external bug or limitation, or a measured performance optimisation | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-8 | [no comments unless ALL met:] You have a specific ticket/issue/benchmark reference to cite | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-9 | [no comments unless ALL met:] The workaround or optimisation cannot be extracted to a well-named function | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-10 | [Specifically forbidden:] Comments explaining what code does (code should be self-documenting) | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-11 | [Specifically forbidden:] Comments before function calls or variable assignments that just narrate the next line | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-12 | [Specifically forbidden:] Comments describing assertion intent in tests | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-13 | [Specifically forbidden:] "Step X" comments in tests, use the test name instead | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-14 | [Specifically forbidden:] Any comment that just repeats what the code says | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-15 | Absolute ban on comments in test files, except ticket references for regression tests | MUST NOT | coding-style.md, Default Rule: Write Code Without Comments |
| CS-16 | Test names and assertions must be self-explanatory. | IMPERATIVE | coding-style.md, Default Rule: Write Code Without Comments |
| CS-17 | When you think a comment is needed, refactor first (rename, extract, simplify) | IMPERATIVE | coding-style.md, Default Rule: Write Code Without Comments |
| CS-18 | Add a comment only after refactoring has failed, and with a ticket reference | IMPERATIVE | coding-style.md, Default Rule: Write Code Without Comments |
| CS-19 | You MUST avoid docblocks where type systems and function signatures provide sufficient information. | MUST | coding-style.md, Docblocks |
| CS-20 | [MAY ONLY use docblocks when:] A documentation generator reads them (PHPDoc, TypeDoc, JSDoc, Sphinx, Rustdoc... | MAY | coding-style.md, Docblocks |
| CS-21 | Check for the generator config file before adding any docblock | IMPERATIVE | coding-style.md, Docblocks |
| CS-22 | [MAY ONLY use docblocks when:] Providing usage examples for complex public APIs that are part of a published... | MAY | coding-style.md, Docblocks |
| CS-23 | [MAY ONLY use docblocks when:] Documenting framework-specific annotations or decorators that the framework... | MAY | coding-style.md, Docblocks |
| CS-24 | [MAY ONLY use docblocks when:] Type information alone cannot convey the contract (e.g. documenting units... | MAY | coding-style.md, Docblocks |
| CS-25 | You MUST keep functions concise and focused. | MUST | coding-style.md, Function and Method Length |
| CS-26 | [A function is too long when any of these apply:] It exceeds 20 lines of logic (excluding signature, braces... | MUST NOT | coding-style.md, Function and Method Length |
| CS-27 | [A function is too long when:] It mixes multiple levels of abstraction | MUST NOT | coding-style.md, Function and Method Length |
| CS-28 | [A function is too long when:] It cannot be named with a single clear verb phrase | MUST NOT | coding-style.md, Function and Method Length |
| CS-29 | Exceeding 20 lines is permitted only for a flat, unavoidable structure | MAY | coding-style.md, Function and Method Length |
| CS-30 | Decompose in all other cases. | IMPERATIVE | coding-style.md, Function and Method Length |
| CS-31 | You MUST follow language-specific conventions while prioritising clarity: | MUST | coding-style.md, Naming Conventions |
| CS-32 | [follow conventions:] Use full words over abbreviations unless the abbreviation is ubiquitous (e.g. `HTTP`... | MUST | coding-style.md, Naming Conventions |
| CS-33 | [follow conventions:] Avoid single-letter variables except in narrow scopes (loop counters, mathematical formulae) | MUST | coding-style.md, Naming Conventions |
| CS-34 | [follow conventions:] Boolean variables should read as predicates: `isActive`, `hasPermission`, `canExecute` | SHOULD | coding-style.md, Naming Conventions |
| CS-35 | You MUST NOT add features, refactor code, or make "improvements" beyond what the current task requires. | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-36 | [Specifically forbidden:] Adding configurability, options, or flags the task did not ask for | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-37 | [Specifically forbidden:] Adding error handling for cases the task does not cover | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-38 | [Specifically forbidden:] Refactoring surrounding code that is not part of the task | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-39 | [Specifically forbidden:] "While I am here" clean-ups, even small ones | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-40 | [Specifically forbidden:] Designing for hypothetical future requirements | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-41 | [Specifically forbidden:] Creating helpers, utilities, or abstractions for one-time operations | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-42 | [Specifically forbidden:] Adding backwards-compatibility shims when you can change the code | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-43 | [Specifically forbidden:] Adding feature flags for changes that do not need them | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-44 | No speculative abstractions, but no half-finished implementations either. | IMPERATIVE | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-45 | If you notice an unrelated issue while working on a task, log it separately (as a ticket, a note, or surface it... | IMPERATIVE | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-46 | You MUST NOT fix an unrelated issue inside the current change | MUST NOT | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-47 | One task, one change. | IMPERATIVE | coding-style.md, YAGNI: Build Only What Was Asked For |
| CS-48 | DO NOT add Co-Authored-By at the end of the commit message | IMPERATIVE | dropped, duplicate of GIT-22 |

## consistency.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| CON-1 | You MUST maintain consistency with the existing codebase: | MUST | coding-style.md, Consistency, Follow Existing Patterns |
| CON-2 | Match established patterns and conventions, even when you would prefer a different approach | MUST | coding-style.md, Consistency, Follow Existing Patterns |
| CON-3 | Do NOT unilaterally refactor or "improve" existing patterns | MUST NOT | coding-style.md, Consistency, Follow Existing Patterns |
| CON-4 | If you believe a pattern should change, raise it with the user and wait for approval before acting | IMPERATIVE | coding-style.md, Consistency, Follow Existing Patterns |
| CON-5 | If the user approves a pattern change, apply it consistently across every site you touch in that change, not... | MUST | coding-style.md, Consistency, Follow Existing Patterns |
| CON-6 | Don't mix styles within a file or module | IMPERATIVE | coding-style.md, Consistency, Follow Existing Patterns |
| CON-7 | You SHOULD use automated tooling where available: | SHOULD | coding-style.md, Consistency, Formatters and Linters |
| CON-8 | [use automated tooling:] Code formatters | SHOULD | coding-style.md, Consistency, Formatters and Linters |
| CON-9 | [use automated tooling:] Linters | SHOULD | coding-style.md, Consistency, Formatters and Linters |
| CON-10 | [use automated tooling:] Static analysis tools | SHOULD | coding-style.md, Consistency, Formatters and Linters |
| CON-11 | [use automated tooling:] Respect existing tool configurations | SHOULD | coding-style.md, Consistency, Formatters and Linters |

## debugging.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| DBG-1 | You MUST NOT attempt any fix until both of the following are true: | MUST NOT | debugging.md, The Hard Gate |
| DBG-2 | [no fix until:] You have reproduced the bug against the current state of the code, or you have explicitly noted... | MUST NOT | debugging.md, The Hard Gate |
| DBG-3 | [no fix until:] You have identified the root cause with supporting evidence from actual code or actual program... | MUST NOT | debugging.md, The Hard Gate |
| DBG-4 | This gate applies to every bug. You MUST NOT waive it because the bug "looks simple", "is obviously a typo", or... | MUST NOT | debugging.md, The Hard Gate |
| DBG-5 | Every claim you make about what is wrong MUST be supported by actual code you have read, actual output you have... | MUST | debugging.md, Evidence Over Intuition |
| DBG-6 | Pattern-matching against an error message without reproduction is forbidden. | MUST NOT | debugging.md, Evidence Over Intuition |
| DBG-7 | "It looks like" and "I suspect" are not acceptable as the sole basis for a fix. | MUST NOT | debugging.md, Evidence Over Intuition |
| DBG-8 | If you do not have evidence for a claim, your next action is to gather evidence, not to change code. | IMPERATIVE | debugging.md, Evidence Over Intuition |
| DBG-9 | Bug fixes do not waive the rules in `workflow.md`, `testing.md`, or `verification.md`: | IMPERATIVE | debugging.md, Bug Fixes Are Still Changes |
| DBG-10 | Per `workflow.md`, a bug fix MUST have an approved design, even if the design is a single sentence describing... | MUST | debugging.md, Bug Fixes Are Still Changes (cross-reference to workflow.md, Bug Fixes, WF-31) |
| DBG-11 | Per `testing.md`, a bug fix MUST begin with a failing regression test that reproduces the bug. The test goes... | MUST | debugging.md, Bug Fixes Are Still Changes (cross-reference to testing.md, Bug Fixes, TEST-28) |
| DBG-12 | You MUST NOT fix a bug without first writing that test. | MUST NOT | debugging.md, Bug Fixes Are Still Changes (cross-reference to testing.md, Bug Fixes, TEST-28) |
| DBG-13 | Per `verification.md`, the fix is not complete until the verification gate has been run against it and the... | IMPERATIVE | debugging.md, Bug Fixes Are Still Changes (cross-reference to verification.md, The Iron Law, VER-1) |

## documentation.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| DOC-1 | You SHOULD maintain clear README documentation: | SHOULD | coding-style.md, Documentation, README Files |
| DOC-2 | Installation instructions | SHOULD | coding-style.md, Documentation, README Files |
| DOC-3 | Usage examples | SHOULD | coding-style.md, Documentation, README Files |
| DOC-4 | Architecture overview (for complex projects) | SHOULD | coding-style.md, Documentation, README Files |
| DOC-5 | Contribution guidelines | SHOULD | coding-style.md, Documentation, README Files |
| DOC-6 | You MAY provide architectural documentation for complex systems: | MAY | coding-style.md, Documentation, Architectural Documentation |
| DOC-7 | System diagrams | MAY | coding-style.md, Documentation, Architectural Documentation |
| DOC-8 | Decision records (ADRs) | MAY | coding-style.md, Documentation, Architectural Documentation |
| DOC-9 | API specifications | MAY | coding-style.md, Documentation, Architectural Documentation |
| DOC-10 | Deployment guides | MAY | coding-style.md, Documentation, Architectural Documentation |

## errors.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| ERR-1 | You SHOULD make error conditions explicit and handled: | SHOULD | coding-style.md, Error Handling, Explicit Error States |
| ERR-2 | Avoid silent failures | SHOULD | coding-style.md, Error Handling, Explicit Error States |
| ERR-3 | Use exceptions for exceptional circumstances, not control flow | SHOULD | coding-style.md, Error Handling, Explicit Error States |
| ERR-4 | Validate input at system boundaries (see `security.md` for the definition of a system boundary) | SHOULD | coding-style.md, Error Handling, Explicit Error States |
| ERR-5 | Return explicit error types (Result/Either) for operations whose failure is an expected outcome rather than a... | SHOULD | coding-style.md, Error Handling, Explicit Error States |
| ERR-6 | You MUST provide actionable error messages: | MUST | coding-style.md, Error Handling, Error Messages |
| ERR-7 | Describe what went wrong | MUST | coding-style.md, Error Handling, Error Messages |
| ERR-8 | Include relevant context (what operation was attempted) | MUST | coding-style.md, Error Handling, Error Messages |
| ERR-9 | Suggest remediation where applicable | MUST | coding-style.md, Error Handling, Error Messages |
| ERR-10 | Use British English | MUST | coding-style.md, Error Handling, Error Messages |

## git.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| GIT-1 | You MAY create commits without asking, provided they follow the rules below. | MAY | git.md, Commits Are Permitted |
| GIT-2 | You MUST use Conventional Commits: `<type>(<scope>): <description> (<TICKET-KEY>)` followed by an optional body | MUST | git.md, Commit Message Format |
| GIT-3 | Types: feat, fix, refactor, docs, test, chore, perf, ci, build, style, revert | MUST | commit-msg skill, Format (first line, types list) |
| GIT-4 | [Rules for the subject line:] Use the imperative mood (`add`, not `added` or `adds`) | IMPERATIVE | commit-msg skill, Full Commit Message Format, Subject line |
| GIT-5 | [subject line:] Lowercase after the type (`feat(ui): add colour picker (EMBER-12)`, not `feat(ui): Add colour... | IMPERATIVE | commit-msg skill, Full Commit Message Format, Subject line |
| GIT-6 | [subject line:] The scope is required and names the area changed, in lowercase. If the change spans several... | IMPERATIVE | git.md, Commit Message Format |
| GIT-7 | [subject line:] `<TICKET-KEY>` is the ticket key at the start of the current branch name (`git branch... | IMPERATIVE | git.md, Commit Message Format |
| GIT-8 | [subject line:] If the branch name carries no ticket key (for example `main` or `ai-audit`), omit the suffix. | IMPERATIVE | git.md, Commit Message Format |
| GIT-9 | Do not invent a key and do not ask. | IMPERATIVE | git.md, Commit Message Format |
| GIT-10 | [subject line:] No trailing full stop | IMPERATIVE | commit-msg skill, Full Commit Message Format, Subject line |
| GIT-11 | [subject line:] Aim for under 72 characters for the whole subject line, suffix included | IMPERATIVE to MUST (hard limit) | commit-msg skill, Format (first line, "at most 72 characters including the suffix") |
| GIT-12 | [subject line:] British English (see `language.md`) | IMPERATIVE | git.md, Commit Message Format |
| GIT-13 | [Body (optional):] Explain *why*, not *what* (the diff shows the what) | IMPERATIVE | commit-msg skill, Full Commit Message Format, Body |
| GIT-14 | [Body:] Wrap at 72 characters | IMPERATIVE | commit-msg skill, Format (optional body, "wrapped at 72 chars") |
| GIT-15 | [Body:] Reference tickets or issues where relevant | IMPERATIVE | commit-msg skill, Full Commit Message Format, Body |
| GIT-16 | You MUST NOT run `git push` (or any variant) under any circumstances. | MUST NOT | git.md, Pushes Are Forbidden, and git-guard mod (blocks every git push, including inside sh -c) |
| GIT-17 | If a workflow appears to require a push (e.g. opening a pull request), stop and tell the user what needs to... | IMPERATIVE | git.md, Pushes Are Forbidden |
| GIT-18 | You MUST NOT run destructive version control commands without explicit, specific permission from the user for... | MUST NOT | git.md, Destructive Commands Are Forbidden |
| GIT-19 | Permission for one destructive action is not permission for another. | IMPERATIVE | git.md, Destructive Commands Are Forbidden |
| GIT-20 | Destructive commands (reset --hard, reset, checkout/restore, clean -f, branch -D, rebase, amend, stash drop... | MUST NOT | split: git-guard mod (reset --hard, checkout -- and . and -f, switch -f, working-tree restore, clean -f, branch -D, stash drop and clear, tag -d, amend of a pushed commit, rebase of a branch with an upstream) and git.md, Destructive Commands Are Forbidden (the remaining commands) |
| GIT-21 | Anything else read-only or non-destructive (`git status`, `git log`, `git diff`, `git add`, `git commit`, `git... | MAY | git.md, Destructive Commands Are Forbidden |
| GIT-22 | You MUST NOT add `Co-Authored-By` lines, AI attribution lines, "Generated with", or any similar bylines to... | MUST NOT | git.md, Co-Authored-By |
| GIT-23 | Commit messages contain only the description of the change. | IMPERATIVE | git.md, Co-Authored-By |

## language.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| LANG-1 | You MUST use British English spelling and grammar in all: | MUST | language.md, British English |
| LANG-2 | [British English in:] Code comments (on the rare occasions they are permitted, see `coding-style.md`) | MUST | language.md, British English |
| LANG-3 | [British English in:] Documentation | MUST | language.md, British English |
| LANG-4 | [British English in:] Commit messages | MUST | language.md, British English |
| LANG-5 | [British English in:] Variable names and identifiers | MUST | language.md, British English |
| LANG-6 | [British English in:] User-facing strings | MUST | language.md, British English |
| LANG-7 | You MUST NOT use emojis, Unicode symbols, or special characters in: | MUST NOT | language.md, Emoji Usage |
| LANG-8 | [no emojis in:] Code or comments | MUST NOT | language.md, Emoji Usage |
| LANG-9 | [no emojis in:] Commit messages | MUST NOT | language.md, Emoji Usage |
| LANG-10 | [no emojis in:] Documentation | MUST NOT | language.md, Emoji Usage |
| LANG-11 | [no emojis in:] Communication with users | MUST NOT | language.md, Emoji Usage |
| LANG-12 | [no emojis in:] Status indicators or checkmarks | MUST NOT | language.md, Emoji Usage |
| LANG-13 | Use [PASS]/[FAIL]/[OK] instead | IMPERATIVE | language.md, Emoji Usage |
| LANG-14 | When an output style or a hook asks for a decorated insight block, you MUST write it in plain ASCII. | MUST | language.md, Emoji Usage |
| LANG-15 | Start with the line `Insight:`, | IMPERATIVE | language.md, Emoji Usage |
| LANG-16 | follow it with two or three points, | IMPERATIVE | language.md, Emoji Usage |
| LANG-17 | and end with a blank line. | IMPERATIVE | language.md, Emoji Usage |
| LANG-18 | Do not use star symbols or box-drawing characters. | IMPERATIVE | language.md, Emoji Usage |
| LANG-19 | This rule overrides the output style's formatting. | IMPERATIVE | language.md, Emoji Usage |
| LANG-20 | No em-dashes, en-dashes or double hyphens as prose punctuation | MUST NOT | language.md, Em-dashes and En-dashes |
| LANG-21 | Use a comma, a single hyphen, or a full stop instead. | IMPERATIVE | language.md, Em-dashes and En-dashes |
| LANG-22 | This rule applies to prose only. | IMPERATIVE | language.md, Em-dashes and En-dashes |
| LANG-23 | [prose-only dash rule does not apply to:] `--` in shell commands, CLI flags and option parsing | MAY | language.md, Em-dashes and En-dashes |
| LANG-24 | [does not apply to:] `--` inside code, comments that reference code, or code blocks | MAY | language.md, Em-dashes and En-dashes |
| LANG-25 | [does not apply to:] Hyphens in compound words (e.g. `self-documenting`, `well-named`) | MAY | language.md, Em-dashes and En-dashes |
| LANG-26 | You SHOULD use inclusive, professional terminology: | SHOULD | language.md, Inclusive Language |
| LANG-27 | Avoid unnecessarily gendered language | SHOULD | language.md, Inclusive Language |
| LANG-28 | Use industry-standard terms that are clear and respectful | SHOULD | language.md, Inclusive Language |
| LANG-29 | Prefer `allowlist/denylist` over `whitelist/blacklist` | SHOULD | language.md, Inclusive Language |
| LANG-30 | Prefer `main` over `master` for primary branches | SHOULD | language.md, Inclusive Language |

## performance.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| PERF-1 | You SHOULD prioritise correctness and clarity over premature optimisation: | SHOULD | coding-style.md, Performance, Premature Optimisation |
| PERF-2 | Write clear code first | SHOULD | coding-style.md, Performance, Premature Optimisation |
| PERF-3 | Measure performance before optimising and cite the measurement when you do | SHOULD | coding-style.md, Performance, Premature Optimisation |
| PERF-4 | Prefer extracting optimised logic into a well-named function (e.g. `encodeFramesUsingSIMDFastPath`) over adding... | SHOULD | dropped, duplicate of CS-17 (coding-style.md, Performance, Premature Optimisation keeps a pointer to the Default Rule section) |
| PERF-5 | Where a comment is genuinely unavoidable for an optimisation, it must meet the conditions in `coding-style.md`... | IMPERATIVE | dropped, duplicate of CS-6 (coding-style.md, Performance, Premature Optimisation keeps a pointer to the Default Rule section) |
| PERF-6 | You MUST handle resources properly: | MUST | coding-style.md, Performance, Resource Management |
| PERF-7 | Close file handles, database connections, network sockets | MUST | coding-style.md, Performance, Resource Management |
| PERF-8 | Use language-appropriate patterns (RAII, defer, using statements, context managers) | MUST | coding-style.md, Performance, Resource Management |
| PERF-9 | Avoid resource leaks | MUST | coding-style.md, Performance, Resource Management |

## prose-style.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| PROSE-1 | Existing text around your edits follows the consistency rule in `./coding-style.md`, so this file licenses no... | IMPERATIVE | prose-style.md, Scope |
| PROSE-2 | You MUST reproduce verbatim material exactly: code, identifiers, commands, file paths, quoted errors, quoted... | MUST | prose-style.md, Verbatim Material |
| PROSE-3 | An identifier, a backticked command, or a quoted string counts as one word in the sentence limits below. | IMPERATIVE | prose-style.md, Verbatim Material |
| PROSE-4 | Write `must` for a requirement, not `should`. | IMPERATIVE | prose-style.md, Modal Verbs |
| PROSE-5 | Write `can` for possibility or permission, not `may`, `might`, or `could`. | IMPERATIVE | prose-style.md, Modal Verbs |
| PROSE-6 | Restructure a hypothetical `would` as a conditional sentence. | IMPERATIVE | prose-style.md, Modal Verbs |
| PROSE-7 | Capitalised `MUST`, `SHOULD`, and `MAY` in a normative document keep their form. | IMPERATIVE | prose-style.md, Modal Verbs |
| PROSE-8 | You MUST NOT rewrite a normative `SHOULD` as `MUST`, because that changes the obligation. | MUST NOT | prose-style.md, Modal Verbs |
| PROSE-9 | An imperative sentence has at most 20 words. | IMPERATIVE | prose-style.md, Sentences |
| PROSE-10 | Any other sentence has at most 25 words. | IMPERATIVE | prose-style.md, Sentences |
| PROSE-11 | You MUST NOT join clauses with a semicolon: write two sentences. | MUST NOT | prose-style.md, Sentences |
| PROSE-12 | Use the active voice and the simple tenses. | IMPERATIVE | prose-style.md, Voice and Order |
| PROSE-13 | In an instruction, the condition or the warning stands before the command: `If the build fails, read the log.` | IMPERATIVE | prose-style.md, Voice and Order |
| PROSE-14 | Keep the articles and the conjunction `that`. | IMPERATIVE | prose-style.md, Voice and Order |
| PROSE-15 | You MUST NOT compress a sentence into telegraph style: write `Make sure that the file exists`, not `Ensure file... | MUST NOT | prose-style.md, Voice and Order |
| PROSE-16 | Within one document, use one name for one thing and one verb for one action. | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-17 | Pick one term from a set such as `check`/`verify`/`confirm`, `config`/`settings`, or `error`/`failure`, and... | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-18 | Write `use` not `leverage`, `to` not `in order to`, `before` not `prior to`, and `because` not `due to the fact... | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-19 | Write `if` not `in the event that`, `you can` not `enables you to`, `by default` not `out of the box`, and... | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-20 | Write `for example` not `e.g.`, `that is` not `i.e.`, and `many` not `plethora`. | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-21 | Name the items instead of `etc.` | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-22 | Delete filler and intensifiers such as `simply`, `robust`, `seamlessly`, and `it is worth noting that`, or... | IMPERATIVE | prose-style.md, Vocabulary |
| PROSE-23 | Prefer plain language wherever it carries the intent. | IMPERATIVE | prose-style.md, Technical Language |
| PROSE-24 | Where only a technical term states the meaning precisely, use it. | IMPERATIVE | prose-style.md, Technical Language |
| PROSE-25 | Explain each technical term at its first use. | IMPERATIVE | prose-style.md, Technical Language |
| PROSE-26 | Expand each acronym at its first use: `continuous integration (CI)`. | IMPERATIVE | prose-style.md, Technical Language |

## security.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| SEC-1 | You MUST validate and sanitise external input: | MUST | coding-style.md, Security, Input Validation |
| SEC-2 | Never trust user input | MUST | coding-style.md, Security, Input Validation |
| SEC-3 | Validate at system boundaries | MUST | coding-style.md, Security, Input Validation |
| SEC-4 | Use parameterised queries for database access | MUST | coding-style.md, Security, Input Validation |
| SEC-5 | Encode output appropriately for context | MUST | coding-style.md, Security, Input Validation |
| SEC-6 | You MUST NOT commit sensitive data: | MUST NOT | coding-style.md, Security, Sensitive Data |
| SEC-7 | You MUST point out to the user if there is potential to commit sensitive data: | MUST | coding-style.md, Security, Sensitive Data |
| SEC-8 | [sensitive data:] Credentials, API keys, tokens | MUST NOT | coding-style.md, Security, Sensitive Data |
| SEC-9 | [sensitive data:] Personal or confidential information | MUST NOT | coding-style.md, Security, Sensitive Data |
| SEC-10 | Use environment variables or secure secret management | IMPERATIVE | coding-style.md, Security, Sensitive Data |

## skills-policy.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| SP-1 | You MUST use skills when they are available and relevant to the task at hand. | MUST | skills-policy.md, Mandatory Skill Usage |
| SP-2 | If a skill exists that matches your current task, you MUST invoke it via the Skill tool before proceeding with... | MUST | skills-policy.md, Mandatory Skill Usage |
| SP-3 | You MUST check the available skill list before beginning any task. | MUST | skills-policy.md, Skill Discovery |
| SP-4 | If you are unsure whether a relevant skill exists, the default is to check, not to assume. | IMPERATIVE | skills-policy.md, Skill Discovery |
| SP-5 | You MUST NOT proceed with a manual approach when a skill covers the same workflow. | MUST NOT | skills-policy.md, Skill Discovery |
| SP-6 | You MUST invoke skills via the Skill tool. | MUST | skills-policy.md, Invoking Skills |
| SP-7 | You MUST NOT use the Read tool to open a skill file. | MUST NOT | skills-policy.md, Invoking Skills |
| SP-8 | Once a skill is invoked, you need not re-invoke it for the same task | MAY | skills-policy.md, Invoking Skills |
| SP-9 | [You MUST perform the skill check before any of:] Asking the user a clarifying question | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-10 | [skill check before:] Reading project files to build context | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-11 | [skill check before:] Exploring the codebase with Grep or Glob | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-12 | [skill check before:] Proposing a plan or approach | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-13 | [skill check before:] Writing any code or editing any file | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-14 | [skill check before:] Dispatching a subagent | MUST | skills-policy.md, Skill Check Comes Before Everything |
| SP-15 | "Let me gather context first" is not an exemption from the skill check | IMPERATIVE | skills-policy.md, Skill Check Comes Before Everything |
| SP-16 | [invoke in this order:] Entry skills first: `brainstorming` (before any code edit, unless the short path in... | MUST | skills-policy.md, Skill Priority |
| SP-17 | [invoke in this order:] Process skills second: `complexity-triage`, `verification-before-completion`. | MUST | skills-policy.md, Skill Priority |
| SP-18 | [invoke in this order:] Implementation skills third: `subagent-driven-development`, `fast-path-implementation`... | MUST | skills-policy.md, Skill Priority |
| SP-19 | [invoke in this order:] Review skills fourth: `requesting-code-review`, `receiving-code-review`. These run... | MUST | skills-policy.md, Skill Priority |
| SP-20 | [Specific mandatory pairings:] Before any code edit: `brainstorming`, unless the short path in `workflow.md`... | MUST | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-21 | You MUST NOT rationalise your way out of invoking the router by deciding the work is "obvious", "small", or... | MUST NOT | dropped, duplicate of WF-10 |
| SP-22 | The user picks the mode, you do not pick on their behalf. | IMPERATIVE | dropped, duplicate of WF-9 |
| SP-23 | [pairings:] Before writing implementation code for a feature or non-trivial change: `test-driven-development`. | MUST | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-24 | The only exemptions are the ones in the "When TDD Applies" section of `testing.md`. | IMPERATIVE | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-25 | [pairings:] Before any debugging or fix work: `debugging`, the hard gate applies with or without the skill | MUST | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-26 | [pairings:] Before claiming work is complete: `requesting-code-review` followed by... | MUST | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-27 | In orchestrated work, do not invoke `requesting-code-review` again after `subagent-driven-development` has | IMPERATIVE | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-28 | [pairings:] Before asserting that something passes, works, or is ready: `verification-before-completion`. | MUST | skills-policy.md, Skill Priority, mandatory pairings list |
| SP-29 | [resolve conflicts in this order, highest first:] The user's explicit instructions in the current conversation... | MUST | skills-policy.md, Instruction Priority |
| SP-30 | [resolve in this order:] Rules and skills in this repository (`rules/common/*.md`, `rules/<lang>/*.md`, and... | MUST | skills-policy.md, Instruction Priority |
| SP-31 | [resolve in this order:] Default system behaviour | MUST | skills-policy.md, Instruction Priority |
| SP-32 | You MUST NOT invoke a skill to override an explicit user instruction. | MUST NOT | skills-policy.md, Instruction Priority |
| SP-33 | This does not mean a casual phrasing like "just add X" overrides workflow skills. | IMPERATIVE | skills-policy.md, Instruction Priority |
| SP-34 | Only an explicit, scoped opt-out from the user waives a workflow skill | IMPERATIVE | skills-policy.md, Instruction Priority |
| SP-35 | and you MUST confirm the opt-out before acting on it. | MUST | skills-policy.md, Instruction Priority |
| SP-36 | The short path in `workflow.md` is a separate waiver of the router only, and the user still approves the change... | IMPERATIVE | skills-policy.md, Instruction Priority |
| SP-37 | Subagents dispatched for a specific task MUST NOT run the skill-discovery scan on their dispatch prompt. | MUST NOT | skills-policy.md, Subagent Exemption |
| SP-38 | Subagents execute the task they were dispatched with, using the context, constraints, and procedures the... | IMPERATIVE | skills-policy.md, Subagent Exemption |
| SP-39 | If a subagent dispatch prompt directly instructs the subagent to use a specific skill, the subagent MUST invoke... | MUST | skills-policy.md, Subagent Exemption |
| SP-40 | Otherwise, the subagent proceeds with the task as given. | IMPERATIVE | skills-policy.md, Subagent Exemption |

## subagents.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| SUB-1 | You MUST NOT let a subagent inherit your session history. | MUST NOT | subagents.md, Context Isolation |
| SUB-2 | Every dispatch starts from a clean slate. | IMPERATIVE | subagents.md, Context Isolation |
| SUB-3 | You MUST construct exactly the context the subagent needs: the task description, the relevant files or file... | MUST | subagents.md, Context Isolation |
| SUB-4 | Do not assume the subagent knows anything you have not told it in the dispatch. | IMPERATIVE | subagents.md, Context Isolation |
| SUB-5 | You MUST NOT instruct a subagent to "discover" context on its own when you can provide it directly. | MUST NOT | subagents.md, Context Isolation |
| SUB-6 | Subagents MUST NOT commit, push, create branches, or perform any destructive git operation. | MUST NOT | subagents.md, Git Operations |
| SUB-7 | Subagents implement, test, and report back, the orchestrator decides when to commit based on the user's upfront... | IMPERATIVE | subagents.md, Git Operations |
| SUB-8 | You MUST NOT use `isolation: "worktree"` on any subagent dispatched from a user-authored skill. | MUST NOT | subagents.md, Worktrees |
| SUB-9 | Subagents MUST NOT use `sudo` or any elevated-privilege command. | MUST NOT | subagents.md, Privilege |
| SUB-10 | If a task requires elevation, the orchestrator surfaces it to the human partner. | IMPERATIVE | subagents.md, Privilege |
| SUB-11 | You MUST NOT write a model identifier you have not confirmed the current environment exposes. | MUST NOT | subagents.md, Model Identifiers |
| SUB-12 | You MUST NOT accept a subagent's report of success as evidence. | MUST NOT | subagents.md, Verifying Subagent Reports |
| SUB-13 | Read the changes and run the proving command yourself in the current message before you claim the task is done. | IMPERATIVE | subagents.md, Verifying Subagent Reports |

## testing.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| TEST-1 | Test names describe the expected behaviour in complete phrases (`user authentication fails when password is... | IMPERATIVE | testing.md, Test Quality |
| TEST-2 | Each test exercises exactly one behaviour, if the name needs the word "and", split it. | IMPERATIVE | testing.md, Test Quality |
| TEST-3 | Tests MUST be deterministic | MUST | testing.md, Test Quality |
| TEST-4 | A flaky test is broken and gets fixed, unless removal is allowed | IMPERATIVE | testing.md, Test Quality |
| TEST-5 | You MUST NOT mock the code under test, pure functions, or internal collaborators you can drive with real data. | MUST NOT | testing.md, Test Quality |
| TEST-6 | Mocks are permitted only at true system boundaries: network, filesystem beyond a temp dir, clocks, randomness. | MAY | testing.md, Test Quality |
| TEST-7 | if you cannot name the defect an assertion would catch, narrow or drop it. | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-8 | Assert the specific behaviour the name promises, never incidental structure | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-9 | no collection-size assertions unless the behaviour is about the count | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-10 | no full-object or snapshot equality unless it is about the object's complete shape. | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-11 | A test MUST NOT fail because unrelated code changed. | MUST NOT | testing.md, Meaningful Assertions |
| TEST-12 | A test earns its place only when it catches a defect that no other test catches. | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-13 | Remove a test only if another test fails on the same defect or it can fail on no defect | MAY | testing.md, Meaningful Assertions |
| TEST-14 | Never remove the last test that can catch a defect in a behaviour. | IMPERATIVE | testing.md, Meaningful Assertions |
| TEST-15 | No production code without a failing test first. | MUST NOT | testing.md, Test-Driven Development, The Iron Law |
| TEST-16 | You MUST write the test before the production code and watch it fail before writing the code that makes it pass | MUST | testing.md, Test-Driven Development, The Iron Law |
| TEST-17 | If production code precedes its test, stash it, watch the test fail, then restore it | IMPERATIVE | testing.md, Test-Driven Development, The Iron Law |
| TEST-18 | Write that test from the behaviour the change should have, not from the shape of the code you already wrote | IMPERATIVE | testing.md, Test-Driven Development, The Iron Law |
| TEST-19 | Code whose test has never been observed failing MUST NOT be presented as complete | MUST NOT | testing.md, Test-Driven Development, The Iron Law |
| TEST-20 | [When TDD Applies] New features, bug fixes, and any change whose behaviour is externally visible. | IMPERATIVE | testing.md, Test-Driven Development, When TDD Applies |
| TEST-21 | You MAY skip TDD in exactly two cases, and this rule grants no others. | MAY | testing.md, Test-Driven Development, When TDD Applies |
| TEST-22 | The first is throwaway prototypes, generated code, or configuration files, which additionally requires explicit... | MAY | testing.md, Test-Driven Development, When TDD Applies |
| TEST-23 | [MAY skip TDD:] Files with no project test framework and a defined proving command | MAY | testing.md, Test-Driven Development, When TDD Applies |
| TEST-24 | A waiver from the human partner overrides the rule and is governed by `workflow.md` | IMPERATIVE | testing.md, Test-Driven Development, When TDD Applies |
| TEST-25 | Every RED step ends with the test run and failing for the expected reason: a test that errors, or passes on its... | IMPERATIVE | testing.md, Test-Driven Development, RED and GREEN Are Verified |
| TEST-26 | Every GREEN step ends with the test passing, no other tests broken, and pristine output. | IMPERATIVE | testing.md, Test-Driven Development, RED and GREEN Are Verified |
| TEST-27 | During GREEN, write only the minimal code the test requires (the YAGNI rule in `coding-style.md`). | IMPERATIVE | testing.md, Test-Driven Development, RED and GREEN Are Verified |
| TEST-28 | You MUST NOT fix a bug without first writing a failing test that reproduces it. | MUST NOT | testing.md, Test-Driven Development, Bug Fixes |

## verification.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| VER-1 | You MUST NOT claim work is complete, fixed, passing, working, or ready without fresh verification evidence... | MUST NOT | verification.md, The Iron Law |
| VER-2 | A run from a previous message, a previous task, or before your most recent edit does not count. | IMPERATIVE | verification.md, The Iron Law |
| VER-3 | Your belief that the command would pass is not evidence. | IMPERATIVE | verification.md, The Iron Law |
| VER-4 | If you have not run the verification command in the current message, you MUST NOT state or imply that the work... | MUST NOT | verification.md, The Iron Law |
| VER-5 | This rule applies to every statement that asserts or implies success, including but not limited to: | IMPERATIVE | verification.md, Scope: What Counts as a Completion Claim |
| VER-6 | Completion claims include direct, satisfaction, hedged and implicit claims and paraphrases | IMPERATIVE | verification.md, Scope: What Counts as a Completion Claim |
| VER-7 | You MUST NOT evade this rule by choosing different wording. | MUST NOT | verification.md, Scope: What Counts as a Completion Claim |
| VER-8 | Spirit over letter. If the reader could take your message to mean the work is done, the rule applies. | IMPERATIVE | verification.md, Scope: What Counts as a Completion Claim |
| VER-9 | [You MUST run fresh verification before any of:] Committing, pushing, opening, or updating a pull request | MUST | verification.md, When the Rule Fires |
| VER-10 | [run fresh verification before:] Claiming a task, subtask, or todo is complete | MUST | verification.md, When the Rule Fires |
| VER-11 | [run fresh verification before:] Moving on to the next task in a sequence | MUST | verification.md, When the Rule Fires |
| VER-12 | [run fresh verification before:] Handing control back to the human partner with any implication of success | MUST | verification.md, When the Rule Fires |
| VER-13 | [run fresh verification before:] Accepting a subagent's report that it succeeded (see `subagents.md`: trust... | MUST | verification.md, When the Rule Fires |
| VER-14 | [run fresh verification before:] Stating that a bug is fixed, a regression is closed, or a requirement is met | MUST | verification.md, When the Rule Fires |

## workflow.md

| ID | Obligation | Strength | Now in |
|----|------------|----------|--------|
| WF-1 | You MUST NOT write production code, scaffold a project, invoke an implementation skill, or take any... | MUST NOT | workflow.md, Design Before Implementation |
| WF-2 | This applies regardless of perceived simplicity | IMPERATIVE | workflow.md, Design Before Implementation |
| WF-3 | Every change needs a design. | IMPERATIVE | workflow.md, Design Before Implementation |
| WF-4 | Trivial changes get trivial designs, such as the short path statement, but the user still approves them. | IMPERATIVE | workflow.md, Design Before Implementation |
| WF-5 | You MUST NOT rely on a design state that exists only in your own context without the user having seen and... | MUST NOT | workflow.md, Design Before Implementation |
| WF-6 | Unless the short path below applies, you MUST invoke it [the `brainstorming` skill] before any code edit... | MUST | workflow.md, The Brainstorming Router Is the Design Step |
| WF-7 | [Unless the short path applies, you MUST NOT bypass the router by:] Designing in your own context and... | MUST NOT | workflow.md, The Brainstorming Router Is the Design Step |
| WF-8 | [bypass the router by:] Entering plan mode manually instead of through the router | MUST NOT | workflow.md, The Brainstorming Router Is the Design Step |
| WF-9 | [bypass the router by:] Picking `brainstorming-skip` on the user's behalf, the user picks the mode, the router asks | MUST NOT | workflow.md, The Brainstorming Router Is the Design Step |
| WF-10 | [bypass the router by:] Deciding the work is "too small" or "obvious" to need the router when the short path... | MUST NOT | workflow.md, The Brainstorming Router Is the Design Step |
| WF-11 | You can skip the router when all three criteria hold. | MAY | workflow.md, The Short Path for Small Changes |
| WF-12 | Verify the short path criteria against code that you have read | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-13 | [skip the router when:] The change is fully determined: one correct edit exists and no design decision remains. | MAY | workflow.md, The Short Path for Small Changes |
| WF-14 | [skip the router when:] The change adds no new surface and changes nothing a caller observes | MAY | workflow.md, The Short Path for Small Changes |
| WF-15 | [skip the router when:] A reader can take in the change at a glance: one file and about five lines at most. | MAY | workflow.md, The Short Path for Small Changes |
| WF-16 | State the change in one or two sentences that name the file and the edit. | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-17 | Then wait for explicit approval before you edit. | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-18 | Use no skill and no plan mode for the design step. | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-19 | If any short path criterion fails, or you have any doubt, you MUST use the router | MUST | workflow.md, The Short Path for Small Changes |
| WF-20 | Bug fixes always go through the router. | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-21 | Test-driven development, verification, review, and the debugging gate still apply as the rules require. | IMPERATIVE | workflow.md, The Short Path for Small Changes |
| WF-22 | [Approved design:] A design produced by the `brainstorming` router (any of its modes: standard, committee, or... | IMPERATIVE | workflow.md, What Counts as an Approved Design |
| WF-23 | [Approved design:] An epic or ticket containing a design that the user has written or previously approved | IMPERATIVE | workflow.md, What Counts as an Approved Design |
| WF-24 | [Approved design:] A specification committed to the repository that the user has pointed to as the source of... | IMPERATIVE | workflow.md, What Counts as an Approved Design |
| WF-25 | [Approved design:] A short path statement of the change that the user has explicitly approved | IMPERATIVE | workflow.md, What Counts as an Approved Design |
| WF-26 | [Does not count as approved:] A design you proposed but the user has not responded to | IMPERATIVE | workflow.md, What Does Not Count |
| WF-27 | [Does not count:] A design the user said "it looks fine" to without reviewing specifics | IMPERATIVE | workflow.md, What Does Not Count |
| WF-28 | [Does not count:] Your own interpretation of the user's request that you have not surfaced and confirmed... | IMPERATIVE | workflow.md, What Does Not Count |
| WF-29 | [Does not count:] "Obvious" implementations where you skipped the router because the work felt small, unless an... | IMPERATIVE | workflow.md, What Does Not Count |
| WF-30 | [Does not count:] A plan you put in the conversation without entering plan mode through the router, other than... | IMPERATIVE | workflow.md, What Does Not Count |
| WF-31 | Bug fixes also require an approved design, even if the design is a single sentence. | IMPERATIVE | workflow.md, Bug Fixes |
| WF-32 | At minimum, present the failing-test reproduction approach and which function or module will change, and get... | IMPERATIVE | workflow.md, Bug Fixes |
| WF-33 | Bug fixes never use the short path. | IMPERATIVE | workflow.md, Bug Fixes |
| WF-34 | The rules in `testing.md` still apply: the failing test comes before the fix. | IMPERATIVE | workflow.md, Bug Fixes |
| WF-35 | When a task involves multiple changes, you MUST complete them in the order the design specifies. | MUST | workflow.md, Sequencing Work |
| WF-36 | If the design does not specify an order, foundations and dependencies come first, features next, integration... | IMPERATIVE | workflow.md, Sequencing Work |
| WF-37 | You MUST NOT reorder tasks to make progress look faster or to avoid a harder task. | MUST NOT | workflow.md, Sequencing Work |
| WF-38 | [You MUST stop and consult your human partner when:] The design turns out to be wrong once implementation begins | MUST | workflow.md, Stopping Conditions |
| WF-39 | [stop and consult when:] A subagent reports it is blocked in a way that changes the scope of the work | MUST | workflow.md, Stopping Conditions |
| WF-40 | [stop and consult when:] Verification fails in a way that suggests the design, not just the implementation, is... | MUST | workflow.md, Stopping Conditions |
| WF-41 | [stop and consult when:] You find yourself about to bypass any rule in these instructions | MUST | workflow.md, Stopping Conditions |
| WF-42 | "I will just do this small thing first and tell them after" is not an acceptable response to any of the above. | IMPERATIVE | workflow.md, Stopping Conditions |
| WF-43 | Stop, report, wait for instructions. | IMPERATIVE | workflow.md, Stopping Conditions |

## Changed strength

| ID | Before | After | Reason |
|----|--------|-------|--------|
| GIT-11 | IMPERATIVE ("Aim for under 72 characters") | MUST ("at most 72 characters including the suffix") | The user decided that the subject line limit is a hard limit, and the commit-msg skill now states it as one. |

## Not found

None. Every row has a destination that was confirmed by reading the current files.
