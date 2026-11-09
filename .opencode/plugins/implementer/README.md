# implementer

Adds the `implement_wave` tool to opencode. The tool runs one wave of an approved implementation plan. It starts a child session for each task. A second child session reviews the work. If the review fails, the tool repeats the work. Then the tool runs the proof commands of the plan.

## Where it acts

The tool belongs to the root session that calls it. The skill `.opencode/skills/subagent-driven-development/SKILL.md` calls it, once for each wave. On entry, the tool switches the root session to the `build` agent.

The child sessions use the `agentType` that each task names. They are children of the root session. Each task gets an implementer session and a reviewer session. Each correction round adds a new implementer session and a new reviewer session, up to 3 of each.

## What it hooks

The plugin has the id `implementer`. In `setup`, it registers one tool, `implement_wave`, through `tool.transform`. It registers no other hook and no command.

The tool blocks until the wave ends. It returns the wave result as JSON text. The arguments are these:

- `baseSha`: the commit that HEAD must still be at when the wave ends.
- `dirtyAtBase`: the paths that were already changed before the wave.
- `models`: a map from each tier name to a model id of the form `provider/id`.
- `proofCommands`: the shell commands of the gate.
- `completed` and `stopped`: the ids of the tasks from earlier waves.
- `tasks`: each task has `id`, `title`, `brief`, `tier`, `agentType`, `writes`, `dependsOn` and `acceptance`.
- `proofTimeoutSeconds`: optional, 1200 by default.
- `childTimeoutSeconds`: optional, 1800 by default.

## How it works

1. The tool validates the arguments. If a problem exists, it returns `invalid-args` with the `problem` text. The problem can be any of these:

   - a wrong field type or a non-positive timeout
   - a duplicate task id
   - a dependency that is neither in the plan nor in `completed`
   - a dependency cycle
   - two unordered tasks that write the same path
   - a tier with no model in `models`
2. The tool selects the wave. It takes the pending tasks, which are the tasks not in `completed` or `stopped`. It holds back every task that depends, directly or indirectly, on a stopped task. It runs the tasks whose dependencies are all in `completed`, up to 4 tasks. The rest are `remaining`. If no task can run, it returns `nothing-to-run` with `held` and `remaining`.
3. The tool switches the root session to `build` and reads the working directory of the root session. The result field `rootAgentSwitch` reports `switched`, `already-build` or `failed: <message>`. If the root session has no working directory, the tool returns `aborted` with a reason.
4. The tasks of the wave run in parallel. For each task, the tool creates an implementer child session with the model of the task tier. The prompt holds a subagent preamble, the implementer template, the task fields, the base SHA, a rule against git writes, and the reply format.
5. A reviewer child session then reads the task. Its prompt holds the reviewer template, the task, the implementer report, and a `git diff` command for the `writes` paths. The prompt tells the reviewer to read every path in `writes` in full, because the diff omits new untracked files. The reviewer must not edit anything.
6. If the verdict is `FAIL`, the tool starts a new implementer session with the findings in a correction round. The session reads the earlier edits from the working tree. A new review follows. The tool allows 2 correction rounds, so a task gets at most 3 reviews.
7. After the wave, the tool runs the gate, but only if at least one task passed its review. If no task did, the result is `completed` and `gate` is `null`.

### Child sessions

Each child session ends with a fenced `json` block in its last assistant message. The tool reads the last such block. The implementer block needs `status`, `summary`, `tddEvidence`, `concerns` and `environmentFailures`. The reviewer block needs `verdict` and `findings`.

A child run fails with one of these reasons:

- `invalid-report`: the block is missing or lacks a required field.
- `child-timeout`: the session did not end within `childTimeoutSeconds`. The tool interrupts it.
- `cancelled`: the call was aborted. The tool interrupts the session.
- `session-error: <message>`: the model id is not `provider/id`, or a session call failed.

A model that is exactly `openai/hard` needs a slot from the rate-guard semaphore. The tool holds the slot while the child runs and releases it afterwards. If no slot is granted, the run fails with `session-error: no hard slot`.

### Templates

At setup, the plugin reads `implementer-prompt.md` and `reviewer-prompt.md` from `skills/subagent-driven-development/`, next to the `plugins` folder. It uses the last `text` code block of each file and removes four leading spaces from each line. If a file has no closed `text` block, the read fails with a message that names the file.

