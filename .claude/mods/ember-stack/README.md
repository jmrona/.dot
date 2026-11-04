# ember-stack

Ember has one shared local Docker stack. It can mount a different worktree from the one that your session works in. Testing then hits the wrong code. This mod shows a band above the prompt when that happens.

## Where it acts

Only in the repository that you name in the `emberRemote` setting. The mod treats a repository as Ember when its remote ends with that value. The scheme, the user and a `.git` suffix do not count, so `git@host:path` and `https://host/path.git` agree. If the setting is unset or empty, the mod does nothing. In any other repository it runs nothing and the band draws nothing.

## Configuration

Set `emberRemote` to the host and path of the remote, without a scheme. Add it under `pluginConfigs` in `~/.claude/settings.json`, keyed by the plugin name:

```json
{
  "pluginConfigs": {
    "ember-stack": {
      "options": { "emberRemote": "gitlab.example.com/acme/app" }
    }
  }
}
```

The setting also appears as a row in the `/config` menu. A change there reloads the mod.

## What it does

- It runs `just docker which` in the git top level of the session directory.
- It parses each line as `service branch path` and skips services that are not running.
- If a running service mounts another path, the band names the services, the path and the branch, in Spanish.
- If several paths differ, the band shows one sentence per path, then one line of advice.
- If everything matches, or nothing runs, the band draws nothing.
- If the command fails, the band draws nothing and the error goes to the log.

## Hooks and commands

- `session.start` registers `/stack` and reads the stack.
- `tool.call` for `Bash` reads the stack again after any command that mentions `docker` or `worktree.sh`. The result of the call is unchanged.
- `command.run` for `/stack` reads the stack again and answers "Stack refreshed."
- `ui.render` for `AbovePrompt` draws the band on the terminal and desktop surfaces.

## State

The mod keeps one value, `ember-stack.reading`, which holds the worktree root and the parsed mounts. The band only reads it.

## Known limits

- The stack is read at session start, after matching Bash calls and on `/stack`. A change made elsewhere shows after the next refresh.
- A Bash command matches by a plain text search, so it can refresh when `docker` only appears in an argument.
- The advice text assumes that the reader prefers Spanish.

## Tests

Run `claude plugin test <path to this folder>`.

## Turn it off

Remove the path of this mod from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
