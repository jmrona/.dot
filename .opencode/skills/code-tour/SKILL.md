---
name: code-tour
description: "Builds a guided, didactic tour of a codebase so someone can understand how the whole repository or one part of it actually works. This skill is EXPLICITLY INVOKED ONLY: trigger it when the user runs the /tour command, or when the user asks in so many words for a tour or a walkthrough of the code ('give me a tour of X', 'walk me through the codebase', or the same request in another language, since 'tour' is borrowed unchanged into most of them). You MUST NOT trigger it for ordinary conceptual questions ('what is X', 'how does X work', 'explain X'), for onboarding requests phrased as questions, for architecture questions, or because a repository looks unfamiliar. Those all belong to `explain`. Ambiguity resolves AGAINST this skill: if the user did not run /tour and did not use the word tour or walkthrough, do not invoke it."
---

# Code Tour

A tour is not an explanation of a concept, it is a **route through real code**. The user finishes a tour able to open the repository and know where things live, why they are arranged that way, and what breaks if they are rearranged. Every claim in a tour is anchored to a real path, type or function in the repository in front of you. There are no placeholder names and no invented components.

The skill is generic. Nothing about any particular repository is hardcoded: the structure is discovered at run time from the repository the user currently has open.

## 0. Invocation gate

Run only when the user invoked `/tour` or explicitly asked for a tour or a walkthrough. If you arrived here from a conceptual question, stop and hand back to `explain` instead.

## 0.1 Language

**Write in British English unless the user's own most recent messages are in another language.** This is the repository default (`rules/common/language.md`), and it is the answer whenever there is any doubt.

Judge the language from what the **user** actually typed in this conversation, and nothing else. Specifically:

- A repository, a path, a code identifier or a comment written in another language says nothing about how the user wants to be addressed. Neither does the language of this skill file, of the examples in it, or of anything you read on disk while surveying.
- A single borrowed word does not switch the language. Technical vocabulary travels between languages unchanged ("tour", "commit", "slice"), so its presence in a sentence says nothing about which language that sentence is in.
- Switch only when the user's messages are consistently in another language. Then conduct the whole interaction in it: the questions, the tour, and the surrounding prose.
- If the user switches mid-conversation, follow them from that point on. Do not retranslate a tour that has already been delivered unless they ask.

British English also means the spellings in `rules/common/language.md` (`colour`, `initialise`, `behaviour`), no emojis, and no em-dashes or en-dashes as prose punctuation.

## 1. Read the arguments the user already gave

`/tour` may carry arguments, and a free-form request often carries the same information. Parse it before asking anything, and **skip any question the user has already answered**:

| The user said                       | Already answered |
|-------------------------------------|------------------|
| `/tour governor`                    | scope            |
| `/tour api flexi`                   | scope, section   |
| `/tour whole project`               | scope            |
| `/tour parity as html`              | section, format  |
| `give me a tour of the users slice` | section          |
| `/tour` with nothing                | nothing          |

Never ask a question whose answer is already on the table. Asking about something the user just told you is the fastest way to make the tour feel like a form.

## 2. Say what already exists, before anything else

**This is the first thing you do after parsing the arguments, and the first thing you tell the user.** It costs one directory listing. Everything else in this skill is expensive: surveying the repository, asking four questions, reading the design system, generating prose. None of it should happen before the user knows a tour may already be sitting on disk.

```
ls ~/.config/opencode/data/tour/<repo-slug>/
```

Read each `manifest.json` you find. That gives you the scope, section, depth, generation date and whether an HTML rendering exists, without opening the tours themselves.

**If nothing exists for this repository**, say nothing about it and carry on to step 3.

**If something exists**, say so immediately, in one short block, before any question and before any survey work. List each stored tour with what it covers, its depth, when it was generated, and **the full absolute path to the file**: `index.html` when one was rendered, otherwise `tour.md`. Never a relative path, never just the directory, never only the filename. Most terminals make an absolute path clickable, and a path the user cannot click or paste is as useless as not mentioning the file at all.

Then branch:

