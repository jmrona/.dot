---
name: todo-lists
description: How to plan, structure and maintain the session todo list with todowrite, including a two-level numbering convention for sub-items, how to add sub-items mid-task, and how to lay out waves of parallel tasks. Use this whenever a task needs more than a couple of steps, whenever you are about to call todowrite, whenever you finish a step and need to update progress, and whenever new sub-steps appear while you are already working. Also use it when the user asks to break a task down, to add sub-tasks, or to show the plan.
license: MIT
compatibility: opencode
---

# Working with the session todo list

## What the tool actually is

`todowrite` takes the full list and replaces the previous one. There is no partial update,
no per-item patch, and no nesting. Each todo is a flat record of `content` and `status`.
It has no `id`. The sidebar renders the array in order and is read-only for the user.

Four facts drive everything below:

1. Every change is a full rewrite. To flip one status, you resend all items.
2. Hierarchy only exists in the text. Sub-items are ordinary items whose `content` encodes
   the relationship.
3. The sidebar builds the list from the last completed `todowrite` call in the session
   messages. A revert rolls the list back together with the messages.
4. The tool exists only when `opencode.json` sets `"experimental": { "todo": true }`. If
   `todowrite` is not available, keep a numbered checklist in your replies instead.

After a compaction or an interruption, rebuild the list from the compaction summary or the
plan file. Then send it again in full.

## Content stays short

Write `content` as one line that names the step. File lists, acceptance criteria and
dependencies belong in the plan file, not in `content`.

## Numbering convention

Encode the hierarchy in `content` with a stable numeric path and a `└─` marker on children:

```
1. Replace the FTE renderer entry point
└─ 1.1 Map current entry-point call sites
└─ 1.2 Add the island resolver
└─ 1.3 Delete the legacy shim
2. Update the edge cache keys
```

Rules:

- Use two levels at most. If a sub-item needs its own breakdown, make it a top-level item.
- The number is a permanent label, not a position. Never renumber an existing item, because
  rewriting the number rewrites its `content` (see *Rewriting safely*). A new child takes
  the highest number ever used under that parent, plus one. If `1.2` was cancelled, the
  next child is `1.4`.
- Placement is logical and free. Position in the array only decides render order, so put a
  new child immediately after the sibling it follows from. Numbers can therefore run out
  of sequence (`1.1, 1.2, 1.4, 1.3`), and that is harmless.
- Keep children contiguous and directly after their parent.

## Status rules

`status` is one of `pending`, `in_progress`, `completed`, `cancelled`.

- Only one item in the whole list can be `in_progress`. The exception is the active wave
  (see *Waves*).
- Parents never carry `in_progress`. A parent stays `pending` while its children are being
  worked on. It becomes `completed` once every child is `completed` or `cancelled`. The
  `in_progress` marker sits on the leaf you are touching.
- A parent with no children behaves like any leaf and can be `in_progress`.
- Mark `completed` only after the work is verified: the tests pass, the file compiles, the
  command exits clean. If verification fails, leave the item `in_progress` and add a child
  for the fix.
- Use `cancelled` for work that turned out to be unnecessary. It stays visible as a record
  of the decision. Remove an item from the array only if it never applied.

## Rewriting safely

An item has no `id`, so its identity is its `content` string and its position.

- Never reword an existing `content` while changing its status. A changed string reads as
  a delete plus an insert and loses the item's history in the panel.
- If the wording became wrong, reword it on its own turn.
- Resend items that you do not touch byte-for-byte identical.

## Adding sub-items mid-task

A step usually reveals its own sub-steps once you start it. When that happens:

1. Take the current list as it is.
2. Insert the new children directly after the item that produced them, inside the
   parent's block. Number them from the highest number ever used under that parent.
3. Leave every other item untouched: same `content`, same numbers, same statuses, same
   relative order.
4. Call `todowrite` with the complete list.

If discovery turns a leaf into a parent, keep the leaf's own number and text. Move its
`in_progress` down onto the first new child, and set the parent back to `pending`.

## Waves

The `subagent-driven-development` skill groups independent tasks into waves of up to 4
parallel implementers. Each wave then runs a gate, a user checkpoint and commits. Lay the
list out as follows:

- Each wave is a top-level parent: `W1. Wave 1: <short goal>`, `W2. Wave 2: <short goal>`.
- Its tasks are children with the usual marker: `└─ 1.1 <task>`, `└─ 1.2 <task>`. The
  numbers are the wave number and the task number.
