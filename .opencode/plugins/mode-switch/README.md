# mode-switch

This plugin moves the root session to the `plan` agent before a design skill runs, and to `build` before an implementation skill runs. It also tells an approved root `plan` session to continue without waiting. Each switch also sets the model that the target agent uses, and it records a short notice in the session.

## Where it acts

It acts only in root sessions. A session with a `parentID` is a child session, and the plugin skips it. If the session lookup fails, the plugin also skips the session.

## What it hooks

- `tool` hook `execute.before`: it reads each `skill` tool call and switches the agent when the skill id has a target.
- `session` hook `context`: for a root session on the `plan` agent, it adds two system instructions to the turn.

## How it works

### Skill ids

Design skills switch the session to `plan`:

- `brainstorming`
- `brainstorming-standard`
- `brainstorming-committee`
- `brainstorming-skip`
- `work-on-ticket`

Implementation skills switch the session to `build`:

- `subagent-driven-development`
- `fast-path-implementation`

Any other skill id passes through without a switch.

### Switching

If the session already runs the target agent, the plugin reads the target agent and sets only its model. It switches no agent. It records a notice only on failure. If reading the target agent fails, the plugin records the failure notice. If setting the model fails, the plugin records the model failure notice. That notice still says `Switched to PLAN`, although no switch happened in this case.

Otherwise the plugin reads the target agent, switches the session to it, and sets the session model to the model that the target agent uses. It then records a transition notice.

If reading the target agent or switching to it fails, the plugin records the failure notice and stops. If setting the model fails after the agent change, the plugin records the model failure notice and no transition notice. The plugin never throws. If a notice cannot be recorded, the plugin drops it silently.

### Notices

A successful switch records a notice in the form `PLAN -> BUILD (subagent-driven-development)`, where the reason is the skill id. The notice does not resume the model.

Failure notices tell the user to switch by hand:

- `Mode switch to PLAN failed: <reason>. Press Tab to switch manually.`
- `Switched to PLAN but its model could not be set: <reason>. Press Tab to switch manually.`

The target name appears in upper case, for example `BUILD` when the target is `build`.

### Instructions in root plan turns

The `context` hook adds two system instructions to each turn of a root session on the `plan` agent. It adds nothing for other agents or for child sessions.

`DESIGN_ROOT_INSTRUCTION` tells the model that it is the design root on `openai/hard`. The model writes the design content itself, including the questions, alternatives, sections, committee agenda, summaries and revisions. It must not delegate that content to `stack-planner`.

`DESIGN_EXIT_INSTRUCTION` covers approval. If the user explicitly approves the design, before or after it is presented, the model continues its design skill without waiting. It saves the plan file. If the user's words choose implementation, the model loads `subagent-driven-development` in the same turn. Otherwise it asks the next-step question that the design skill defines. Without approval, the model waits. The instruction also states that the plugin moves the session to Build, so the model does not ask the user to switch agents.

## Installation

opencode loads plugins from `~/.config/opencode/plugins/<name>/`. The copy in this repository is `.opencode/plugins/mode-switch/`. The file `.opencode/package.json` declares the dependency `@opencode-ai/plugin`.

1. From the repository root, preview the install. This command writes nothing:

   ```bash
   node lab/promote.mjs
   ```

2. If the preview is correct, apply it:

   ```bash
   node lab/promote.mjs --apply
   ```

The plugin needs nothing else, and it has no configuration file to copy.

## Known limits

- The exit depends on the model following `DESIGN_EXIT_INSTRUCTION`. The plugin does not check the approval itself.
- The exit needs explicit approval with words that choose implementation. The code does not define this test. The intended reading is that a generic phrase such as "choose the recommended option" does not count.
- The plugin decides only from the skill id. It does not read the conversation.
- The instruction text names `openai/hard` and `stack-planner`, so the wording fits only that setup.
- The `context` hook adds instructions only while the session runs `plan`.
- If the agent switch fails, the session stays on its current agent. If the model setting fails after the agent change, the session stays on the target agent with its model not set.
- Each switch sets the model of the target agent, so the session model changes with the agent.

## Tests

```bash
node --test .opencode/plugins/mode-switch/index.test.ts
```

## Turning it off

Remove the folder `~/.config/opencode/plugins/mode-switch/`, or move it out of `~/.config/opencode/plugins/`.
