---
name: visual-explainer
description: Turns a described flow, sequence, architecture, repo/file structure, state machine, or other structural concept into an inline SVG, an animated canvas, or a self-contained interactive HTML page, and delivers it portably across Claude Code and OpenCode. Use this whenever another skill (e.g. `explain`, `ticket-coach`) or the user directly needs a diagram, flow chart, architecture sketch, or interactive visual to accompany a text explanation — don't build one ad hoc. Triggers on "diagram this", "visualise this", "show me the flow", "draw the architecture", or when a calling skill has already decided a visual would help and needs one produced and shown. Also owns Tour mode, the multi-stop interactive HTML page format that `code-tour` renders its walkthroughs into.
---

# Visual Explainer

This skill doesn't decide *whether* a visual is warranted — that's the calling context's job. A skill like `explain` or `ticket-coach` already knows the topic, the user's cognitive profile, and the conversation, so it's better placed to judge that than a skill with no context of its own. What this skill does is take a description of what needs depicting and turn it into an actual, deliverable visual: it decides the *format*, produces the *content*, and handles *delivery* so it genuinely works in whichever environment (Claude Code or OpenCode) it's running in.

**Version 2.** The previous version is kept alongside this file as `SKILL.v1.md`. It has no canvas layer: the page is static SVG plus the route stepper. If v2's interactive canvases turn out to be more trouble than they're worth, `cp SKILL.v1.md SKILL.md` reverts cleanly — nothing else in the pack depends on the canvas layer existing.

## The house style comes first

**Before writing any HTML, SVG or canvas code, read `../_shared/design-system.md`.** If that file is installed it is authoritative and not optional: its colour tokens, CSS baseline, component markup, SVG conventions, canvas contract and script are taken verbatim, and this skill supplies only the content that goes inside them. Do not restyle, do not substitute a framework, and do not adjust the palette to suit the subject. Consistency between pages is the whole point, so a visual that is individually prettier but different is a regression.

If the file is absent, fall back to the guidance in this skill and say so when handing the result back, so the caller knows the output won't match previous pages.

## Two modes

- **Single-visual mode** (the default): one diagram accompanying someone else's prose. Take the colour tokens and the SVG conventions from the design system so a standalone diagram sits alongside a tour page without clashing. A single visual is almost always an SVG; reach for canvas here only if the thing genuinely needs to move or be manipulated.
- **Tour mode**: a complete multi-stop walkthrough rendered as one self-contained interactive HTML page. Only `code-tour` invokes this, and it hands over finished content rather than a description to draw from. Jump to "Tour mode" below; the format and delivery rules there replace the single-visual ones.

## What to hand this skill

Whoever invokes it — a calling skill, or a direct user request — should provide:
- **What's being depicted**: a short structured description is enough — the parts/steps/nodes involved and how they relate (a sequence, a tree, a set of states and transitions, a before/after comparison). It doesn't need to be a finished diagram spec, just enough to draw from.
- **Whether it needs interaction** (expandable, clickable, hoverable) or a static picture is enough. If this isn't stated, default to static.
- **Concrete names from the project** wherever they exist — file paths, function names, service names, ticket IDs. Abstract placeholder labels ("Node A", "Step 1") make for a forgettable diagram; use real names whenever they're available, the same principle `explain` already applies to its own prose examples.

## Choosing the format

Three options, in increasing order of cost. Pick the cheapest one that does the job.

