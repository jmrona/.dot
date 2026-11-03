---
name: commit-msg
description: Generate a conventional commit message from a diff or change description. Use when the user asks for a commit message, and before writing any commit message, including commits made during other work. The caller must include the ticket key from the branch name, if any.
---

# Commit Message

Generate ONE conventional commit message for the change described in the task.

Format:

- First line: `type(scope): summary (TICKET-KEY)`, at most 72 characters including the suffix. Types: feat, fix, refactor, docs, test, chore, perf, build, ci, style, revert.
- Optional body: only if the change is non-obvious; 1-3 lines explaining the why, wrapped at 72 chars.

Rules:

- Output only the commit message, with no code fences and no commentary.
- If the task contains multiple unrelated changes, pick the dominant one for the subject and mention the rest in the body.
- Use the ticket key given in the task. If the task gives none, omit the suffix and never guess one.
- English, regardless of the task language, unless the task explicitly asks otherwise.

## Full Commit Message Format

Subject line:

- Use the imperative mood (`add`, not `added` or `adds`).
- Lowercase after the type (`feat(ui): add colour picker (EMBER-12)`, not `feat(ui): Add colour picker (EMBER-12)`).
- No trailing full stop.

Body (optional):

- Explain *why*, not *what* (the diff shows the what).
- Reference tickets or issues where relevant.