### Task states

- `reviewed`: a reviewer returned `PASS`. After a passing gate, the state becomes `verified`.
- `blocked`: the implementer returned a status other than `DONE` or `DONE_WITH_CONCERNS`, a child run failed, or a reviewer session failed for a reason other than `invalid-report`. The `reason` holds the cause. A reviewer reply with no valid verdict counts as a `FAIL` with the finding `The reviewer returned no valid verdict.`
- `stopped`: the review still failed after the last correction round. The reason is `review-failed`.

Each task also has `rounds`, `reviews` and `report`.

### Gate

The gate runs each proof command with `sh -c` in the working directory, one after another. A command that times out after `proofTimeoutSeconds` runs once more. If it times out again, its entry has `exitCode` of `null` and the reason `environment-timeout`. Each entry keeps the last 40 lines of output.

The gate then reads `git rev-parse HEAD` and `git status --porcelain -uall`. The gate passes only if all of these hold:

- HEAD still equals `baseSha`.
- Every proof command exited with 0.
- Every changed path is in `dirtyAtBase` or in the `writes` of a task of the wave.

The wave status follows from the gate:

- `completed`: the gate passed, or it did not run.
- `gate-failed`: a proof command failed or a changed path is unattributed. The result lists them in `gate.unattributed`.
- `aborted`: HEAD moved, which means that a subagent committed. The reason says so. A cancelled call also gives `aborted` with the reason `cancelled`, and the gate does not run.

The result holds `status`, `wave`, `tasks`, `gate`, `held`, `remaining` and `rootAgentSwitch`.

## Configuration

The plugin reads `../rate-guard/config.json` at setup, in the folder of the rate-guard plugin. It uses the key `maxConcurrentHardSubagents`, a whole number from 1 to 10. The value sets how many child sessions with the `openai/hard` model can run at the same time.

The plugin logs a warning and uses the limit 2 in two cases. Either the file is missing or unreadable, or the key is not a whole number from 1 to 10.

The plugin has no other setting. The model of each tier and the timeouts come from the tool arguments.

## State

The plugin writes no file of its own. Its only state is the slot count of the semaphore in memory. The child sessions are ordinary opencode sessions, and the tasks edit the working tree.

## Installation

opencode loads plugins from `~/.config/opencode/plugins/<name>/`. The repository copy is `.opencode/plugins/implementer/`. The dependency `@opencode-ai/plugin` is declared in `.opencode/package.json`.

From the repository root, run these commands:

```bash
node lab/promote.mjs
node lab/promote.mjs --apply
```

The first command prints a preview and writes nothing. The second command copies the harness. See the section "Promote the harness" in the root `README.md`.

The plugin imports code from two other plugins. Promote copies them with the rest of the harness, so do not remove them:

- `rate-guard`: the semaphore, the limit loader and `config.json`.
- `mode-switch`: the code that switches the root session to `build`.

The plugin also reads the two templates of the skill `subagent-driven-development`. Promote skips `config.json` inside plugin folders, so a first install has no `rate-guard/config.json`. Copy it by hand as the `rate-guard` README describes. Without it, the plugin still works with the limit 2.

## Known limits

- The gate stops a timed-out proof command by sending only `SIGTERM` to its process group. It sends no stronger signal.
- The reviewer reads the change through `git diff` on the `writes` paths. The diff omits untracked files, so the prompt asks the reviewer to read each path in full.
- The tool runs at most 4 tasks per call. Call it again for the `remaining` tasks.
- Only a model that is exactly `openai/hard` takes a slot. Other models are not limited.
- A task whose third review still fails is `stopped`. The tool does not retry it in the same call.
- The gate does not run if no task reached `reviewed`.
- The gate compares changed paths with `writes` exactly. A task that edits another path makes the gate fail.

## Tests

```bash
node --test .opencode/plugins/implementer/*.test.ts
```

## Turning it off

Remove the folder `~/.config/opencode/plugins/implementer/` or move it out of `~/.config/opencode/plugins/`. The tool `implement_wave` then no longer exists.

Without the tool, the skill runs its Per-Wave Pipeline with the native `subagent` tool in the foreground, one task per wave, in plan order.
