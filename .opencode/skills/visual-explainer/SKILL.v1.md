---
name: visual-explainer
description: Turns a described flow, sequence, architecture, repo/file structure, state machine, or other structural concept into an inline SVG or a self-contained HTML page, and delivers it portably across Claude Code and OpenCode. Use this whenever another skill (e.g. `explain`, `ticket-coach`) or the user directly needs a diagram, flow chart, architecture sketch, or interactive visual to accompany a text explanation — don't build one ad hoc. Triggers on "diagram this", "visualise this", "show me the flow", "draw the architecture", or when a calling skill has already decided a visual would help and needs one produced and shown. Also owns Tour mode, the multi-stop interactive HTML page format that `code-tour` renders its walkthroughs into.
---

# Visual Explainer

This skill doesn't decide *whether* a visual is warranted — that's the calling context's job. A skill like `explain` or `ticket-coach` already knows the topic, the user's cognitive profile, and the conversation, so it's better placed to judge that than a skill with no context of its own. What this skill does is take a description of what needs depicting and turn it into an actual, deliverable visual: it decides the *format*, produces the *content*, and handles *delivery* so it genuinely works in whichever environment (Claude Code or OpenCode) it's running in.

## The house style comes first

**Before writing any HTML or SVG, read `~/.config/opencode/skills/_shared/design-system.md`.** If that file exists it is authoritative and not optional: its colour tokens, CSS baseline, component markup, SVG conventions and script are taken verbatim, and this skill supplies only the content that goes inside them. Do not restyle, do not substitute a framework, and do not adjust the palette to suit the subject. Consistency between pages is the whole point, so a visual that is individually prettier but different is a regression.

If the file is absent, fall back to the guidance in this skill and say so when handing the result back, so the caller knows the output will not match previous pages.

## Two modes

- **Single-visual mode** (the default, and everything below unless stated otherwise): one diagram accompanying someone else's prose. Even here, take the colour tokens and the SVG conventions from the design system so a standalone diagram sits alongside a tour page without clashing.
- **Tour mode**: a complete multi-stop walkthrough rendered as one self-contained interactive HTML page. Only `code-tour` invokes this, and it hands over finished content rather than a description to draw from. Jump to "Tour mode" below; the format and delivery rules there replace the single-visual ones.

## What to hand this skill

Whoever invokes it — a calling skill, or a direct user request — should provide:
- **What's being depicted**: a short structured description is enough — the parts/steps/nodes involved and how they relate (a sequence, a tree, a set of states and transitions, a before/after comparison). It doesn't need to be a finished diagram spec, just enough to draw from.
- **Whether it needs interaction** (expandable, clickable, hoverable) or a static picture is enough. If this isn't stated, default to static.
- **Concrete names from the project** wherever they exist — file paths, function names, service names, ticket IDs. Abstract placeholder labels ("Node A", "Step 1") make for a forgettable diagram; use real names whenever they're available, the same principle `explain` already applies to its own prose examples.

## Choosing the format

- **SVG** — the default, for anything static: a flow, a small sequence, an architecture sketch, a before/after comparison, a state machine with a handful of states. Prefer this unless there's a concrete reason not to — it's the simplest option to produce and to reason about.
- **HTML** (inline CSS, and inline JS only where it's genuinely earning its place — e.g. a collapsible tree for exploring a repo's structure, a hover tooltip on a diagram node, a clickable step-through) — reach for this only when the visual genuinely needs interaction a static SVG can't express. Don't reach for HTML just because it's more capable in the abstract; a static SVG that's good enough beats an HTML page that wasn't necessary.

This choice is only about *what* to build. *How it gets shown* is a separate decision below, and doesn't map onto SVG-vs-HTML the way it might seem to.

## Delivering it portably

This is where environments genuinely differ, but **not along the SVG-vs-HTML line** — a plain terminal can't render an SVG inline any more than it can render an HTML page; both are just characters to it. What actually matters is whether the current environment can render rich content inline *at all*.