- **The arguments already identify one of them** (`/tour governor` and a `governor--all--summary` tour exists). Do not ask anything. Go straight to the freshness check in step 5, then deliver. The only question worth asking is the format, and only if the stored tour has no rendering in the format they asked for.
- **The arguments are ambiguous or absent.** Offer the stored tours as first-class options in the scope question in step 4, above the options for a new one, labelled with their date: "Reopen: Governor in general, in depth, generated 3 August". Reopening is usually what someone wants and it is close to free; make it the easy path rather than a footnote.

Do not read the design system here, and do not read it in step 3 or 4 either. It is a rendering concern and it is only needed once you know you are producing or refreshing an HTML page. Reading it earlier burns context on a page you may never build, and it delays the one message the user actually wanted first.

## 3. Discover the repository structure

**Skip this entirely if the user is reopening a stored tour that turns out to be current.** It is the most expensive step in the skill and it exists only to populate the options for a new tour.

Do this before asking the scope question: the options you offer must be real directories, not guesses.

Identify the repository root with `git rev-parse --show-toplevel`, falling back to the current working directory.

**If `codebase-memory-mcp` is available in this session, use it first**: `get_architecture` for the high-level shape, then `search_graph` and `trace_path` while building the content. It is faster and more accurate than filesystem scanning. Fall back to the heuristics below for whatever it does not cover.

### Detecting top-level units ("pillars")

Apply these signals in order and stop at the first that yields a sensible set:

1. **Declared structure.** `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/architecture.md` at the root. If a document names the top-level units, that naming wins, including its labels ("API (PHP/Laravel)", "Governor (Go)"). A repository that documents its own shape is telling you what the user calls these things, and the tour must use the user's vocabulary.
2. **Workspace manifests.** `pnpm-workspace.yaml`, `go.work`, `Cargo.toml` with `[workspace] members`, `turbo.json`, `nx.json`, `lerna.json`, `pom.xml` modules.
3. **Per-directory build manifests.** A top-level directory containing any of `composer.json`, `go.mod`, `package.json`, `Cargo.toml`, `buf.yaml`, `buf.gen.yaml`, `pyproject.toml`, `build.gradle`, `Gemfile`, `*.csproj`.
4. **Task-runner namespaces.** `justfile`, `Makefile`, `Taskfile.yml` recipe prefixes (`just api check`, `just governor test`) map directly onto units.
5. **Fallback.** Top-level directories, excluding anything in `.gitignore`, plus the usual noise: `node_modules`, `vendor`, `target`, `dist`, `build`, `.git`, `tmp`, `coverage`.

Always include infrastructure-ish directories you find (`infrastructure/`, `ops/`, `deploy/`, `.github/`, `docker/`) as a unit, and shared contract directories (`proto/`, `schema/`, `openapi/`) as another. They are usually where the interesting cross-unit rules live, and they are usually the part nobody has read.

If the repository has no meaningful top-level split (a single-package repo), say so and skip straight to the section question with sections derived from the source tree.

### Detecting sections within a unit

Look for a directory that holds sibling feature folders, in this order: `slices/`, `features/`, `modules/`, `domains/`, `plugins/`, `packages/`, `apps/`, `services/`, `cmd/`, `src/<something>/`. Case does not matter (`app/Slices`, `src/slices`).

A feature name that appears under more than one unit (a `users` directory in three different pillars) is a strong signal that the repository is organised by vertical feature. Record that: it changes the shape of the tour, because the interesting route is *across* units rather than down one.

Also detect the cross-cutting mechanisms, because they are what a tour has to explain: the transport between units (HTTP, a message bus, generated clients), the shared contract directory, and any code-generation step. Grep the task runner and CI config for `generate`, `codegen`, `proto`, `buf`, `openapi`.

## 4. Ask the questions

Use the environment's structured question tool if one exists. In a plain terminal, present a numbered list and wait for a reply. Ask questions 4.1 and 4.2 one at a time, because the second depends on the answer to the first. Questions 4.3 and 4.4 can be asked together.

The wording below is the English original, which is what you use by default. Translate it only under the condition set out in the Language section, and translate the option labels with it so the questions and the tour are not in different languages.

### 4.1 Scope

> Where do you want the tour to go?

