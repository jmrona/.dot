# waves

Shows the subagents that the main loop dispatches, grouped in waves, in a pane beside the chat.

## Why

A wave is the set of subagents that the main loop spawns from one model response. When you orchestrate work in waves, the pane shows how far each wave has got without reading the transcript.

## Where it acts

In any repository. It has no options and no repository detection.

## What it shows

One row per wave, numbered from 1 in order. Pane text is in Spanish.

```
[x] Wave 1   3 agentes   terminada         sonnet x3
[ ] Wave 2   4 agentes   2 en curso, 2 OK  sonnet x2, hereda opus x2
```

- `[x]` means that every agent of the wave has finished. `[ ]` means that at least one still runs.
- A failed or killed agent shows as `<n> fallido(s)`.
- A model shows as given in the spawn. An agent without a model shows `hereda <parent model>`.

## What it hooks

- `turn.step`: counts the steps of the main loop. A spawn belongs to the step in which it happens.
- `agent.spawn`: records a spawn of the main loop. Spawns made inside a subagent form no wave and are ignored.
- `session.start`: registers the `/waves` command.
- `session.end`: with reason `clear`, it empties the list.
- `ui.render`: draws the pane. It reads the state and never writes.

## Commands

- `/waves`: opens the pane if it is closed and closes it if it is open.

The pane opens by itself on the first recorded spawn of a session.

## State

Kept in `$.state` under `waves`: the recorded agents (step, agent id, type, model, status) and the step counter.

## Status polling

The spawn answer arrives when the subagent starts, so it carries the agent id and not the outcome. The mod reads `$.agent.list()` every three seconds while any recorded agent runs. It cancels the timer when none runs.

Pending, running and waiting count as running. Completed and idle count as finished. Failed and killed count as failed. A recorded agent that the list no longer shows counts as finished.

## Known limits

- The pane shows waves only. Tasks per wave are not shown.
- Status changes appear at the next poll, up to three seconds late.
- A spawn that a hook denies, or that returns no agent id, is not recorded.
- A fork ignores the requested model. The model column can show a model that the fork did not use.
- A teammate is `idle` between turns. A wave of teammates can read finished while a teammate is still alive.
- The polling timer is lost if the mod reloads while agents run. The next spawn starts it again.

## Tests

```
claude plugin test <path to this folder>
```

## Turning it off

Remove the path of this folder from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
