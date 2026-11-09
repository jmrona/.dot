# waves

Shows the subagents that the main loop dispatches, grouped in waves, in a pane beside the chat.

## Why

A wave is the set of subagents that one Workflow run spawns, or that one main-loop step spawns outside a workflow. When you orchestrate work in waves, the pane shows how far each wave has got and what each task is doing, without reading the transcript.

## Where it acts

In any repository. It has no options and no repository detection.

## What it shows

A tree with one header per wave. Waves are numbered from 1 in the order of their first spawn. Each task of a wave is indented below its header, on two lines.

```
[ ] Wave 2   Wave progress in the TUI   5/7 done
    [x] Build the progress view model
        claude-haiku-5-5  2m 27s
    [ ] Review the step detail card
        claude-haiku-5-5  0m 25s
```

- A wave is one Workflow run. Agents with the same `workflow.runId` form one wave. Agent tool spawns outside a workflow form one wave per main-loop step.
- The header shows `[x]` when no task of the wave runs. Otherwise it shows `[ ]`. It then shows the wave title, if any, and `<done>/<total> done`.
- The task mark shows `[x]` when the task is completed or idle. It shows `[ ]` when the task is pending, running or waiting. It shows `[!]` when the task is failed or killed.
- The first task line shows the task title. Until a title arrives, or when the call fails, it shows the task description that the spawn gave.
- The header shows no title until a wave title arrives, or when the call fails.
- The titles come from `haiku`. The mod asks it for a task title when a new row is recorded, and for a wave title each time a task title arrives. Only the most recent wave reply applies.
- The mod keeps the first line of a reply, removes surrounding quotes and keeps at most 60 characters.
- The second task line shows the resolved model, the one that the spawn answered, and not `inherits ...`. It then shows the elapsed time as `<m>m <ss>s`. A running task counts to now. A finished task counts to the moment it finished.

## What it hooks

- `turn.step`: counts the steps of the main loop. A spawn belongs to the step in which it happens.
- `agent.spawn`: records a spawn of the main loop. It records the description, the resolved model, the start time and the wave key. For a new row, it also starts the title request in the background, so the spawn is not delayed. Spawns made inside a subagent form no wave and are ignored. A resumed agent reopens its existing row as running and keeps its start time, wave, description and title. It makes no new title request.
- `turn.complete`: marks a recorded agent finished when its turn ends. An `answer` gives completed, `error` and `refusal` give failed, and `aborted` gives killed.
- `session.start`: registers the `/waves` command.
- `session.end`: with reason `clear`, it empties the list and the wave titles.
- `ui.render`: draws the pane. It reads the state and never writes.

## Commands

- `/waves`: opens the pane if it is closed and closes it if it is open.

The pane opens by itself on the first recorded spawn of a session.

## State

Kept in `$.state` under `waves`: the recorded agents, the step counter and the wave titles. Each recorded agent holds its wave key, agent id, description, title, model, status, start time and finish time. The wave titles form a map from wave key to title. State saved in the previous shape is discarded.

## Status polling

The spawn answer arrives when the subagent starts, so it carries the agent id and not the outcome. The mod reads `$.agent.list()` every three seconds while any recorded agent runs. It cancels the timer when none runs.

Pending, running and waiting count as running. Completed and idle count as finished. Failed and killed count as failed. A recorded agent that the list no longer shows counts as finished. A workflow agent is the exception, because the list never names workflow agents, so a workflow agent keeps its status.

Each tick also redraws the pane while any agent runs, so that the elapsed time advances.

## Known limits

- Status changes appear at the next poll, up to three seconds late.
- A spawn that a hook denies, or that returns no agent id, is not recorded.
- A task that has not been spawned yet cannot be shown, because the mod only learns of an agent at spawn.
- The elapsed time of a running task advances in three-second steps.
- A workflow agent that never sends `turn.complete`, such as a remote agent, shows as running until the conversation is cleared. The mod keeps calling the agent list every three seconds until then.
- A fork ignores the requested model. The model line can show a model that the fork did not use.
- A teammate is `idle` between turns. A wave of teammates can read finished while a teammate is still alive.
- The polling timer is lost if the mod reloads while agents run. The next spawn starts it again.
- Each task title costs about $0.00013 and each wave title about $0.00005. These estimates use Haiku 5.5 prices of $0.10 input and $0.50 output per million tokens.
- A wave of seven tasks costs about $0.001 in total. With a subscription, the calls count against your usage limits instead.
- Some Workflow runs do not pass the real prompt to the mod, so their titles come from the description alone.
- A title appears a second or two after the spawn.

## Tests

```
claude plugin test <path to this folder>
```

## Turning it off

Remove the path of this folder from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.
