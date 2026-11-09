# auto-compact

This plugin compacts an opencode session for you. Compaction replaces the long history with a summary, which frees context space. The plugin compacts a root session when the model saves a plan file. It also compacts when the context reaches a percentage of the model input limit that you choose. It then tells the model what the compaction removed, so that the model can continue its work.

## Where it acts

It acts only in root sessions, that is, sessions that have no parent. It ignores subsessions. It does not check the agent name, so it acts for any agent that runs in a root session. The plan trigger fires on any agent that writes a plan file.

## What it hooks

- `tool.hook('execute.after')`: runs after each tool call. The plugin registers it only when `compactOnPlanSave` is `true`. It reacts to completed `write` and `edit` calls on a plan file.
- `event.subscribe`: reads the session events. The plugin uses it to confirm a compaction and to watch the context size. The events are `session.compaction.ended`, `session.compaction.failed`, `session.deleted`, `session.step.started`, `session.step.ended`, `session.execution.succeeded`, `session.execution.failed` and `session.execution.interrupted`. The last four count as execution progress and start the confirmation timeout.
- `command.transform`: registers the `/auto-compact` command.
- `session.get`: finds out whether a session is a root session.
- `session.compact`: starts the compaction, with delivery `steer`.
- `session.synthetic`: adds a notice to the session, without resuming the model.
- `model.list`: reads the input limit of the model that the session uses.

## How it works

There are two triggers. Both end in the same compaction flow.

### Plan trigger

1. The model finishes a `write` or `edit` call. The plugin reads the `path` of the tool input.
2. The path must be absolute, or start with `~/`. It must end in `.md` and must sit inside the plan directory `/Users/jose.romero/.opencode/plan`.
3. The session must be a root session and must have no compaction in flight.
4. The plugin reads the file and hashes its content. If the same session already compacted for the same path and the same hash, it does nothing.
5. The plugin starts the compaction.

The plugin handles each tool call ID once. If the plan file cannot be read, it adds a notice that asks you to run `/compact`.

### Threshold trigger

1. On `session.step.started`, the plugin remembers the model of the session.
2. On `session.step.ended`, it adds up the step tokens: input, output, reasoning, cache read and cache write.
3. It compares the total with the model input limit multiplied by the threshold. The input limit is the `input` limit of the model, or the `context` limit if the model has no `input` limit.
4. When the total reaches the threshold, the plugin starts the compaction and disarms the session. It arms the session again at the first step whose total is below the threshold.
5. The threshold trigger does nothing for a session that has a compaction in flight, and does nothing when the model or its limit is unknown.

### After the trigger

The plugin marks the session as in flight and calls `session.compact`. It then waits for `session.compaction.ended`.

- On success, it adds a notice to the session. The notice says that skill instructions loaded before the compaction are no longer in context. After a plan compaction, the notice also names the plan file and tells the model to continue with the handoff step of the design skill. After a threshold compaction, it tells the model to invoke the current skill again.
- On failure, on a timeout or when the event stream breaks, it adds a notice that asks you to run `/compact`. For a plan compaction, it also forgets the hash, so that saving the same plan again retries.
- The timeout starts at the first execution progress event after the compaction call. It lasts `confirmationTimeoutSeconds`, 300 seconds by default. A fixed cap of one hour applies from the start.
- If the session is deleted, the plugin stops without a notice.

## Commands

- `/auto-compact`: shows the current threshold.
- `/auto-compact <1-100>`: sets the threshold to that percentage. A decimal such as `37.5` is valid.
- `/auto-compact off`: turns the threshold off.
- Any other argument shows `Use /auto-compact <1-100> or /auto-compact off.`

The command saves the value to `config.json` before it applies the value. If the save fails, the threshold stays unchanged and the reply says so. A new value applies at once, with no restart. The command changes only the threshold trigger. It does not change the plan trigger.

## TUI

The file `tui.tsx` adds a text to the footer status of the prompt. It shows only in root sessions. The text has three forms:

- `auto-compact off`: the threshold is `null`.
- `auto-compact <used>/<threshold>%`: `used` is the percentage of the input limit that the last assistant message of the session used. For example, `auto-compact 41/70%`.
- `auto-compact error`: the threshold watcher gave up, see State.

The indicator shows no text when `config.json` is invalid, when the session has no assistant message yet, or when the model limit is unknown. It refreshes when a step ends and when a new item reaches the session inbox.

The TUI also shows a toast for the replies of `/auto-compact`. Replies that start with `Use /auto-compact ` or `Could not save` show as an error. Replies that start with `Auto-compact threshold ` show as information.

## Configuration

The file is `config.json`, next to `index.ts`. All keys are optional.

