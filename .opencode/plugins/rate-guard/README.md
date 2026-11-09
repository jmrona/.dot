# rate-guard

This plugin keeps opencode within the provider rate limits when many `openai/hard` subagents run together. It queues `openai/hard` subagent calls so that only a set number run at once. It also lengthens the wait before opencode retries a rate-limited request. A slash command shows or changes the limit, and a toast shows the reply in the terminal user interface (TUI).

## Where it acts

It acts in every session, root or sub, because the hooks are global. It limits only subagent calls whose target agent uses the model `hard` from the provider `openai`. Calls to any other agent pass through unchanged. The retry delay applies to every session and every model, as long as the error is a rate limit.

## What it hooks

- `session` hook `retry`: for a rate-limit error that opencode will retry, it replaces the retry decision with a longer, jittered delay.
- `tool` hooks `execute.before` and `execute.after`: they take a slot before a `subagent` tool call runs and release it when the call is over.
- `event.subscribe`: it reads the event stream to release slots. It reacts to `session.tool.failed`, `session.deleted` and the events `session.execution.succeeded`, `session.execution.failed` and `session.execution.interrupted`.
- `command.transform`: it adds the slash command `/hard-limit`.
- `agent.get`: it reads the model of the target agent to decide whether the call is a hard call.
- `session.get` and `session.synthetic`: the first checks that a queued session still exists. The second posts the command reply to the session without resuming it.

The TUI entry `tui.tsx` listens to `session.inbox.enqueued`.

## How it works

### Concurrency slots

A semaphore holds a number of slots equal to the limit. A `subagent` tool call takes a slot only if its `agent` input names an agent whose model id is `hard` and whose provider is `openai`. If opencode cannot read the agent, the call is not gated.

If all slots are taken, the call waits in a first-in, first-out queue. Before it runs, the plugin checks that the calling session still exists. If the session is gone, the plugin drops the call and frees the slot for the next one.

### When a slot is released

- A foreground call releases its slot when `execute.after` runs.
- A background call (`background: true`) keeps its slot after `execute.after` if the result names a child session. The slot is released when the child session ends with `succeeded`, `failed` or `interrupted`, or when the child session is deleted.
- A background call whose result names no child session releases its slot at `execute.after`.
- If the tool call fails (`session.tool.failed`), the plugin removes the call from the queue and releases its slot.
- If a session is interrupted, the plugin drops its queued calls and releases its foreground slots. Background slots stay until the child ends.

### Retry delay

The `retry` hook acts only if opencode already decided to retry and the error is a rate limit. An error is a rate limit if its status is `429` or its type is `provider.rate-limit`.

- If the error message contains `try again in <number> ms` or `try again in <number> s`, that time is the base delay.
- Otherwise the base delay is 5 seconds on attempt 2, doubling on each later attempt, with a ceiling of 60 seconds. Attempt 1 uses 2.5 seconds.
- The plugin adds a random jitter of up to 20 percent of the base delay, then rounds to whole milliseconds.

### Hard-limit reply

The command replies through `session.synthetic` with `resume: false`, so the model does not answer it. If the reply cannot be posted, the command ignores the failure. The reply texts are:

- `At most <n> openai/hard subagents run at once.` when you show the limit.
- `At most <n> openai/hard subagents now run at once.` after you set the limit.
- `Use /hard-limit to show the limit or /hard-limit <1-10> to set it.` for an invalid argument.
- `Could not save the hard subagent limit: <reason>. The limit is unchanged.` when the file write fails.

## Commands

`/hard-limit` shows the current limit.

`/hard-limit <n>` sets the limit to the whole number `n`, from 1 to 10. The plugin writes the value to `config.json` first. If the write succeeds, the new limit applies at once. A higher limit wakes queued calls straight away. A lower limit does not stop running calls, but no new call starts until enough slots are free. Any other argument gets the usage reply.

## TUI

`tui.tsx` registers the TUI plugin `rate-guard-toast`. It listens to `session.inbox.enqueued`. If the event belongs to the session that you are viewing and holds a synthetic message from `/hard-limit`, it shows the message as a toast. The toast variant is `info` for the show and set replies, and `error` for the usage and save-failure replies. Other messages show no toast.

## Configuration

The file is `config.json`, next to `index.ts`:

```json
{
  "maxConcurrentHardSubagents": 3
}
```

`maxConcurrentHardSubagents` is a whole number from 1 to 10. The plugin reads it once at start-up. The default in the code is 2. If the file is missing, is not valid JSON, is not a JSON object, or holds a value outside 1 to 10, the plugin logs a warning that names the file and uses 2.

The `implementer` plugin reads the same file. It loads the limit through `loadHardLimit` from this plugin and imports the semaphore from this folder. The `rate-guard` folder must therefore stay next to `implementer`.

## State

- `config.json` is the only file that the plugin writes. Only `/hard-limit <n>` writes it, and it keeps any other keys in the file. If the file is missing, the command creates it.
- The queue, the slot count and the call tracking live in memory and are lost when opencode restarts.

## Installation

opencode loads plugins from `~/.config/opencode/plugins/<name>/`. The copy in this repository is `.opencode/plugins/rate-guard/`. The plugin needs the dependency `@opencode-ai/plugin`, which `.opencode/package.json` declares.

1. From the repository root, preview the install. This command writes nothing:

   ```bash
   node lab/promote.mjs
   ```

2. If the preview is correct, apply it:

   ```bash
   node lab/promote.mjs --apply
   ```

   The root README describes this route in the section "Promote the harness".

3. Promote skips `config.json` inside plugin folders (`PLUGIN_EXCLUDES` in `lab/promote/managed-paths.mjs`). On a first install, copy the file by hand:

   ```bash
   cp .opencode/plugins/rate-guard/config.json ~/.config/opencode/plugins/rate-guard/config.json
   ```

   If you skip this step, the plugin uses the default limit of 2 and logs a warning. Promote never overwrites the file afterwards, so your later `/hard-limit` changes stay.

## Known limits

- Only `openai/hard` subagents count. The code has no setting for another provider or model.
- The limit must be a whole number from 1 to 10.
- The limit changes at run time only through `/hard-limit`. Editing `config.json` by hand takes effect after a restart.
- If the event stream stops, the plugin logs a warning and stops releasing background slots. Restart opencode to recover.
- The gate is fail-open. If the agent lookup fails, or if the slot wait ends because the session is gone, the call is not counted.
- The retry delay can exceed 60 seconds. A delay from the message hint has no ceiling, and the jitter is added after the ceiling.

## Tests

```bash
node --test .opencode/plugins/rate-guard/*.test.ts
```

## Turning it off

Remove the folder `~/.config/opencode/plugins/rate-guard/`, or move it out of `~/.config/opencode/plugins/`. Restart opencode afterwards. Because the `implementer` plugin imports from this folder, remove or adapt that plugin too.

To keep the plugin but make it less strict, raise the limit to 10 with `/hard-limit 10`. The code has no setting that disables the queue or the retry delay.
