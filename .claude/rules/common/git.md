# Version Control

## Commits Are Permitted

You **MAY** create commits without asking, provided they follow the rules below. You do **not** need to request permission for each commit.

## Commit Message Format

You **MUST** use Conventional Commits: `<type>(<scope>): <description> (<TICKET-KEY>)`.

The scope is required and names the changed area in lowercase. If the change spans several areas, use the dominant one.

`<TICKET-KEY>` is the ticket key at the start of the current branch name (`git branch --show-current`). For example, branch `VAN3-388-fix-tabs` gives `(VAN3-388)`.

If the branch name carries no ticket key, omit the suffix. Do not invent a key and do not ask.

Write commit messages in British English (see `language.md`).

Before you write any commit message, invoke the `commit-msg` skill, which holds the full format.

## Pushes Are Forbidden

You **MUST NOT** run `git push` (or any variant) under any circumstances. The user will push when they are ready. If a workflow appears to require a push (e.g. opening a pull request), stop and tell the user what needs to happen next.

## Destructive Commands Are Forbidden

You **MUST NOT** run destructive version control commands without explicit, specific permission from the user for that exact action. Permission for one destructive action is not permission for another.

The `block-git-commands.mjs` hook blocks `git reset --hard`, `git clean -f`, `git checkout .`, `git restore .`, `git branch -D` and `git rebase`. If you need one of them, ask the user to run it.

**Destructive commands** the hook does not block include but are not limited to:

- `git reset` onto a different branch, without `--hard`
- `git checkout -- <file>` / `git restore <file>` that discards working-tree changes
- `git commit --amend` on commits that have already been pushed
- `git stash drop` / `git stash clear`
- `git tag -d` of pushed tags
- Any `rm` or file deletion of tracked files intended as part of version control

Anything else read-only or non-destructive (`git status`, `git log`, `git diff`, `git add`, `git commit`, `git fetch`, `git switch <existing-branch>`, `git stash push`) is permitted as part of workflows the user has asked you to perform.

## Co-Authored-By

You **MUST NOT** add `Co-Authored-By` lines, AI attribution lines, "Generated with", or any similar bylines to commit messages. Commit messages contain only the description of the change.