- **SVG** — the default, for anything static: a flow, a small sequence, an architecture sketch, a before/after comparison, a state machine with a handful of states. Prefer this unless there's a concrete reason not to — it's the simplest to produce, it's accessible for free, it prints, and it scales.
- **Canvas** — for the things SVG genuinely can't do: something moving along a path over time, a state the reader manipulates, a value transforming step by step, a timeline the reader scrubs. See "The canvas catalogue" below, which is the whole test for whether canvas is warranted.
- **HTML** (inline CSS, and inline JS only where it's genuinely earning its place) — the container for either of the above when the visual needs page structure around it: a collapsible tree, a stepper, a multi-stop tour.

This choice is only about *what* to build. *How it gets shown* is a separate decision below, and doesn't map onto the SVG/canvas/HTML split the way it might seem to.

## The canvas catalogue

Canvas is a tool, not a slot in the page. There is no fixed place a canvas belongs and no requirement that a page have one. Reach for it wherever it earns its place, and nowhere else.

**The test, and it is the whole test: does this show something a static picture cannot?** Motion that only decorates is noise, and on a page someone is trying to learn from, noise is worse than nothing. If you can't name what the movement teaches, use an SVG.

Failing the test, always: pretty particle fields, floating shapes behind the text, a logo assembling itself, a network graph that drifts, anything described as "ambient". Reject these even when they'd look impressive. A tour page is read, not watched.

### 1. The flow simulator

**The main event, and for most tours the only canvas on the page.** It sits in the closing section, after the stops, as the recap: the whole route running end to end, under the reader's control.

- Transport controls — play, pause, next, back, reset. Play dwells at each node long enough to read, then stops. It never loops.
- Each node shows what arrived and what left, in the repository's own vocabulary.
- Clicking a node arms it to fail. The run halts there, everything downstream is marked never reached, and the panel shows **the real error that node returns**.
- Every payload and every error names the file it came from.

This one component replaces what were previously four: a sticky spine at the top, a separate payload walker, a separate break-it mode, and a separate replay. They were four views of one simulation, and building them separately produced four half-finished widgets that each needed their own explaining. A sticky top canvas in particular was a mistake: it sat in the reader's peripheral vision for the whole page, fought every other sticky element for offsets, and meant nothing before the reader knew what the nodes were.

The full specification, including the markup, is section 8.3 of the design system. Two things in it are not negotiable and are the usual failure modes:

- **The step data ships as markup, not as a JavaScript array.** That is what makes the page work without JS, print completely, and stay readable to assistive technology.
- **No invented failure states.** A node with no error response found in the code is disabled, not breakable. A plausible-looking made-up 500 is worse than no interaction at all, because the reader will quote it back.

Build it whenever the tour follows something through a sequence of components and the caller supplied per-node payloads. Skip it when the tour surveys a layout rather than following a route: there is nothing to run.

### 2. Timeline lanes

One horizontal lane per unit, time running left to right, bars showing when each is active, with a playhead the reader can scrub.

Use this **in place of** the simulator's single row, not alongside it, whenever the flow has anything asynchronous or parallel in it. A row of nodes doesn't merely omit that, it actively asserts something false: that each step waits for the last. The moment worth showing is usually the one where the user already has a response and a worker is still going. Everything else from the simulator still applies: the same controls, the same DOM-first data, the same sourced payloads.

Skip it for strictly sequential flows, where it costs a lot and says the same thing as a row of nodes.

### 3. Code linked to diagram

Hovering a line in a code fragment highlights the node it corresponds to, and hovering a node highlights its lines.

No animation, no canvas needed — this is SVG plus a few event listeners, and it's in this catalogue because it solves the same problem cheaply. Every stop has a code fragment and a diagram sitting next to each other with nothing connecting them; this connects them. Build it whenever a stop has both.

### Rules that apply to every canvas

- **It never carries information that isn't also in the prose, in a stop's SVG, or in the simulator's own step list.** A canvas is opaque to screen readers and absent from a printout. Treat it as an amplifier of content that already exists in an accessible form, never as the only place something is said.
- **It never replaces the per-stop SVG diagrams.** Those stay. The canvas is an additional layer.
- **It uses the same visual vocabulary** as the SVGs: same shapes, same colour roles, same real names on the nodes.
- **Every interaction has a real button behind it.** The canvas click is always a shortcut for a control that exists in the DOM.
- The technical contract — pixel ratio, reading colour tokens, colour-scheme changes, reduced motion, printing, hit testing — is in the design system's canvas section. Follow it exactly.

## Delivering it portably

This is where environments genuinely differ, but **not along the SVG/canvas/HTML line** — a plain terminal can't render any of them inline; all three are just characters to it. What actually matters is whether the current environment can render rich content inline *at all*.

- **Check whether a rich-rendering mechanism is available** — an artifact or widget tool that renders content directly in the chat surface. Its presence is a reliable signal you're in a graphical chat surface, not a plain terminal.
  - **If available** → for SVG, write the raw markup directly into the reply — it renders inline. For canvas or HTML, use the rendering tool, following whatever setup instructions that tool documents — it renders the page directly and is shareable, strictly better than a bare file when it's an option.
  - **If not available** — this includes OpenCode's TUI, and any plain-terminal session generally (a bare Claude Code CLI session included, not just OpenCode) — **nothing can go inline, regardless of which format you picked.** Write it to a real file on disk either way:
    - **Always use a fixed, absolute location, never a path relative to whatever the current working directory happens to be.** Use `~/.config/opencode/data/visual-explainer/` (in the user's `$HOME`, independent of the project/repo currently open) — the same pattern `ticket-coach` and `cognitive-profile` already use for their own generated files, so it's one predictable place regardless of which project the user is in when they ask. Create the directory if it doesn't exist yet. Name the file descriptively (e.g. `docker-api-workflow.svg`), not something generic like `output.html`.
    - **State the full absolute path in your reply, as plain text, and stop there** — e.g. `/home/you/.config/opencode/data/visual-explainer/docker-api-workflow.svg` — never just the filename or a path relative to cwd (`explain-visuals/foo.svg` on its own is not enough; the user has no way to know what directory that's relative to). This is the actual bug that prompted this note: a relative-looking path with no anchor is as unusable as not saying where the file is at all.
    - **Don't try to open the file yourself** (no `open`/`xdg-open`/`start` command). Terminals that recognise file paths make the plain absolute path itself clickable, and letting the user open it themselves is simpler and more reliable than a shell-out that may run in a context without a GUI session to hand off to.

## Tour mode

Invoked by `code-tour` only. The caller hands over the finished tour content (its `tour.md`), the ordered list of stops, the diagram each stop needs, an absolute output path, and — where it has them — the extra fields the canvas mechanics need. Your job is the page, not the content: do not rewrite, shorten or reorder the caller's prose, and do not invent stops it did not give you.

The output is **one self-contained `.html` file** at the path the caller specified, built on the design system. `../_shared/design-system.md` owns the page: the token set, the CSS baseline, the sticky navigation, the cover, the stop section, the analogy rail, the map panel, the route stepper, the rule callout, the path copy chips, the code blocks, the checkpoint accordions, the closing section, the counter, the SVG conventions, the canvas contract and the script. Read it and use it verbatim.

What is left to you here is the mapping from the caller's content onto those components, the diagrams, and which canvas mechanics the content actually supports.

### Mapping content onto the page

- The caller's stops become `section.stop` elements, in the caller's order, each with a stable `id` used by the navigation and the URL fragment.
- Each stop's six parts map straight onto the catalogue: **why it exists** and **the map** are the two bolded lead-in paragraphs, the **analogy** is `p.analogy` where the caller supplied one, the **route** is the `.route` stepper, the **rules** are `.rule`, and the **checkpoint** is the `<details>` accordion, closed.
- **Chapters.** When the caller's content is grouped into chapters, wrap each group in `section.chapter` with its head, drop the stop titles inside to `h3` (keeping `class="stop-title"`), group the navigation links under a `.nav-group` label per chapter, and segment the simulator so each chapter's nodes sit together under the chapter name. Stop numbering still runs straight through the page.
- Every repository path in the caller's content is wrapped in `.path-wrap` with a copy chip, `data-copy` matching the visible text exactly.
- The cover takes the caller's orientation paragraph as the lede and its facts as the pill row: stop count, reading time, area covered, depth.
- The closing section takes the caller's "where to go next" content unchanged.

Do not rewrite, shorten or reorder the caller's prose to fit a component. If something genuinely does not fit, say so when handing back rather than editing the content silently.

### Choosing the mechanics for this particular tour

Decide from what the caller actually supplied, not from what would be impressive. Each mechanic has a precondition, and a mechanic whose precondition isn't met is not built:

| Mechanic | Build it when | Skip it when |
|---|---|---|
| Flow simulator | The tour follows one thing through a sequence, and the caller gave an ordered node list with per-node in/out payloads | The tour surveys a layout rather than following a route, or no payloads were supplied |
| Simulator: breakable nodes | The caller supplied that node's real error response, with its source file | It didn't. Disable that node rather than inventing a failure |
| Timeline lanes | Any part of the flow is asynchronous or parallel. Replaces the simulator's single row | The flow is strictly sequential |
| Code linked to diagram | A stop has both a code fragment and a diagram | Always build it when the precondition holds; it's nearly free |

When a precondition isn't met, say so in your hand-back so the caller knows what extra material would unlock it next time. Don't silently degrade and don't fabricate the missing data.

### Diagrams

The design system fixes the shapes, strokes, labels, markers and highlight behaviour. What you decide per stop is what the diagram depicts:

- One diagram per stop, showing what that stop's route moves through, and nothing else. A diagram of the whole system repeated at every stop teaches nothing; the closing simulator is where the whole route belongs.
- Every node that corresponds to a route step carries a `data-node` namespaced to the stop, so the stepper can highlight it.
- Nodes carry the **real names** the caller gave you. A tour diagram labelled "Service A" has failed.
- Keep the shape vocabulary constant across the page and introduce it in the legend under the first diagram.

### Before delivering

Run the assembly and verification steps above, then the design system's own verification checklist (section 15). It covers offline rendering, both colour schemes, contrast on any new pairing, unique SVG marker ids, `data-node` and `data-copy` integrity, keyboard reach, print, reduced motion and the canvas-specific checks. Do not substitute a lighter check of your own.

### Assembling the file without truncating it

A finished tour page is tens of kilobytes. **Do not emit it in a single write.** A large single write is the one failure that loses the whole job: the output is cut off mid-element, and every subsequent repair attempt makes it worse, because a patch cannot match against text that was never written.

Build it in passes, each a separate write:

1. **The shell.** Doctype, head, the entire CSS baseline, the cover, the empty navigation, the empty closing section, the empty simulator with its `.sim-steps` container, the full script, and `</body></html>`. **The document is valid and complete from this point on.** Everything after is insertion into a working page.
2. **One stop per write**, appended in order before the closing section. A stop is a few kilobytes, which is well inside a safe write.
3. **The simulator's step list**, one `<li>` per node, appended into `.sim-steps`.
4. **The navigation links**, once the stop ids are all known.

Because the shell already closes the document, an interruption at any point leaves a page that opens and renders, missing some stops. That is a recoverable state. A page cut off inside `<style>` is not.

### Verifying it, and what to do when the check fails

Read back **the file you just wrote, at the path you wrote it to**. Never verify a path you are holding from earlier in the session, and never verify a copy somewhere else: checking the wrong file is worse than not checking, because it reports success for a document you never inspected.

Check, in this order:

1. The file ends with `</html>`. If not, it is truncated. Stop and go to the recovery below.
2. Exactly one `<script>` element, and its contents parse.
3. No external references: no `http://`, no `https://`, no `//cdn`, no `@import`, no `<link`.
4. The number of `class="stop"` occurrences equals the number of stops the caller gave you.
5. Every `data-node` in a route stepper resolves to a node in that stop's diagram, and every `data-copy` matches its visible text.

**If any check fails, do not patch the file.** Delete it and rebuild from step 1 of the assembly above. Patching a truncated document is how a partial page becomes a smaller partial page: the anchors the patch is looking for are in the part that was never written, so each attempt removes more than it adds.

If a rebuild truncates again, the page is too large for the environment. Say so plainly, hand back the `tour.md` (which is complete and useful on its own), and tell the caller to reduce the scope: fewer stops, summary depth instead of in-depth, or one tour per unit rather than one for the whole repository. Do not leave a broken `index.html` on disk; a missing file is honest, a truncated one looks finished.

### The checker is not optional

`_shared/check-tour.mjs` validates a generated page against the design system mechanically. Run it on **every page, every time**, before telling anyone the tour is ready:

```
node ~/.config/opencode/skills/_shared/check-tour.mjs <path-to-index.html> --stops N
```

It checks the things that actually go wrong: truncation, the script count and its syntax, the missing `updateProgress()` call, external references, **the complete thirteen-token set and the real palette values in both colour schemes**, the presence of every component class, stop count and duplicate ids, checkpoints that are open by default, copy chips whose `data-copy` disagrees with their visible text, route steps pointing at nodes that are not in that stop's diagram, duplicate SVG marker ids, SVGs with no `aria-label`, and the simulator's own preconditions.

It exists because "follow the design system" is a request and this is a test. Asked to produce eight tours, an earlier run returned three that passed, two that abbreviated the token set, and three with entirely invented palettes: slate and teal, blue on a dark background, blue on white. Every one of those failures is caught by this script in under a second.

If it fails, **fix the page and run it again**. Do not deliver a page that fails and do not explain the failures away. If a check is genuinely wrong for a legitimate case, change the design system and the checker together, so the next page inherits the decision.

### Delivering a tour page

Write it to the absolute path the caller gave, create the parent directories if needed, and return that path. Do **not** use the `~/.config/opencode/data/visual-explainer/` location for tour pages: tours are owned by `code-tour` and live under its own directory so its freshness check can find them.

If a rich-rendering mechanism is available, still write the file first so the stored tour exists, then also render it. The file is the artefact of record.

## Handing the result back

If invoked by another skill rather than directly by the user, return what was produced — the SVG markup, or the file path / artifact link — so the calling skill can present it alongside its own explanation. Also return which canvas mechanics you built and which preconditions went unmet, so the caller can improve the material next time. The visual is always additive: it accompanies the calling skill's text, never replaces it.
