# Language and Communication

## British English

You **MUST** use British English spelling and grammar in code comments (see `coding-style.md`), documentation, commit messages, identifiers, and user-facing strings. Examples: `colour`, `initialise`, `behaviour`.

## Emoji Usage

You MUST NOT use emojis, Unicode symbols, or special characters in code, comments, commit messages, documentation, or communication with users. For status indicators and checkmarks, use [PASS]/[FAIL]/[OK].

If an output style or a hook asks for a decorated insight block, you **MUST** write it in plain ASCII. Start with the line `Insight:`, follow it with two or three points, and end with a blank line. Do not use star symbols or box-drawing characters. This rule overrides the output style's formatting.

## Em-dashes and En-dashes

You **MUST NOT** use em-dashes (`—`), en-dashes (`–`), or double-hyphens (`--`) as prose punctuation in documentation, commit messages, or user-facing text. Use a comma, a single hyphen, or a full stop instead.

This rule applies to prose only. It does **not** apply to `--` in shell commands, CLI flags, code, or comments that reference code. It does not apply to hyphens in compound words such as `self-documenting`.

## Inclusive Language

You **SHOULD** use inclusive, professional terminology:

- Avoid unnecessarily gendered language
- Use industry-standard terms that are clear and respectful
- Prefer `allowlist/denylist` over `whitelist/blacklist`
- Prefer `main` over `master` for primary branches
