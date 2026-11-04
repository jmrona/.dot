# ember-guard

A guard on `tool.call` that protects three things in the Ember repository.

## Where it acts

Only in Ember. The mod reads the session repository and acts when its remote ends with the value of the `emberRemote` option. In any other repository, or with no remote, every call passes through unchanged.

## Configuration

The mod needs the `emberRemote` option: the host and path of the Ember remote, without scheme or `.git` suffix. If the option is unset or empty, the mod does nothing. Set it under `pluginConfigs` in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "ember-guard": { "options": { "emberRemote": "gitlab.example.com/acme/app" } }
  }
}
```

The `git@host:path` and `https://host/path.git` forms of a remote both match.

## What it blocks

- Shell commands that switch the shared Docker stack: `just docker use`, `just docker up`, `docker compose up` (with any flags) and `worktree.sh use` or `worktree.sh up`. Other sessions test against that stack.
- `Edit`, `Write` and `NotebookEdit` on generated code: `api/app/Shared/Proto/`, `governor/proto/`, `platform/src/shared/rpc/slices/` and `pods/<crate>/src/generated/`. Change `proto/` and regenerate instead.
- `php artisan test` and `just api artisan test`. Use `just api test`, which gives each run its own databases.

## How it works

- Each path is made absolute against the real session directory, collapsed of `.` and `..`, and resolved through symbolic links as far as it exists.
- The worktree root comes from the git top level of the path's nearest existing directory. If that fails, the session's top level is used. A path in another Ember worktree is judged against that worktree.
- Shell commands are split on `&&`, `||`, `;`, `|`, `&` and newlines. Each segment is searched for the command words, wherever they stand, so `sudo`, `time`, subshells and `bash -c "..."` are caught.
- `docker compose` is matched only when `up` follows its flags and their values, so `docker compose exec api php artisan up` passes.
- If the guard itself fails, the call is denied.

## Hooks, commands and state

It hooks `tool.call` for `Bash`, `Edit`, `Write` and `NotebookEdit`. It adds no commands and keeps no state.

## Known limits

- Command matching is best effort. A command built by a variable, a function or an alias is not seen.
- The command words are matched even inside quoted text, such as `echo "just docker up"`. This blocks a harmless command and errs on the safe side.
- A hard link into a generated directory keeps its own path and is not detected.

## Tests

Run `claude plugin test <path to the mod folder>`.

## Turning it off

Remove the mod path from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
