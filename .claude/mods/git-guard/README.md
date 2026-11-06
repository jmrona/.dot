# git-guard

This mod stops the model and its subagents from breaking the rules in `rules/common/git.md`. It refuses pushes, destructive git commands, badly formatted commit messages and commits of secret files.

## Where it acts

It acts in every repository. It does no Ember detection.

## What it hooks

It guards `tool.call` for `Bash`. The mod splits each command into segments on `&&`, `||`, `;`, `|`, `|&`, a lone `&` and newlines. It then looks for a `git` word anywhere in each segment, followed by any options and then the subcommand. Wrappers such as `sudo` and subshells such as `(git push)` are caught. Before matching, it removes quoted text and backslash-escaped characters, so options such as `-c user.name="A B"` and `-C my\ dir` do not hide the subcommand. It also checks the quoted argument of `sh -c`, `bash -c` and `zsh -c` as a command of its own, including nested ones.

## What it denies

- `git push` in any form, including `git -C <dir> push` and `git push --force`.
- A `git commit` whose command holds `Co-Authored-By`, in any letter case. This covers `-m` text and heredocs.
- Destructive commands: `git reset --hard`, `git checkout -- <file>`, `git checkout .`, `git checkout -f`, `git switch -f`, `git switch --force`, `git switch --discard-changes`, `git restore` that touches the working tree, `git clean -f`, `git branch -D` (and `--delete --force`), `git stash drop`, `git stash clear` and `git tag -d`.
- An amend (`git commit --amend`) of a commit that the upstream branch already contains.
- A `git rebase` of a branch that has an upstream. The `--continue`, `--abort`, `--skip` and `--quit` forms pass.
- A commit message that breaks the Conventional Commits format.
- A commit that includes a secret file.

Every other command passes through unchanged. If the hook itself fails, the guard denies the call. The mod has no slash commands and keeps no state.

### Destructive denials

A destructive denial tells the model to ask you. It also tells the model to hand you the command, so that you can run it yourself with `! <command>`. The mod does not print the command itself.

### Commit message format

The guard checks every `-m` or `--message` text, including heredocs in `$(cat <<'EOF' ... EOF)`. The subject must follow these rules:

- It starts with a type: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style` or `revert`.
- It has a lowercase scope in brackets, then `: ` and a description that starts in lowercase.
- It does not end with a full stop.
- It ends with the ticket key in brackets when the branch name starts with a ticket key. For branch `FEAT-1-fix-tabs`, the suffix is `(FEAT-1)`.
- It takes no suffix when the branch name has no ticket key, such as `main`.
- Subjects that start with `Merge ` skip the subject-shape checks. The dash and emoji check still applies.

The whole message must not contain em-dashes, en-dashes or emojis. The guard denies a message whose text starts with a shell expansion. Examples are `$VAR`, `$'...'` and `$(...)` other than the heredoc. The denial gives its own reason.

### Secret files

When a command runs `git commit`, the guard collects the paths that the commit can include. This covers the staged paths and the paths that the command line names, with or without `--`. It skips message and value-flag arguments and redirect targets. It denies the commit if any file name is one of these:

- `.env`, or `.env.` followed by a suffix such as `.env.local`.
- A key file ending in `.pem`, `.key`, `.p12` or `.pfx`.
- `id_rsa` or `id_ed25519`.

The templates `.env.example`, `.env.sample`, `.env.dist` and `.env.template` pass. The denial lists the names that matched and says how to unstage them.

## Order of checks

The first denial wins. The guard checks in this order:

1. Push.
2. Destructive commands.
3. Amend of a pushed commit and rebase of a pushed branch.
4. Secret files at commit.
5. Commit message format.
6. Co-Authored-By.

## Git queries it runs

The guard runs most git checks in the session directory. It runs a query only when the command needs it.

- `git rev-parse --abbrev-ref @{u}` for a rebase, to find out whether the branch has an upstream.
- `git merge-base --is-ancestor HEAD @{u}` for an amend, to find out whether the upstream contains HEAD.
- `git diff --cached --name-only -z` for a commit, to list the staged paths.
- `git diff --name-only -z` for `git commit -a`, to list the unstaged tracked paths.
- `git status --porcelain -z --untracked-files=all` when the command also runs `git add`, to list the paths that the add can stage.
- `git branch --show-current` for a commit with a message, to read the ticket key. It runs in the directory that the `-C` options of the commit name, only when every command in the Bash call is a plain git command with no `GIT_` variable, `--git-dir`, `--work-tree`, backslash, backtick, `$`, bracket or brace outside quotes. Otherwise, and when a query fails or finds no branch, it runs in the session directory.

A command that is not git runs no git process.

## Known limits

- The guard matches on a best-effort basis: it does not catch a command built through a shell variable, a script or an alias.
- The guard checks `sh -c`, `bash -c` and `zsh -c` arguments, but `git reset "--hard"` still passes because it removes quoted text before matching.
- The guard does not check a `-c` argument that is built from a variable, an expansion or `eval`.
- The secret-file and amend checks run in the session directory, so they check `git -C other commit` against the session repository.
- The guard does not see a `cd` made in an earlier Bash call.
- A commit in another worktree must be a plain `git -C <dir> commit`, optionally after other plain git commands, to be checked against the branch of that worktree. Any other command in the same call makes the guard use the session branch, which can cause a false denial.
- An escaped space in a `-C` path hides the commit from the guard.
- The guard falls back to the session branch for a `-C` directory that it cannot resolve or that has no branch, such as one with `~`, a shell variable or a detached head.
- The guard does not read the attached forms `-Cdir` and `-C=dir`.
- The guard does not catch `git reset <other-branch>` without `--hard`.
- The guard reads the branch, the upstream and the index before the command runs, so it checks the old branch for `git switch X && git commit`.
- The guard does not check a `--` used as prose punctuation in a commit body.
- The guard does not check the format of a commit without a message flag (an editor or `-F`). A `-F` file that holds `Co-Authored-By` passes.
- The guard does not unquote mid-word quoting in a path after `--`, such as `".e"nv`.
- The guard blocks a `git add ... && git commit` when an untracked, unignored secret file exists, even if the add does not name it.
- The guard reads unquoted heredoc or `echo` text as a command, so it denies `echo git reset --hard`.
- The guard does not catch other history-changing commands such as `git reset --merge`, `git branch -f`, `git rm -rf`, `git worktree remove --force` and `git update-ref -d`.
- The guard does not read an expansion inside the message, so `-m "feat(app): x $(date)"` passes the format check.
- Your own `!` commands do not pass through `tool.call`, so the guard stops only the model and its subagents.

## Tests

Run `claude plugin test .claude/mods/git-guard` from the `.dot` repository root.

## Turning it off

Remove the mod path from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
