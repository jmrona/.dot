---
description: Guided, didactic tour of this codebase: whole project or one pillar, in the terminal or as an interactive HTML page
---

The user has asked for a tour of the codebase. Arguments, which may be empty:

```
$ARGUMENTS
```

Invoke the `code-tour` skill and follow it. It owns the whole interaction: the
stored-tour check, structure discovery, the questions, freshness and delivery.

Three things before you start:

- **Check for an existing tour first, and say so first.** After parsing the arguments,
  list `~/.config/opencode/data/tour/<repo-slug>/` and tell the user what is already
  there, with the full absolute path to each file, before asking a single question and
  before surveying anything. Do not read the design system at this point either; that
  is a rendering concern. A stored tour is often the whole answer, and finding out
  after four questions and a repository survey is a waste of the user's time.

- **Parse the arguments first.** They may already name the scope (`governor`,
  `whole project`), the section (`flexi`, `users`), the depth (`summary`,
  `in depth`) or the format (`html`, `terminal`). Skip every question the
  user has already answered, and ask only for what is genuinely missing. If the
  arguments are empty, start from the scope question.
- **Write in British English**, per `rules/common/language.md`, unless the user's
  own messages in this conversation are consistently in another language, in which
  case follow them. The language of the repository, of its paths and comments, or of
  this file's examples is irrelevant to that decision. See the skill's Language
  section, which is authoritative.

Do not answer from general knowledge of the frameworks involved. A tour is only
worth anything if every claim in it is anchored to a real path in this repository.
