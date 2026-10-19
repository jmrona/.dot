# Language and Communication

## British English

You **MUST** use British English spelling and grammar in all:

- Code comments (on the rare occasions they are permitted, see `coding-style.md`)
- Documentation
- Commit messages
- Variable names and identifiers
- User-facing strings

Examples:

- `colour` not `color`
- `initialise` not `initialize`
- `behaviour` not `behavior`
- `organise` not `organize`

## Emoji Usage

You MUST NOT use emojis, Unicode symbols, or special characters in:

- Code or comments
- Commit messages
- Documentation
- Communication with users
- Status indicators or checkmarks (use [PASS]/[FAIL]/[OK] instead)

When an output style or a hook asks for a decorated insight block, you **MUST** write it in plain ASCII. Start with the line `Insight:`, follow it with two or three points, and end with a blank line. Do not use star symbols or box-drawing characters. This rule overrides the output style's formatting.

## Em-dashes and En-dashes

You **MUST NOT** use em-dashes (`—`), en-dashes (`–`), or double-hyphens (`--`) as prose punctuation in documentation, commit messages, or user-facing text. Use a comma, a single hyphen, or a full stop instead.

This rule applies to prose only. It does **not** apply to:

- `--` in shell commands, CLI flags, or option parsing (e.g. `--help`, `git commit --amend`)
- `--` inside code, comments that reference code, or code blocks
- Hyphens in compound words (e.g. `self-documenting`, `well-named`)

## Inclusive Language

You **SHOULD** use inclusive, professional terminology:

- Avoid unnecessarily gendered language
- Use industry-standard terms that are clear and respectful
- Prefer `allowlist/denylist` over `whitelist/blacklist`
- Prefer `main` over `master` for primary branches
