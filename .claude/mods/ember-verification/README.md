# ember-verification

Shows in a pane which Ember pillars have fresh `check` and `test` runs since their last edit.

Ember requires `just <pillar> check` and `just <pillar> test` to run after the last edit to every pillar that a change touches. This mod tracks that for you, so you can see at a glance what is still missing.

## Where it acts

Only in Ember. Set the `emberRemote` option to the host and path of the Ember remote, without a scheme, for example `gitlab.example.com/acme/app`. If the option is unset or empty, or the repository has another remote, the mod does nothing at all.

The pillars are `api`, `governor`, `platform`, `pods` and `proto`. The mod finds a pillar from the path of an edit, relative to the git top level of the session directory.

## What it hooks

- `tool.call` for `Edit`, `Write` and `NotebookEdit`. An edit that finished without error, under `<root>/<pillar>/`, marks that pillar as edited.
- `tool.call` for `Bash`. Each command segment (split on newlines, `&&`, `||`, `;`, `|` and `&`) that runs `just <pillar> check` or `just <pillar> test` records the start time and the outcome.
- `just proto lint` counts as the proto check.
- `just check` and `just test` without a pillar count for every pillar.
- A test run with a path argument or a `--filter` is partial. The mod records it but never treats it as fresh. A partial run never replaces a recorded full test run.
- The mod does not read redirections such as `> out.txt` and `2> err.txt` as arguments, so `just api test > out.txt` is a full run.
- A recipe name must end at a space or the end of the segment. For example, `just api check-foo` is not a check and `just api evals-watch` is not a full evals run.
- The mod normalises edit paths, so `<root>/api/../platform/x.ts` marks `platform`.
- `ui.render` draws the pane. The render hook only reads state and runs no git command.
- `session.start` registers the command and reads the branch into state.
- Each recorded edit reads the branch again, so the header follows a branch switch.

## The pane

The first line shows the ticket key and the branch, for example `FEAT-12  (rama FEAT-12-pane)`. Without a key it shows the branch alone. One row follows for each edited pillar:

```
platform  editado 10:42   check OK 10:44   test FAIL 10:45
api       editado 10:30   check --         test obsoleto (OK 10:12)
evals     pendiente
```

- `--` means that the mod has recorded no run.
- `obsoleto (...)` means that the run is older than the last edit.
- `parcial (...)` means that the test run covered only part of the suite.
- The `evals` row appears after an edit under `api/app/Slices/Assistant/` or `api/tests/Evals/`. A full `just api evals` run without error clears it, but only if the run started after the last edit under those paths.

The pane opens by itself on the first recorded edit of a session.

## Command

`/verification` opens the pane when it is closed and closes it when it is open. It reads the branch again first.

## State

The mod keeps two values. `ember-verification.branchHeader` holds the header text, or null when the branch is unknown. `ember-verification.verification` holds the last edit time of each pillar and the last check and test runs. Each run records its time, its outcome and whether it was partial. The state also holds the time of the last edit that needs evals.

## Known limits

- If a git command fails, the mod logs a line when it runs the command (at session start, on each edit and on `/verification`). The mod records nothing for a failed root lookup and draws the pane without the header.
- The header refreshes at session start, on each edit and on `/verification`. A branch switch shows after the next of these.
- The mod does not see edits made through Bash (`sed`, heredocs).
- Command matching is best effort. It can record a run that appears only inside quoted text.
- The outcome comes from the `isError` flag of the Bash result. These cases can record the wrong outcome:
  - `just x check || true`, which hides a failure.
  - A pipe such as `just api test | tail`, which reports the status of the last command.
  - Several runs in one command, which share one outcome.
- A run launched in the background records nothing, because the mod sees only its launch. The row keeps its previous state, and a backgrounded `just api evals` does not clear the evals row.
- The mod records the time when a run starts, so an edit that lands while a run is in progress makes that run obsolete.

## Tests

```
claude plugin test /path/to/ember-verification
```

## Turning it off

Remove the path of this mod from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
