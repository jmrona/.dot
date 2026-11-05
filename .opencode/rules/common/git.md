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

## Worktrees

If the repository's justfile has a `worktree-create` recipe, you **MUST** create worktrees with `just worktree-create <branch> [--create|--pull] --path <parent>/<repo>-worktrees/<branch>`. `<repo>` is the folder name of the main checkout, and `<parent>` is the absolute path of the folder that contains it. You **MUST** pass an absolute path, because the recipe resolves a relative path from the checkout that runs it. From a worktree, a relative path nests the new worktree inside the current one. Run `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"` from any worktree to print the main checkout, then take `<parent>` and `<repo>` from it. Remove worktrees with `just worktree-drop <branch>`. You **MUST NOT** run `git worktree add` followed by a manual setup.

The recipe copies the environment files and installs the dependencies that a manual `git worktree add` leaves out.

## Destructive Commands Are Forbidden

You **MUST NOT** run destructive version control commands without explicit, specific permission from the user for that exact action. Permission for one destructive action is not permission for another.

**Destructive commands** include but are not limited to:

- `git reset --hard` and `git reset` onto a different branch
- `git checkout -- <file>` / `git restore` that discards working-tree changes
- `git clean -f` / `-fd` / `-fx`
- `git branch -D` (force delete)
- `git rebase` of commits that have already been pushed
- `git commit --amend` on commits that have already been pushed
- `git stash drop` / `git stash clear`
- `git tag -d` of pushed tags
- Any `rm` or file deletion of tracked files intended as part of version control

Anything else read-only or non-destructive (`git status`, `git log`, `git diff`, `git add`, `git commit`, `git fetch`, `git switch <existing-branch>`, `git stash push`) is permitted as part of workflows the user has asked you to perform.

## Co-Authored-By

You **MUST NOT** add `Co-Authored-By` lines, AI attribution lines, "Generated with", or any similar bylines to commit messages. Commit messages contain only the description of the change.