- **Check whether a rich-rendering mechanism is available** — concretely, the `Artifact` tool (Claude Code) or an equivalent widget/rendering tool in this environment. Its presence is a reliable signal you're in a graphical chat surface, not a plain terminal.
  - **If available** → for SVG, write the raw markup directly into the reply — it renders inline. For HTML, use the `Artifact` tool instead (load the `artifact-design` skill first, per that tool's own instructions, to calibrate the design before writing the page) — it renders the page directly and is shareable, strictly better than a bare file when it's an option.
  - **If not available** — this includes OpenCode's TUI, and any plain-terminal session generally (a bare Claude Code CLI session included, not just OpenCode) — **neither format can go inline, regardless of which one you picked.** Write it to a real file on disk either way:
    - **Always use a fixed, absolute location, never a path relative to whatever the current working directory happens to be.** Use `~/.config/opencode/data/visual-explainer/` (in the user's `$HOME`, independent of the project/repo currently open) — the same pattern `ticket-coach` and `cognitive-profile` already use for their own generated files, so it's one predictable place regardless of which project the user is in when they ask. Create the directory if it doesn't exist yet. Name the file descriptively (e.g. `docker-api-workflow.svg`), not something generic like `output.html`.
    - **State the full absolute path in your reply, as plain text, and stop there** — e.g. `/Users/jose.romero/.config/opencode/data/visual-explainer/docker-api-workflow.svg` — never just the filename or a path relative to cwd (`explain-visuals/foo.svg` on its own is not enough; the user has no way to know what directory that's relative to). This is the actual bug that prompted this note: a relative-looking path with no anchor is as unusable as not saying where the file is at all.
    - **Don't try to open the file yourself** (no `open`/`xdg-open`/`start` command). Terminals that recognise file paths (Warp does, for instance — Cmd/Ctrl-click on a detected path opens it directly) make the plain absolute path itself clickable, and letting the user open it themselves is simpler and more reliable than a shell-out that may run in a context without a GUI session to hand off to.

## Tour mode

Invoked by `code-tour` only. The caller hands over the finished tour content (its `tour.md`), the ordered list of stops, the diagram each stop needs, and an absolute output path. Your job is the page, not the content: do not rewrite, shorten or reorder the caller's prose, and do not invent stops it did not give you.

The output is **one self-contained `.html` file** at the path the caller specified, built on the design system. `_shared/design-system.md` owns the page: the token set, the CSS baseline, the sticky navigation, the progress rail, the cover, the stop section, the analogy rail, the map panel, the route stepper, the rule callout, the path copy chips, the code blocks, the checkpoint accordions, the closing section, the counter, the SVG conventions and the script. Read it and use it verbatim.

What is left to you here is the mapping from the caller's content onto those components, and the diagrams themselves.

### Mapping content onto the page

- The caller's stops become `section.stop` elements, in the caller's order, each with a stable `id` used by both the navigation and the URL fragment.
- Each stop's six parts map straight onto the catalogue: **why it exists** and **the map** are the two bolded lead-in paragraphs, the **analogy** is `p.analogy` where the caller supplied one, the **route** is the `.route` stepper, the **rules** are `.rule`, and the **checkpoint** is the `<details>` accordion, closed.
- Every repository path in the caller's content is wrapped in `.path-wrap` with a copy chip, `data-copy` matching the visible text exactly.
- The cover takes the caller's orientation paragraph as the lede and its facts as the pill row: stop count, reading time, area covered, depth.
- The closing section takes the caller's "where to go next" content unchanged.

Do not rewrite, shorten or reorder the caller's prose to fit a component. If something genuinely does not fit, say so when handing back rather than editing the content silently.

### Diagrams

The design system fixes the shapes, strokes, labels, markers and highlight behaviour. What you decide per stop is what the diagram depicts:

- One diagram per stop, showing what that stop's route moves through, and nothing else. A diagram of the whole system repeated at every stop teaches nothing.
- Every node that corresponds to a route step carries a `data-node` namespaced to the stop, so the stepper can highlight it.
- Nodes carry the **real names** the caller gave you. A tour diagram labelled "Service A" has failed.
- Keep the shape vocabulary constant across the page and introduce it in the legend under the first diagram.

### Before delivering

Run the design system's own verification checklist (section 14). It covers offline rendering, both colour schemes, contrast on any new pairing, unique SVG marker ids, `data-node` and `data-copy` integrity, keyboard reach, print and reduced motion. Do not substitute a lighter check of your own.

### Delivering a tour page

Write it to the absolute path the caller gave, create the parent directories if needed, and return that path. Do **not** use the `~/.config/opencode/data/visual-explainer/` location for tour pages: tours are owned by `code-tour` and live under its own directory so its freshness check can find them.

If a rich-rendering mechanism is available (the `Artifact` tool or an equivalent), still write the file first so the stored tour exists, then also render it. The file is the artefact of record.

## Handing the result back

If invoked by another skill rather than directly by the user, return what was produced — the SVG markup, or the file path / Artifact link — so the calling skill can present it alongside its own explanation. The visual is always additive: it accompanies the calling skill's text, never replaces it.