- **Reopen a stored tour**: one option per tour found in step 2, labelled with what it covers, its depth and its date. List these first. They are the cheapest and most likely answer.
- **The whole project**: how the units fit together and why.
- **One unit**: one option per detected unit, using the repository's own label.

If the user reopens a stored tour, stop asking questions. Go to step 5.

### 4.2 Section

Ask this in both cases, with different options.

**If the scope is the whole project:**

- **General overview**: the units, their responsibilities, the boundaries between them and the contract that connects them.
- **A feature end to end**: follow one feature across every unit it touches. Offer the detected cross-unit feature names as sub-options.
- **The cross-cutting machinery**: the contract, code generation, the message bus, auth, CI. Offer this only if you actually detected such machinery.
- **Other**: free text.

**If the scope is one unit:**

- **The unit in general**: its layout, conventions, entry points and the rules it enforces on itself.
- **One feature**: one option per detected section in that unit.
- **Other**: free text.

**If the free text names more than one subject, or asks how two things relate, say so back and confirm the chapter structure in the same line**: "Right, that's three parts then: the assistant on its own, Flexi on its own, and how they meet. Starting there." Getting this agreed before generating is much cheaper than restructuring afterwards.

For **Other**, take the free text as the topic, resolve it to concrete paths yourself, and confirm the resolution in one line before generating: "Right, the authentication flow, which I can see in `api/app/Slices/Identity/` and `platform/src/slices/identity/`. Starting there." If you cannot resolve the free text to real paths, say what you searched for and ask again rather than inventing a tour.

### 4.3 Depth

- **Summary**: the why and the how, with real names and clickable paths, and short code fragments only where they carry a contract. Faster to generate and to read.
- **In depth**: the same, plus a real request or event traced end to end, quoting actual fragments from each file it passes through.

### 4.4 Format

- **HTML file**: an interactive page with diagrams, animation and navigation.
- **Terminal output**: the whole tour written straight into the conversation.

**Do not offer the terminal option when the scope is the whole project.** Say the format rather than asking: "Whole-project tours go to an HTML file; there is too much of it to read in a terminal." A whole-project tour is ten stops or a six-page series, and dumping that into a scrollback is not a deliverable, it is a wall the user has to scroll past to get back to their prompt. The option only exists for tours small enough to read in place, which means one unit or one feature.

For every other scope, ask normally. Someone who wants a five-stop tour of one module in their terminal has a perfectly good reason for it.

## 5. Storage, and the freshness check

Tours live under `~/.config/opencode/data/tour/`. Use that absolute path, never a path relative to the current working directory, so the location is the same whichever repository the user is in.

```
~/.config/opencode/data/tour/
  <repo-slug>/
    <tour-id>/
      manifest.json
      index.html        # present if the tour was ever rendered as HTML
      tour.md           # the tour content, format-independent
      assets/           # standalone SVGs, if any
```

- `<repo-slug>` is the repository directory name, slugified.
- `<tour-id>` is `<scope>--<section>--<depth>`, slugified and lowercased, for example `governor--all--summary`, `all--feature-users--deep`, `api--flexi--deep`. Free-text topics slugify their text: `all--other-auth-flow--summary`.

Depth is part of the identity: a summary tour and an in-depth tour of the same area are two different tours and must not overwrite each other. Format is **not** part of the identity: `tour.md` is the source of truth and `index.html` is a rendering of it, so asking for HTML after a terminal tour reuses the content and only renders it.

### manifest.json

```json
{
  "version": 1,
  "repo": { "slug": "ember", "root": "/Users/jose/Development/ember" },
  "scope":   { "kind": "pillar", "id": "governor", "label": "Governor (Go)" },
  "section": { "kind": "all", "id": "all", "label": "Governor in general", "freeText": null },
  "depth": "summary",
  "generatedAt": "2026-08-05T10:12:00Z",
  "git": { "head": "9f3a1c2...", "branch": "main" },
  "coveredPaths": ["governor/", "proto/slices/", "justfile"],
  "chapters": [
    { "id": "part-1", "title": "The API on its own" }
  ],
  "sections": [
    { "id": "layout",   "title": "How Governor is laid out", "paths": ["governor/slices/", "governor/internal/"] },
    { "id": "workflow", "title": "A workflow end to end",    "paths": ["governor/slices/parity/"] }
  ],
  "renderedHtml": true
}
```

