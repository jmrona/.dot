# git-guard

This mod stops the model and its subagents from pushing and from adding a Co-Authored-By trailer to commits. It enforces `rules/common/git.md`.

## Where it acts

It acts in every repository. It does no Ember detection.

## What it hooks

It guards `tool.call` for `Bash`. The mod splits each command into segments on `&&`, `||`, `;`, `|` and newlines. It then looks for a `git` word anywhere in each segment, followed by any options and then `push` or `commit`. Wrappers such as `sudo` and subshells such as `(git push)` are caught. A quoted mention of `git push` can be denied too, because false positives are safe.

- A segment that runs `git push` in any form is denied. This includes `git -C <dir> push` and `git push --force`.
- A `git commit` whose command holds `Co-Authored-By`, in any letter case, is denied. This covers `-m` text and heredocs.
- Every other command passes through unchanged.

If the hook itself fails, the guard denies the call.

## Known limits

- Matching is best effort. A push built through a shell variable, a script or an alias is not caught.
- Your own `!` commands do not pass through `tool.call`, so the guard stops only the model and its subagents.

## Tests

Run `claude plugin test .claude/mods/git-guard` from the `.dot` repository root.

## Turning it off

Remove the mod path from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
