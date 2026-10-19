---
name: todo-lists
description: How to plan, structure and maintain the session todo list with todowrite/todoread, including a two-level numbering convention for sub-items and how to add sub-items mid-task. Use this whenever a task needs more than a couple of steps, whenever you are about to call todowrite, whenever you finish a step and need to update progress, and whenever new sub-steps appear while you are already working. Also use it when the user asks to break a task down, to add sub-tasks, or to show the plan.
license: MIT
compatibility: opencode
---

# Working with the session todo list

## What the tool actually is

`todowrite` takes the **full list** and replaces it. There is no partial update, no
per-item patch, and no nesting: each todo is a flat record of `content`, `status` and
`priority`. The sidebar renders that array in order and is read-only for the user.

Two consequences drive everything below:

1. **Every change is a full rewrite.** To flip one status you resend all items.
2. **Hierarchy only exists in the text.** Sub-items are ordinary items whose `content`
   encodes the relationship.

## Numbering convention

Encode the hierarchy in `content` with a stable numeric path and a `└─` marker on
children:

```
1. Replace the FTE renderer entry point
└─ 1.1 Map current entry-point call sites
└─ 1.2 Add the island resolver
└─ 1.3 Delete the legacy shim
2. Update the edge cache keys
```

Rules:

- **Two levels maximum.** If a sub-item needs its own breakdown, it should have been a
  top-level item.
- **The number is a permanent label, not a position.** Never renumber an existing item:
  its number is its handle, and rewriting it rewrites its `content` (see *Rewriting
  safely*). A new child takes the highest number ever used under that parent, plus one —
  so if `1.2` was cancelled, the next child is `1.4`.
- **Placement is logical and free.** Position in the array only decides render order, so
  put a new child immediately after the sibling it follows from, not at the end of the
  group. Numbers may therefore run out of sequence (`1.1, 1.2, 1.4, 1.3`); that is
  expected and harmless.
- Keep children **contiguous and directly after their parent**.
- Children inherit the parent's `priority` unless there is a real reason to differ.

## Status rules

`status` is one of `pending`, `in_progress`, `completed`, `cancelled`.

- **Only one item in the whole list may be `in_progress`.** Multiple in-progress items are
  rejected or flagged.
- **Parents never carry `in_progress`.** A parent stays `pending` while its children are
  being worked on, and flips to `completed` once every child is `completed` or
  `cancelled`. The `in_progress` marker always sits on the leaf you are actually touching.
- A parent with no children behaves like any leaf and may be `in_progress`.
- Mark `completed` only after the work is **verified** — tests pass, the file compiles, the
  command exits clean. If verification fails, leave it `in_progress` and add a child for
  the fix.
- Use `cancelled` for work that turned out to be unnecessary; it stays visible as a record
  of the decision. Remove an item from the array only if it was a mistake that never
  applied.

## Rewriting safely

Because the schema has no `id` in current versions, an item's identity is effectively its
`content` string and its position.

- **Never reword an existing `content` while changing its status.** A changed string reads
  as a delete plus an insert and loses the item's history in the panel.
- Reword deliberately and on its own turn if the wording genuinely became wrong.
- Resend items you are not touching **byte-for-byte identical**.

## Adding sub-items mid-task

This is expected, not exceptional: a step usually reveals its own sub-steps once you start
it. When that happens:

1. Take the current list as-is.
2. Insert the new children where they belong — directly after the item that produced them,
   inside the parent's block — and number them from the highest number ever used under
   that parent.
3. Leave every other item untouched: same `content`, same numbers, same statuses, same
   relative order.
4. Call `todowrite` with the complete list.

If discovery turns a leaf into a parent, keep the leaf's own number and text, move its
`in_progress` down onto the first new child, and set the (now) parent back to `pending`.

## Workflow

1. **Plan before acting** for anything over three steps, or when the user asks for a plan.
   Write top-level items only; do not invent sub-items you cannot yet justify.
2. **Mark `in_progress` before starting** a step, never after.
3. **Update immediately after finishing** each step, before starting the next one, in a
   single `todowrite` call that both completes the finished item and starts the next.
4. **Re-read with `todoread`** after a compaction, an interruption, or any point where you
   are unsure the list still reflects reality — the panel can display a stale list the
   agent is no longer tracking.
5. **Clear or complete the list at the end.** Do not leave dangling `pending` items when
   the work is done; cancel what is no longer relevant and say why.

Skip the list entirely for single-step or purely conversational requests. A one-item todo
list is noise.

## Worked example

Starting a task that has just revealed sub-steps:

```json
{
  "todos": [
    { "content": "1. Replace the FTE renderer entry point", "status": "pending", "priority": "high" },
    { "content": "└─ 1.1 Map current entry-point call sites", "status": "completed", "priority": "high" },
    { "content": "└─ 1.2 Add the island resolver", "status": "in_progress", "priority": "high" },
    { "content": "└─ 1.3 Delete the legacy shim", "status": "pending", "priority": "high" },
    { "content": "2. Update the edge cache keys", "status": "pending", "priority": "medium" }
  ]
}
```

Then `1.2` finishes and turns out to need a regression test — one call does all of it:

```json
{
  "todos": [
    { "content": "1. Replace the FTE renderer entry point", "status": "pending", "priority": "high" },
    { "content": "└─ 1.1 Map current entry-point call sites", "status": "completed", "priority": "high" },
    { "content": "└─ 1.2 Add the island resolver", "status": "completed", "priority": "high" },
    { "content": "└─ 1.4 Cover the resolver with a regression test", "status": "in_progress", "priority": "high" },
    { "content": "└─ 1.3 Delete the legacy shim", "status": "pending", "priority": "high" },
    { "content": "2. Update the edge cache keys", "status": "pending", "priority": "medium" }
  ]
}
```

The new item sits next to the `1.2` it came out of, and is numbered `1.4` because `1.3`
already exists. Out-of-order numbering is the correct outcome here: `1.3` keeps its number
and its text, so it stays the same item as far as the panel is concerned.

## Constraints worth remembering

- Sub-agents cannot call `todowrite` or `todoread`; they are denied by default. Keep the
  list in the parent session and update it there when a delegated task returns.
- The list lives in the session. It does not survive into a new session, so anything that
  must outlive the session belongs in a file or an issue tracker, not here.
- The HTTP API exposes only `GET /session/:id/todo`. Nothing outside the agent can write
  to the list.