`coveredPaths` and the per-section `paths` are what make a partial refresh possible. Record them honestly: every path you actually read to write that section, not just the obvious one.

### The freshness check

1. If no manifest exists for this `<tour-id>`, generate from scratch.
2. `git -C <root> cat-file -e <manifest.git.head>`: if the recorded commit no longer exists (rebase, force-push, shallow clone), regenerate the whole tour.
3. `git -C <root> diff --name-only <manifest.git.head>..HEAD -- <coveredPaths>` for committed changes, and `git -C <root> status --porcelain -- <coveredPaths>` for uncommitted ones. Union the two.
4. **Empty union**: the tour is current. Show the stored tour as it is, with one line saying it was generated on `generatedAt` and nothing it covers has changed since, **and the full absolute path to the file**. Do not regenerate. Do not survey the repository. Do not read the design system. Do not apologise for reusing it.
5. **Non-empty union**: intersect the changed files with each section's `paths`. Regenerate only the sections that intersect, leave the rest untouched, and rewrite the manifest with the new `head` and `generatedAt`. Tell the user which sections were refreshed and why, naming a changed file or two. If more than roughly half the sections are affected, regenerate the whole thing instead: the connective tissue between sections will be stale too.
6. **Not a git repository**: compare the newest mtime under `coveredPaths` against `generatedAt` and apply the same rules.

A tour whose content did not change but which is being asked for in a new format regenerates nothing: read `tour.md` and render it. This is the only case where a current tour still needs the design system.

## 6. Gather the material

Read before you write. A tour built from what you assume a framework does is worthless, because the value is entirely in the specifics of *this* repository.

For a broad scope, dispatch one subagent per unit or per section **to survey**, in parallel, following `rules/common/subagents.md`. Each subagent gets an explicit brief and returns findings, not prose: entry points, the directory layout with real paths, the conventions the unit enforces, the boundaries it must not cross, and the two or three files someone new would have to read first. You write the tour from their findings so the voice and the didactic shape stay consistent.

For a narrow scope, read directly.

Look specifically for the things that a newcomer cannot infer:

- **Entry points.** Where execution actually begins: `main`, the router, the composition root, the worker registration.
- **The rules the repository enforces on itself.** Lint config, architecture tests, CI gates, import boundaries, generated-code checks. These encode decisions somebody argued about, and they are the most valuable thing in a tour.
- **What is generated versus hand-written.** Nothing confuses a newcomer faster than editing a file that gets overwritten.
- **The seams.** Where one unit hands off to another, and what the contract is.
- **The exception to the pattern.** Every repository has one shared or special-cased thing that breaks its own rule. Name it and explain why, or the user will hit it alone and conclude they misunderstood the pattern.

## 7. Write the tour

Structure it as an ordered route, not a reference manual. Each stop follows this shape:

1. **Why this exists.** The problem it solves, before any detail about how. One or two sentences.
2. **A real-world analogy**, where the concept is genuinely unfamiliar. Skip it for things that need no scaffolding.
3. **The map.** What is inside, with real paths.
4. **The route.** Follow something concrete through it: a request, an event, a build step. Name the files in the order execution reaches them.
5. **The rules.** What must hold, and what breaks if it does not. Prefer "if you do X, Y fails at Z" over "X is not allowed".
6. **A checkpoint.** One question the user can answer from what they just read, or a "where would you look if..." prompt. This is what makes it a tour and not a document.

### Budget the tour before writing it

A tour has a size beyond which it stops being a tour. Decide the budget after the survey and before writing a word, because discovering it at render time means a truncated page and a wasted survey.

| Scope | Stops | Depth to prefer |
|---|---|---|
| One feature in one unit | 4 to 6 | Either |
| One unit in general | 5 to 8 | Either |
| Two subjects and their relationship | 3 to 4 per chapter, 9 to 12 total | Either |
| Whole project, general overview | One stop per unit, plus 2 or 3 for the seams | **Summary** |
| Whole project, one feature end to end | 6 to 8, following the feature only | Either |

