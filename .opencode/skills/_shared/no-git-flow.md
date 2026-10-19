# No-Git Flow - Procedural Rules

Use this file in place of every git step in a skill that cites it. It applies when the working directory is not a git repository. Detect this with `git rev-parse --is-inside-work-tree`: if the command fails, this file applies.

## Terms

- **Root:** each top-level directory that the work changes. Work that spans two directories, such as two configuration trees, has two roots.
- `WORKING_DIR`: a root, with its live files.
- `FEATURE_BASELINE_DIR`: the copy of every root taken before the first dispatch. Nobody changes it after the check in step 3.
- `TASK_BASELINE_DIR`: a fresh copy taken before each task, limited to the paths that task touches.

## Commits

Do not ask the commit-preference question. State to the user: "No version control, so no commits." Every step that would commit becomes a no-op.

## Baseline

The orchestrator **MUST** create every baseline itself. A subagent **MUST NOT** create, edit or delete a baseline.

1. Place each baseline outside every root, in the session scratchpad or in `$TMPDIR`. Give each root its own subdirectory, for example `<baseline>/claude/` and `<baseline>/opencode/`.
2. From inside each root, copy the paths the work will touch with `rsync -aR <paths> "<baseline>/<root name>"/`. This preserves relative paths. Run it under `bash` so that a list of paths splits into separate arguments.
3. Check each baseline before any dispatch. `diff -rq` between each source path and its copy **MUST** print nothing. `find <path> -type f | wc -l` **MUST** give the same count on both sides. A flattened or partial copy fails this check. Recreate it before continuing.
4. Tell the user where the baselines live. Never delete them without asking.
5. Name the baseline in every subagent prompt and state that it is read-only.

## Verification Gate

Where a skill runs `git status` and `git diff`, run `diff -ruN "$TASK_BASELINE_DIR/<path>" "$WORKING_DIR/<path>"` instead. The `-N` option reports created and deleted files, so a path missing from the baseline is expected for a new file. `diff` does not detect renames. A rename shows as a deletion plus a creation.

## Review Range

Where a skill asks for BASE_SHA and HEAD_SHA, pass the baseline and `WORKING_DIR` instead, with the `diff -ruN` output between them. Per-task reviews use `TASK_BASELINE_DIR`. The final feature review uses `FEATURE_BASELINE_DIR`.

## Per-Task Baselines

Before each task, create a new `TASK_BASELINE_DIR` in a fresh directory, never by overwriting an earlier one. Copy only the paths that task touches, and check it as in step 3.
