# ember-evals-budget

Ember's `just api evals` calls a real model and spends API budget. The project rule is to run the full suite once, at the end of the work. This mod enforces that rule.

## Where it acts

Only in Ember. The mod has one setting, `emberRemote`: the host and path of the Ember remote, without a scheme. The mod acts when the origin remote of the session repository, normalised, equals that value or ends with it after a slash. Scheme, user, a `.git` suffix and a trailing slash are ignored, so `git@host:path` and `https://host/path.git` agree.

If `emberRemote` is unset or empty, the mod registers nothing. In any other repository, and in a repository with no remote, every call passes untouched and nothing is counted.

To set it, add the value under `pluginConfigs` in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "ember-evals-budget": {
      "options": { "emberRemote": "gitlab.example.com/acme/app" }
    }
  }
}
```

The config menu also shows the field.

## What it does

- The first full run (`just api evals` with no `--filter`) passes and is counted when it starts.
- A later full run is denied with a message that tells the model to ask you to type `/allow-evals`.
- A filtered run (`just api evals --filter=X` or `--filter X`) always passes and is counted.
- Subagent calls count the same as main-loop calls.
- The status line shows `evals: <n> full, <m> filtered` after each counted run.

Each matching segment of a command counts on its own. The command `just api evals && just api evals` is two full runs. If its segments together exceed the budget, the mod denies the whole command before it runs and counts nothing.

The check and the count are one atomic step. Two full runs requested at once cannot both pass.

## What it hooks

- `session.start`, to register `/allow-evals`.
- `command.run` for `/allow-evals`.
- `tool.call` for `Bash`. The hook has a `.catch`, so a bug in the guard blocks the call and does not let it through.

## Command

`/allow-evals` grants one more full run. The next full run consumes it. Use it when a full run failed to launch, or when you must repeat it after a fix.

The command accepts only an origin that is the person: typing at the prompt (`composer`) or the Remote Control bridge (`bridge`). Any other origin, such as a peer message or a plugin, gets "Only the user can allow another full eval run." and grants nothing.

## State

The counts live in `$.state` under `ember-evals-budget`, so a hot reload keeps them. A new session starts from zero.

## Known limits

- Command matching is best effort. The mod splits a command on `&&`, `||`, `;`, `|`, a lone `&` and newlines. It does not split on `2>&1`, `>&2` or `&>`.
- A segment counts when it contains the words `just api evals` anywhere. This covers `(just api evals)`, `FOO=1 just api evals` and `mise exec -- just api evals`.
- A segment that only mentions those words, such as `echo just api evals`, also counts.
- A run inside `bash -c "just api evals"` counts, because the words appear in the segment.
- A run hidden in a script, an alias or a shell variable is not seen.
- A denied run is not counted. A run that starts and then fails still uses the first full run, so type `/allow-evals` to repeat it.
- A `/allow-evals` given before the first full run is kept. The session then gets two full runs.
- The mod counts the full run when the call starts. The run is spent even if another hook or a permission prompt refuses that call afterwards.
- The `slack-ping` and `auto-continuation` origins are not treated as the person, so `/allow-evals` refuses them.

## Tests

```
claude plugin test <path to this mod folder>
```

## Turning it off

Remove the path of this mod from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