**Twelve stops is the ceiling for one page.** Past that the page is too long to read, too large to generate in one piece, and the reader has lost the thread by stop nine anyway.

**A whole-project in-depth tour is the case that fails.** Five units, each surveyed in depth, with traced routes and code fragments, does not fit on one page and does not work as one narrative. When the user asks for it, say so before generating and offer the two things that do work:

- **A whole-project tour at summary depth**, one stop per unit plus the seams, which is genuinely the right shape for "how does this repository fit together". The in-depth material belongs in per-unit tours.
- **A series**: one in-depth tour per unit plus an index page, as described below. They are stored separately, refresh independently, and the user can take them in any order.

Offer the choice; do not silently downgrade the depth they asked for, and do not attempt the version that cannot work. A tour that fails at the last step after a twenty-minute survey is the worst outcome available, and it is entirely avoidable at this point.

If the tour is going to run long, tell the user the shape before generating: how many stops, how many chapters, roughly how long. It costs one line and it is the last cheap moment to change course.

### Tour series: when one page is not enough

A whole-project in-depth tour is genuinely better as a **series**: one in-depth tour per unit, plus a short index page linking them in the order the system's contracts demand. It refreshes per unit, it reads in any order, and no single page is unmanageable.

But it is a different deliverable from the one the user asked for, so **offer it and wait**. "That does not fit truthfully on one in-depth page. I can do a whole-project summary, or a series of six in-depth tours with an index. Which?" Building six tours unasked, when one was requested, is the same failure as silently downgrading the depth, just in the other direction.

When the user accepts a series:

- Each tour is a normal tour with its own directory, manifest and freshness check. Nothing about a series makes its members special.
- **The index is a real index, not a list of six links.** It lives at the series' own `<tour-id>` (`all--all--deep`) and it is the page the user opens first, so it has to be worth opening. One card per tour, in the order the system's contracts demand, each carrying: the unit's name and its label, one sentence on what that tour covers, the stop count, the reading time, the depth, and the date it was generated. Read those from each member's `manifest.json` rather than remembering them; the manifests are the source of truth and they stay right when a member is refreshed.
- **List every tour that exists for this repository, not only the series members.** If there is already a summary tour, or an in-depth tour of one feature from an earlier session, it belongs on the index under a second heading. The user has one place to find everything, which is the entire point of an index, and the manifests are already sitting there from step 2.
- **Every member page links back to the index.** Without it each member is a dead end and the only way between two tours is the file manager. It goes in the closing section, as the first thing under "Where to go next".
- **Every page in the series is written by you, from the same baseline, and every one is checked.** A series is where the house style breaks down, because the pages are written one after another and drift accumulates. Run the checker on all of them before delivering any of them.
- The index page is short but it is not exempt: same tokens, same components it uses, same checker.

### Chapters: when a tour has more than one subject

A flat list of stops is right for a tour with one subject. It is wrong the moment the tour covers two things and how they connect, because a single sequence smears the relationship across every stop and never states it anywhere. The reader finishes knowing a bit about each and nothing about the join, which was the question.

Use chapters when any of these hold:

- The user named two or more subjects ("the assistant and billing, and how they relate").
- The free text asks how X and Y relate, how they are connected, or compares them.
- The scope is the whole project and the section is the general overview, in which case each unit is a chapter.

Then the shape is fixed:

1. **One chapter per subject**, in the order the user named them, each with its own stops, each standing on its own.
2. **A final chapter on the relationship**, with its own stops. This is not optional and it is not a closing paragraph bolted to the last subject. It is where the tour earns the word "and": the contract between them, which one calls which, what each assumes about the other, what crosses the boundary and in what shape, and what breaks when one side changes. If you cannot fill this chapter, the two subjects were not actually related and the user should be told so rather than handed a tour that implies otherwise.
3. Each chapter opens with an eyebrow (`Part 2 of 3`), a title, and a one-paragraph orientation saying what this part covers **and what it defers to a later part**.

**Stop numbering runs continuously across the whole tour.** Chapters group stops; they do not restart the count. "Stop 7 of 11" keeps meaning something and the counter keeps working untouched.