```json
{
  "compactOnPlanSave": true,
  "compactAtPercentOfInputLimit": null,
  "confirmationTimeoutSeconds": 300
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `compactOnPlanSave` | `true` | Turns the plan trigger on or off. |
| `compactAtPercentOfInputLimit` | `null` | Percentage of the model input limit, from 1 to 100. `null` turns the threshold trigger off. |
| `confirmationTimeoutSeconds` | `300` | Seconds to wait for the compaction to end. It must be an integer of 1 or more. |

The plugin reads the file once, when opencode loads the plugin. A change to `compactOnPlanSave` or `confirmationTimeoutSeconds` needs a restart of opencode. A change to the threshold in the file applies to the watcher only after a restart too, but the `/auto-compact` command applies at once.

If a key has an invalid value, the plugin logs the problem and uses the default for that key. If the file is not valid JSON, or is not an object, the plugin logs the problem and uses all the defaults. A missing file is not an error.

One path is fixed in the code: `PLAN_DIRECTORY` in `index.ts` is `/Users/jose.romero/.opencode/plan`. No setting changes it.

## State

- `config.json`: the plugin writes it only when you run `/auto-compact <1-100>` or `/auto-compact off`. The second form saves `null`. It keeps the other keys of the file and creates the file if it is missing.
- `status.json`: holds `{ "thresholdWatcher": "failed" }` when the threshold watcher gave up. The plugin deletes the file when it starts and when `/auto-compact` starts a new watcher.
- In memory: the sessions with a compaction in flight, the plan hashes and the handled tool call IDs. They live in the opencode process and are lost when it exits.

The threshold watcher reads one event stream. If the stream ends or fails, the plugin logs a message and subscribes once more. If the second stream also ends, the plugin writes `status.json`, and the threshold stays inactive until you restart opencode or run `/auto-compact` with a value. The plan trigger is not affected.

## Installation

opencode loads plugins from `~/.config/opencode/plugins/<name>/`. The repository copy is `.opencode/plugins/auto-compact/`. The plugin needs the package `@opencode-ai/plugin`, which `.opencode/package.json` declares.

1. Commit your changes in `.claude` and `.opencode`. The preflight refuses to run with uncommitted changes.
2. From the repository root, run `node lab/promote.mjs`. It prints a preview and writes nothing.
3. Read the preview. If it is correct, run `node lab/promote.mjs --apply`.
4. Restart opencode.

See the section "Promote the harness" in the root `README.md` for the backup and restore options.

Promote skips `config.json` and `status.json` inside plugin folders. A first install therefore has no `config.json`, and the plugin uses the defaults: the plan trigger is on and the threshold is off. To turn the threshold on, run `/auto-compact <1-100>` in opencode. The command creates `config.json`. You can also create `~/.config/opencode/plugins/auto-compact/config.json` by hand. Later promotions never overwrite your `config.json`.

## Known limits

- opencode v2.2.5 hardcodes the writable directory of the Plan agent as `~/.opencode/plan`. In plan mode it denies writes to other directories. The plan directory cannot be moved.
- `PLAN_DIRECTORY` is the absolute path `/Users/jose.romero/.opencode/plan`, so the plan trigger works only for that home directory. On another account, edit the constant.
- A threshold below the context floor makes the plugin compact again and again. The floor is the system prompt, the rules and the reloaded skills, about 36k to 46k tokens. The plugin has no guard against it. A real test with 5% produced 70 compactions in 26 minutes.
- A plan saved to a relative path such as `.opencode/plans/` does not trigger compaction. The path must be absolute or start with `~/`, and must be inside the plan directory.
- Only `.md` files trigger the plan compaction.
- The plan trigger reads the `path` key of the tool input. A tool call without that key does not trigger it.
- Saving the same plan content again in the same session does not compact again, unless the earlier compaction failed.
- If the input limit of the model is unknown, the threshold trigger does nothing and the indicator shows no text.
- The threshold watcher resubscribes only once, see State.
- The plan trigger and the threshold trigger share one in-flight slot for each session. A trigger that fires during a compaction is dropped.

## Tests

```bash
node --test .opencode/plugins/auto-compact/*.test.ts
```

Run it from the repository root.

## Turning it off

- To turn off only the threshold, run `/auto-compact off`.
- To turn off only the plan trigger, set `"compactOnPlanSave": false` in `~/.config/opencode/plugins/auto-compact/config.json` and restart opencode.
- To turn off the whole plugin, remove the folder `~/.config/opencode/plugins/auto-compact/` or move it out of `~/.config/opencode/plugins/`, then restart opencode. A later `node lab/promote.mjs --apply` copies the folder back from the repository.