- The last child of each wave is `└─ 1.N Gate, checkpoint and commits`.
- Write the whole wave plan as one `todowrite` call before the first dispatch.

Status rules for waves:

- You can mark several `in_progress` children within the active wave at the same time,
  one for each task whose implementer is running.
- Outside the active wave, at most one item is `in_progress`.
- A wave parent never carries `in_progress`.
- A task child becomes `completed` when its reviewer returns `[PASS]`.
- The gate child becomes `in_progress` when the gate starts. It becomes `completed` after
  the commits, or after the checkpoint when the user skips the commit.
- The wave parent becomes `completed` together with its gate child.
- A task that the user stops becomes `cancelled`.

Only the orchestrator (the parent session) calls `todowrite`. Subagents report back, and
the orchestrator updates the list.

## Workflow

1. Plan before acting for anything over three steps, or when the user asks for a plan.
   Write top-level items only, and do not invent sub-items that you cannot yet justify.
2. Mark `in_progress` before you start a step, never after.
3. Update immediately after you finish each step, before you start the next one. Use a
   single `todowrite` call that completes the finished item and starts the next.
4. After a compaction or an interruption, rebuild the list as described above and send it
   in full.
5. Complete or cancel every item at the end. Do not leave dangling `pending` items when the
   work is done. Say why you cancelled what is no longer relevant.

Skip the list for single-step or purely conversational requests. A one-item list is noise.

## Worked example

Starting a task that has just revealed sub-steps:

```json
{
  "todos": [
    { "content": "1. Replace the FTE renderer entry point", "status": "pending" },
    { "content": "└─ 1.1 Map current entry-point call sites", "status": "completed" },
    { "content": "└─ 1.2 Add the island resolver", "status": "in_progress" },
    { "content": "└─ 1.3 Delete the legacy shim", "status": "pending" },
    { "content": "2. Update the edge cache keys", "status": "pending" }
  ]
}
```

Then `1.2` finishes and needs a regression test. One call does all of it:

```json
{
  "todos": [
    { "content": "1. Replace the FTE renderer entry point", "status": "pending" },
    { "content": "└─ 1.1 Map current entry-point call sites", "status": "completed" },
    { "content": "└─ 1.2 Add the island resolver", "status": "completed" },
    { "content": "└─ 1.4 Cover the resolver with a regression test", "status": "in_progress" },
    { "content": "└─ 1.3 Delete the legacy shim", "status": "pending" },
    { "content": "2. Update the edge cache keys", "status": "pending" }
  ]
}
```

The new item sits next to the `1.2` that produced it. It is numbered `1.4` because `1.3`
already exists. The out-of-order numbering is correct: `1.3` keeps its number and its text,
so it stays the same item for the panel.

## Worked example with waves

Wave 1 is running with two tasks in progress, and wave 2 is pending:

```json
{
  "todos": [
    { "content": "W1. Wave 1: API actions", "status": "pending" },
    { "content": "└─ 1.1 Add the campaign query action", "status": "in_progress" },
    { "content": "└─ 1.2 Add the audit log entry", "status": "in_progress" },
    { "content": "└─ 1.3 Gate, checkpoint and commits", "status": "pending" },
    { "content": "W2. Wave 2: Platform view", "status": "pending" },
    { "content": "└─ 2.1 Add the campaign page", "status": "pending" },
    { "content": "└─ 2.2 Gate, checkpoint and commits", "status": "pending" }
  ]
}
```

The reviewer for `1.1` returns `[PASS]`. The next call completes `1.1` and leaves the rest
untouched:

```json
{
  "todos": [
    { "content": "W1. Wave 1: API actions", "status": "pending" },
    { "content": "└─ 1.1 Add the campaign query action", "status": "completed" },
    { "content": "└─ 1.2 Add the audit log entry", "status": "in_progress" },
    { "content": "└─ 1.3 Gate, checkpoint and commits", "status": "pending" },
    { "content": "W2. Wave 2: Platform view", "status": "pending" },
    { "content": "└─ 2.1 Add the campaign page", "status": "pending" },
    { "content": "└─ 2.2 Gate, checkpoint and commits", "status": "pending" }
  ]
}
```

## Constraints

- The list lives in the session. It does not survive into a new session, so anything that
  must outlive the session belongs in a file or an issue tracker.
- Nothing outside the agent writes to the list.