Do not use chapters for a single-subject tour. Two levels of structure for six stops about one thing is bureaucracy, and it makes the navigation harder to scan rather than easier.

Record the chapter on each entry in the manifest's `sections` array, so a partial refresh can rewrite one chapter without disturbing the others.

Rules that apply throughout:

- **Real names only.** Never "Service A" or "the handler". Use `governor/slices/parity/workflows/`, `RegisterWorker`, `ember.users.user_invited`.
- **Paths are absolute or repository-relative and consistent**, so the user can click or paste them.
- **Code fragments are short and load-bearing.** Five lines that show a contract beat forty lines that show a file. At summary depth, only where a contract cannot be stated in prose. At in-depth, one per stop on the traced route.
- **Explain decisions, not just facts.** "Slices must not import each other" is a fact. "Slices must not import each other so a feature can be deleted in one commit, and `identity` is the single exception because everything needs a user" is a tour.
- **Proportional length.** A tour of one slice is not improved by covering the whole repository around it.

### Rendering is never delegated

**Subagents survey. The orchestrator writes.** This boundary is not a style preference, it is the single reason a set of tours ends up with four different colour schemes.

A subagent executes the brief it was given and does not run skill discovery, which means **it has never read the design system and never will**. Hand it "produce the Governor page" and it will invent a palette, a layout and a set of components, and it will do so competently and confidently. Six subagents produce six good-looking pages that share nothing. That is exactly what happened the first time this was tried: three of the pages used slate and teal, one used blue on a dark background, two abbreviated the token set, and none of them built a simulator.

So:

- Subagents return **findings**: paths, entry points, conventions, boundaries, payload shapes, error responses, source files. Structured notes, not prose, and never markup.
- The orchestrator reads the design system **once**, then writes every page itself, from those findings. One reader of the house style, one writer, one house style in the output.
- If a page is too large for the orchestrator to write in one pass, that is what the incremental assembly in `visual-explainer` is for. It is not a reason to delegate.

If you genuinely must delegate rendering, the dispatch brief has to contain the **entire CSS baseline and component markup inline**, because the subagent cannot go and get it. At that point you have copied the design system into six prompts and the cheaper, more reliable option was to write the page yourself.

### What a survey brief must ask for

A subagent will not collect what it was not asked for, and the flow simulator's preconditions are the ones that get missed. Every survey brief includes, explicitly:

- Entry points, directory layout with real paths, the conventions the unit enforces, the boundaries it must not cross, and the two or three files someone new reads first.
- **The per-node material listed under "Material the flow simulator needs" below**: what arrives, what leaves, what changed, the error response, what breaks downstream, and the source file for each. Quote that list into the brief; do not summarise it as "and the payloads".
- The instruction to report what it **could not find**, rather than filling the gap. A subagent asked for an error response will produce one whether or not the code has one.

### Material the flow simulator needs

If the tour will be rendered as HTML, `visual-explainer` builds a flow simulator in the closing section: the whole route running end to end, with transport controls, per-node payloads, and nodes the reader can break to see the real failure. It cannot invent any of that. Gather it **while you are reading the code**, because going back for it later means a second survey.

Per node, in order along the route:

1. **The node itself.** Its real name and the file that implements it.
2. **What arrives.** The input at that point, in the repository's own vocabulary, with the file you read it from.
3. **What leaves.** The output on the success path, again with its file. Where the shape changes, that change is the lesson; where it does not, say so.
4. **What changed since the previous node**, in one sentence. A field dropped for privacy, an id assigned, a nested list moved to its own table. This is usually the most valuable line on the page.
5. **What this node returns when it fails**, taken from the code: the status and body the handler produces, the exception the caller maps, the fallback value, the sentinel. With its file.
6. **What stops working downstream** if it fails, in one clause.

**Points 5 and 6 are the ones that get fabricated, so be strict with yourself.** If you did not find the error path in the code, record that you did not. The node is then rendered as non-breakable rather than breakable with a plausible invention, which is the correct outcome: a made-up `500 Internal Server Error` is worse than no interaction, because the reader cannot tell it apart from a real one and will repeat it later as fact.

Every payload and every error is delivered with the **file path it came from**, which the page displays under the code block. That is what makes "based on the real code" checkable by the reader rather than a claim they have to take on trust. If you cannot name the file, you did not read it, and it does not go in.

Also record, once for the whole route:

- **Whether any part of the flow is asynchronous or parallel**, and roughly when each unit starts and stops. If anything is async, a single row of nodes is actively misleading and the timeline view is built instead.
- **Which code fragment belongs to which node**, so a fragment can highlight its node on hover.

Supply what you actually found and nothing more. A missing item means one part of the simulator is skipped, which is fine and expected; a fabricated one means the page teaches something false, which is not.

Start every tour with a one-paragraph orientation: what this repository is, what the tour covers, what it deliberately does not, and roughly how long it is. End with **where to go next**: the two or three files to open first, and the next tour worth taking.

## 8. Deliver it

Write `tour.md` and `manifest.json` under the stored path in both cases. The stored content is what makes the next run cheap.

**Always end by stating the full absolute path to the file**, as plain text, whichever format was chosen and whether the tour was generated, refreshed or reused unchanged. `/Users/jose.romero/.config/opencode/data/tour/ember/governor--all--deep/index.html`, never a relative path, never just the directory, never only the filename. The user has no way to resolve a path that is not anchored, and the path is what makes the tour worth storing at all.

**Terminal output**: write the full tour into the conversation. Do not paginate it, do not offer to continue, do not summarise it and offer the rest: the user asked for the whole thing. Use headings for stops, and keep the checkpoints in. Afterwards, state the stored path in one line so they know where it went, and mention the HTML version is one command away.

**HTML file**: invoke `visual-explainer` and use its **Tour mode**, handing it the finished `tour.md` content, the stop structure, and the diagrams each stop needs. The page format is fixed by `~/.config/opencode/skills/_shared/design-system.md`, so every tour page looks like every other one; do not ask for or accept a bespoke design. It owns the page format and the delivery. Write its output to `~/.config/opencode/data/tour/<repo-slug>/<tour-id>/index.html`, set `renderedHtml: true` in the manifest, and state the full absolute path as plain text in your reply. Do not try to open the file yourself: most terminals make an absolute path clickable, and shelling out to `open` fails in sessions with no GUI to hand off to.

## 9. Common failures

| Failure | What to do instead |
|---|---|
| Mentioning that a tour already exists only after surveying the repository and asking four questions | Step 2 is one directory listing and it comes first, before any question and any survey |
| Reading the design system before knowing whether anything will be rendered | It is a rendering concern. Read it in step 8, and not at all when serving a current tour unchanged |
| Saying a tour exists without saying where | Every mention of a stored tour carries its full absolute path |
| Asking all four questions when the user typed `/tour api flexi html` | Parse the arguments and ask only what is missing |
| Generating a fresh tour because it feels more thorough than reusing one | If the freshness check says current, show the stored tour |
| Describing what a framework does in general | Describe what this repository does with it |
| A tour that is a directory listing with commentary | Follow a route: one thing moving through the system |
| Inventing a component because the pattern implies it exists | Read the directory and name what is actually there |
| Silently skipping the checkpoint questions to save space | They are what makes it didactic; keep them |
| Recording `coveredPaths` loosely so the freshness check never fires or always fires | Record exactly the paths that were read |
| Attempting a whole-project in-depth tour and losing it to a truncated page after a long survey | Budget before writing. Offer summary depth for the whole project, or one in-depth tour per unit |
| A simulator with fifteen nodes because the route touches fifteen files | A node is where the payload meaningfully changes. Collapse to unit level, or give each chapter its own simulator |
| Delegating page rendering to the same subagents that did the survey | They have not read the design system and cannot. Survey in parallel, render yourself |
| Six pages in a series that each look different | One reader of the house style, one writer. Run `_shared/check-tour.mjs` on every page before delivering |
| Splitting a whole-project tour into a series without asking | Offer it, wait for the answer, then build. The user asked for one thing and got six |
| Answering in a language the user never wrote in, because a path, a comment or an example in this file was in it | British English by default; only the user's own messages change that |
