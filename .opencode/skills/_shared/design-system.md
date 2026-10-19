# Design System

The house style for every self-contained HTML page produced by these skills, and the base every future tour is built on. It exists so pages look like they came from the same place, and so accessibility, responsiveness, printing and reduced-motion are settled once rather than re-litigated per page.

**If this file exists, it is not optional.** Read it before writing any HTML or SVG, and take the tokens, the CSS baseline, the component markup and the script from here verbatim. Do not restyle, do not substitute a framework, do not swap the palette for something that suits the topic better. Consistency across pages is the point; a page that is individually prettier but different is a regression.

Content varies. Chrome does not.

---

## 1. Hard constraints

These hold for every page, with no exceptions:

- **One file.** All CSS in a single `<style>` in `<head>`, all JS in a single `<script>` before `</body>`. No separate assets.
- **Zero external requests.** No CDN, no webfont, no icon set, no analytics, no remote image. The page must render identically with the network switched off, and must still work in a year. System font stacks only.
- **No build step, no framework, no bundler.** Vanilla JS, hand-written CSS.
- **Opens from `file://`.** No server, no module imports, no `fetch`.
- **No browser storage.** No `localStorage`, no `sessionStorage`, no cookies. State lives in the DOM for the lifetime of the page.
- **British English** in all prose, per `rules/common/language.md`. No emojis. No em-dashes or en-dashes as prose punctuation.

---

## 2. Colour

### 2.1 The palette

Two hues carry the whole system.

**Orange is the accent**, the brand hue, anchored on `rgb(249, 115, 22)` (`#f97316`). It marks structure: eyebrows, active navigation, links, rule callouts, step badges, diagram node borders.

**Teal is the signal**, the counter-hue. It marks the two things that must not be mistaken for ordinary accented chrome: the analogy rail, and the currently highlighted diagram node. It is also the focus ring, so focus is never confused with an accented element. Warm against cool is what makes the highlight legible at a glance.

Everything else is neutral. Resist adding a third hue: if something needs to stand out, it competes with the signal, and both lose.

### 2.2 The orange ramp

`#f97316` is step 500 of this ramp. Its variants are the neighbouring steps, and the correct one depends on the background it sits against, not on preference.

| Step | Hex       | Where it is used                                        |
|------|-----------|---------------------------------------------------------|
| 100  | `#ffedd5` | `--accent-soft` in light mode                            |
| 300  | `#fdba74` | reserved, subtle rules on dark                           |
| 400  | `#fb923c` | `--accent` in dark mode                                  |
| 500  | `#f97316` | `--accent-vivid` in dark mode, the brand reference       |
| 600  | `#ea580c` | `--accent-vivid` in light mode                           |
| 700  | `#c2410c` | `--accent` in light mode                                 |
| 800  | `#9a3412` | reserved, hover on light surfaces                        |
| 950  | `#431407` | derived tints for `--accent-soft` in dark mode            |

**Why light mode does not use `#f97316` for text.** Against the light background it reaches 2.61:1, well under the 4.5:1 floor for body text and under the 3:1 floor for interface elements. Light mode therefore steps down to 700 for anything text-shaped (4.82:1) and 600 for strokes and fills (3.31:1). Dark mode has the opposite problem and the opposite answer: `#f97316` reaches 6.58:1 there, so the brand colour appears literally, and text steps up to 400 (8.15:1). Same colour, same family, resolved per mode. Deviating from this is how a page ends up unreadable in one of the two modes nobody tested.

### 2.3 Tokens

Every colour in a page comes from a token. No hex literal appears outside `:root` and the dark-mode block, with the single exception of `currentColor` in SVG marker fills.

| Token             | Light     | Dark      | Role                                                            |
|-------------------|-----------|-----------|-----------------------------------------------------------------|
| `--bg`            | `#f6f7f5` | `#101512` | Page background                                                  |
| `--surface`       | `#ffffff` | `#17201b` | Raised panels: map, details, route buttons, next block, counter  |
| `--ink`           | `#1b2420` | `#e7efe9` | Body text                                                        |
| `--muted`         | `#62706a` | `#a7b5ad` | Secondary text: lede, legend, nav idle, details body             |
| `--line`          | `#d9e0dc` | `#304038` | Borders, dividers, progress track                                |
| `--accent`        | `#c2410c` | `#fb923c` | Accent text and text-bearing fills                               |
| `--accent-vivid`  | `#ea580c` | `#f97316` | Accent strokes and non-text fills                                |
| `--accent-soft`   | `#ffedd5` | `#3a1d0b` | Accent tint backgrounds: rule, copy chip, highlighted node       |
| `--on-accent`     | `#ffffff` | `#1b1005` | Text sitting on `--accent`                                       |
| `--signal`        | `#0f766e` | `#5eead4` | Counter-hue: analogy rail, highlight stroke                      |
| `--focus`         | `#0f766e` | `#5eead4` | Focus ring                                                       |
| `--code`          | `#17211d` | `#0b100d` | Code block background, dark in both modes                        |
| `--code-ink`      | `#e6f3eb` | `#e6f3eb` | Code block text                                                  |

`--on-accent` exists because white text on the accent fails in dark mode. The step badge is 12.8px bold, which is not large text, so it needs the full 4.5:1. Never hardcode `white` on an accent fill.

### 2.4 The accessibility floor

Every pairing the system produces, measured:

| Pairing                            | Light | Dark  | Floor |
|------------------------------------|-------|-------|-------|
| `--ink` on `--bg`                  | 14.81 | 15.75 | 4.5   |
| `--muted` on `--bg`                | 4.83  | 8.66  | 4.5   |
| `--accent` on `--bg`               | 4.82  | 8.15  | 4.5   |
| `--accent` on `--surface`          | 5.18  | 7.37  | 4.5   |
| `--accent` on `--accent-soft`      | 4.52  | 6.82  | 4.5   |
| `--on-accent` on `--accent`        | 5.18  | 8.0+  | 4.5   |
| `--accent-vivid` on `--surface`    | 3.56  | 5.95  | 3.0   |
| `--ink` on `--accent-soft`         | 13.89 | 13.17 | 4.5   |
| `--signal` on `--bg`               | 5.09  | 12.47 | 3.0   |

If you introduce a pairing that is not in this table, compute it before shipping. Do not estimate a contrast ratio by eye.

---

## 3. The CSS baseline

Copy this verbatim into every page. Append page-specific rules underneath if a page genuinely needs them; do not edit what is here.

```css
:root { --bg:#f6f7f5; --surface:#fff; --ink:#1b2420; --muted:#62706a; --line:#d9e0dc; --accent:#c2410c; --accent-vivid:#ea580c; --accent-soft:#ffedd5; --on-accent:#fff; --signal:#0f766e; --code:#17211d; --code-ink:#e6f3eb; --focus:#0f766e; }
@media (prefers-color-scheme: dark) { :root { --bg:#101512; --surface:#17201b; --ink:#e7efe9; --muted:#a7b5ad; --line:#304038; --accent:#fb923c; --accent-vivid:#f97316; --accent-soft:#3a1d0b; --on-accent:#1b1005; --signal:#5eead4; --code:#0b100d; --code-ink:#e6f3eb; --focus:#5eead4; } }
* { box-sizing:border-box; } html { scroll-behavior:smooth; } body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.65 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
button, summary { font:inherit; } button:focus-visible, a:focus-visible, summary:focus-visible { outline:3px solid var(--focus); outline-offset:3px; } a { color:var(--accent); }
.top { position:sticky; top:0; z-index:5; height:5px; background:var(--line); } .progress { width:0; height:100%; background:var(--accent); transition:width .2s ease; }
.layout { display:grid; grid-template-columns:270px minmax(0,820px); gap:52px; max-width:1200px; margin:0 auto; padding:48px 28px 80px; }
nav { position:sticky; top:36px; align-self:start; } .brand { font-size:.76rem; font-weight:750; letter-spacing:.13em; text-transform:uppercase; color:var(--accent); } nav h2 { margin:8px 0 14px; font-size:1rem; } nav a { display:block; padding:7px 10px; border-left:2px solid transparent; color:var(--muted); text-decoration:none; font-size:.9rem; } nav a.active { border-color:var(--accent); color:var(--ink); font-weight:700; } .nav-toggle { display:none; }
main { min-width:0; } .cover { padding:10px 0 42px; border-bottom:1px solid var(--line); } .cover h1 { max-width:720px; margin:9px 0 16px; font-size:clamp(2.3rem,6vw,4.7rem); line-height:1; letter-spacing:-.06em; } .lede { max-width:700px; font-size:1.13rem; color:var(--muted); } .facts { display:flex; flex-wrap:wrap; gap:9px; margin-top:24px; } .facts span { padding:5px 10px; border:1px solid var(--line); border-radius:100px; font-size:.82rem; color:var(--muted); }
section.stop { padding:58px 0 14px; scroll-margin-top:28px; } .stop-title { margin:5px 0 14px; font-size:clamp(1.65rem,3vw,2.4rem); line-height:1.12; letter-spacing:-.035em; } .eyebrow { color:var(--accent); font-size:.76rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase; } h2 { margin:5px 0 14px; font-size:clamp(1.65rem,3vw,2.4rem); line-height:1.12; letter-spacing:-.035em; } h3 { margin:28px 0 8px; font-size:1.05rem; } p { margin:0 0 15px; } .analogy { padding:13px 17px; border-left:3px solid var(--signal); background:color-mix(in srgb,var(--signal) 9%,transparent); color:var(--ink); }
.map { margin:26px 0; padding:18px; overflow:auto; border:1px solid var(--line); border-radius:14px; background:var(--surface); } svg { min-width:640px; width:100%; height:auto; } .node { fill:var(--surface); stroke:var(--accent-vivid); stroke-width:2; } .node-text { fill:var(--ink); font-size:13px; font-weight:650; text-anchor:middle; dominant-baseline:middle; } .edge { stroke:var(--muted); stroke-width:2; } .route-node { transition:fill .25s,stroke .25s; } .route-node.highlight { fill:var(--accent-soft); stroke:var(--signal); stroke-width:4; } .legend { color:var(--muted); font-size:.8rem; margin:8px 0 0; }
.route { display:grid; gap:10px; margin:14px 0 20px; } .route button { display:grid; grid-template-columns:30px 1fr; gap:10px; width:100%; padding:11px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--ink); text-align:left; cursor:pointer; } .route button:hover, .route button.selected { border-color:var(--accent); background:var(--accent-soft); } .number { display:grid; place-items:center; width:26px; height:26px; border-radius:50%; background:var(--accent); color:var(--on-accent); font-size:.8rem; font-weight:700; }
.rule { margin:22px 0; padding:16px 18px; border-radius:10px; background:var(--accent-soft); } .rule strong { color:var(--accent); } pre { overflow:auto; margin:18px 0; padding:16px; border-radius:10px; background:var(--code); color:var(--code-ink); font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; } code, .path { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; } .path-wrap { display:inline-flex; align-items:center; gap:5px; } .copy { border:0; border-radius:5px; background:var(--accent-soft); color:var(--accent); cursor:pointer; font-size:.72rem; padding:2px 6px; }
details { margin:22px 0; border:1px solid var(--line); border-radius:10px; background:var(--surface); } summary { padding:13px 16px; cursor:pointer; font-weight:700; } details p { padding:0 16px 14px; color:var(--muted); } .next { margin-top:48px; padding:24px; border-radius:14px; background:var(--surface); border:1px solid var(--line); } .counter { position:fixed; right:24px; bottom:18px; padding:7px 11px; border:1px solid var(--line); border-radius:100px; background:var(--surface); color:var(--muted); font-size:.8rem; }
.sim { margin:56px 0 0; padding:24px; border:1px solid var(--line); border-radius:14px; background:var(--surface); } .sim-lede { max-width:640px; color:var(--muted); } .sim-stage { margin:16px 0 0; overflow:auto; } .sim-stage canvas { display:block; width:100%; min-width:640px; min-height:200px; } .sim-nodes { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; } .sim-nodes button { padding:6px 11px; border:1px solid var(--line); border-radius:100px; background:var(--surface); color:var(--ink); font-size:.82rem; cursor:pointer; } .sim-nodes button[aria-current="true"] { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); font-weight:700; } .sim-nodes button[data-broken="true"] { border-style:dashed; text-decoration:line-through; } .sim-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:16px 0 0; padding-top:16px; border-top:1px solid var(--line); } .sim-controls button { padding:8px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--ink); cursor:pointer; } .sim-controls button:hover { border-color:var(--accent); background:var(--accent-soft); } .sim-where { margin-left:auto; font-size:.82rem; color:var(--muted); } .sim-panel { margin:18px 0 0; } .sim-what { margin:0 0 12px; font-weight:700; } .sim-io { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; } .sim-io h4 { margin:0 0 6px; font-size:.76rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); } .sim-io pre { margin:0; } .series { display:grid; gap:12px; margin:28px 0 0; } .series a { display:grid; grid-template-columns:1fr auto; gap:6px 16px; align-items:baseline; padding:18px 20px; border:1px solid var(--line); border-radius:14px; background:var(--surface); color:var(--ink); text-decoration:none; } .series a:hover { border-color:var(--accent); background:var(--accent-soft); } .series .unit { color:var(--accent); font-size:.76rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase; } .series .what { grid-column:1; color:var(--muted); } .series .meta { grid-column:2; grid-row:1 / span 2; text-align:right; font-size:.8rem; color:var(--muted); white-space:nowrap; } .series-back { display:inline-block; margin:0 0 10px; font-size:.9rem; }
.sim-source { display:block; margin:6px 0 0; font-size:.78rem; color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; } .sim-steps { margin-top:18px; }
.chapter { padding:70px 0 0; } .chapter-head { padding-bottom:8px; border-bottom:1px solid var(--line); } .chapter-head h2 { margin:6px 0 10px; font-size:clamp(1.9rem,3.4vw,2.7rem); line-height:1.08; letter-spacing:-.04em; } .chapter-lede { max-width:700px; margin:0 0 6px; color:var(--muted); } nav .nav-group { margin:16px 0 4px; font-size:.7rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
@media (max-width:900px) { .layout { display:block; padding:22px 18px 60px; } nav { position:relative; top:0; margin-bottom:28px; } .nav-links { display:none; padding:8px 0; } .nav-links.open { display:block; } .nav-toggle { display:block; width:100%; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--ink); text-align:left; cursor:pointer; } svg { min-width:560px; } .counter { right:14px; } }
@media print { .top, nav, .counter, .copy, .sim-stage, .sim-controls, .sim-nodes { display:none; } .layout { display:block; max-width:none; padding:0; } details { display:block; } details > * { display:block; } section.stop { page-break-inside:avoid; } body { background:white; color:black; } }
@media (prefers-reduced-motion:reduce) { *,html { scroll-behavior:auto!important; transition:none!important; } }
```

---

## 4. Typography

One system sans stack, one system monospace stack. Never load a font.

| Role        | Size                          | Weight | Tracking | Notes                                    |
|-------------|-------------------------------|--------|----------|------------------------------------------|
| Body        | `16px/1.65`                   | 400    | normal   | `p` margin `0 0 15px`                     |
| `h1`        | `clamp(2.3rem,6vw,4.7rem)`    | bold   | `-.06em` | `line-height:1`, `max-width:720px`        |
| `h2`        | `clamp(1.65rem,3vw,2.4rem)`   | bold   | `-.035em`| `line-height:1.12`                        |
| `h3`        | `1.05rem`                     | bold   | normal   | `margin:28px 0 8px`                       |
| Lede        | `1.13rem`                     | 400    | normal   | `--muted`, `max-width:700px`              |
| Eyebrow, brand | `.76rem`                   | 750    | `.12em`  | uppercase, `--accent`                     |
| Nav link    | `.9rem`                       | 400/700| normal   | 700 when active                           |
| Facts, legend, counter, details body | `.8rem` to `.82rem` | 400 | normal | `--muted`                     |
| Copy chip   | `.72rem`                      | 400    | normal   | `--accent` on `--accent-soft`             |
| Code        | `13px/1.55`                   | 400    | normal   | monospace                                 |

The negative tracking on headings is load-bearing: it is most of what makes the page feel typeset rather than defaulted. Keep it.

Measure is capped deliberately. `minmax(0,820px)` on the content column, `720px` on `h1`, `700px` on the lede. Do not widen the content column to fit a diagram; diagrams scroll inside `.map` instead.

---

## 5. Layout and spacing

- **Grid.** `270px` navigation, `minmax(0,820px)` content, `52px` gap, `max-width:1200px`, centred, padding `48px 28px 80px`. The `minmax(0,...)` prevents a wide `<pre>` or SVG from blowing out the grid track, which is the failure this guards against.
- **Sticky navigation** at `top:36px`, `align-self:start`.
- **Sticky progress rail** at `top:0`, `z-index:5`, `5px` tall.
- **Section rhythm.** `.stop` has `padding:58px 0 14px` and `scroll-margin-top:28px` so anchored jumps do not hide the heading under the rail.
- **Radii.** `5px` copy chip, `8px` nav toggle, `10px` route buttons, rule, code blocks, details, `14px` map and next block, `50%` step badge, `100px` pills.
- **Borders.** `1px solid var(--line)` everywhere by default. `2px` left border for the active nav link. `3px` left border for the analogy rail. `3px` focus outline with `3px` offset.

---

## 6. Component catalogue

Each component below is fixed: same class names, same structure, same behaviour. Reuse them rather than inventing near-equivalents.

### 6.1 Progress rail

```html
<div class="top" aria-hidden="true"><div class="progress" id="progress"></div></div>
```

Fills as the document scrolls. Purely redundant with the counter, hence `aria-hidden`.

### 6.2 Sticky navigation

```html
<nav aria-label="Tour navigation">
  <div class="brand">Ember code tour</div>
  <h2>AI Assistant</h2>
  <button class="nav-toggle" id="nav-toggle" aria-expanded="false">Stops and navigation</button>
  <div class="nav-links" id="nav-links">
    <a href="#mount">1. Mounted assistant</a><a href="#contract">2. Shared contract</a>
  </div>
```

With chapters, the links are grouped and the numbering still runs straight through:

```html
  <div class="nav-links" id="nav-links">
    <div class="nav-group">Part 1 · The assistant</div>
    <a href="#mount">1. Where it mounts</a><a href="#contract">2. The contract</a>
    <div class="nav-group">Part 2 · Flexi</div>
    <a href="#doc">3. What a document is</a>
    <div class="nav-group">Part 3 · How they meet</div>
    <a href="#tool">4. The tool boundary</a>
  </div>
</nav>
```

Sticky sidebar above 900px, collapsible drawer below it. Links are numbered and prefixed with the stop number. The active link tracks the scroll position and takes the accent left border plus `--ink` at weight 700. The final link always points at the closing section.

### 6.3 Cover

```html
<header class="cover">
  <div class="brand">Deep tour · generated 5 August 2026</div>
  <h1>How Ember's AI assistant answers a question</h1>
  <p class="lede">One or two sentences on what the route follows, and one clause on what it deliberately excludes.</p>
  <div class="facts"><span>6 stops</span><span>15 minutes</span><span>Platform + Proto + API</span><span>In-depth</span></div>
</header>
```

The lede states the boundary of the page as well as its subject. Saying what a page does not cover is what stops a reader hunting for something that was never there. The facts row is four pills: count, reading time, area, depth.

### 6.4 Stop section

```html
<section class="stop" id="mount">
  <div class="eyebrow">Stop 1</div>
  <h2 class="stop-title">The assistant is mounted once, at the dashboard shell</h2>
  <p><strong>Why this exists.</strong> ...</p>
  <p><strong>The map.</strong> ...</p>
  <div class="map">...</div>
  <h3>The route</h3>
  <div class="route" data-route="mount">...</div>
  <div class="rule"><strong>Rule.</strong> ...</div>
  <details><summary>Checkpoint: ...</summary><p>...</p></details>
</section>
```

Always this order: eyebrow, heading, why, map, diagram, route, rule, checkpoint. The repetition across stops is what lets a reader stop reading the structure and start reading the content. The bolded lead-ins (`Why this exists.`, `The map.`, `Rule.`) are part of the pattern, not decoration.

The heading is a **claim**, not a label. "Protobuf is the boundary, not duplicated request types" teaches something; "The proto layer" does not.

### 6.5 Analogy rail

```html
<p class="analogy">Think of it as a shared reception desk: pages can send a visitor there, but the desk owns the queue.</p>
```

Teal left rail, 9 per cent tint. Use it where a concept genuinely needs scaffolding, and omit it where it does not. An analogy for something self-explanatory is noise, and the rail loses its meaning if it appears in every stop.

### 6.6 Map and diagram

```html
<div class="map">
  <svg viewBox="0 0 760 150" role="img" aria-label="Plain description of what the diagram shows">...</svg>
  <p class="legend">What the shapes and arrows mean.</p>
</div>
```

Panel on `--surface`, `14px` radius, horizontal scroll when the viewport is narrower than the diagram. The legend is optional after the first diagram, once the vocabulary is established.

### 6.7 Route stepper

```html
<div class="route" data-route="mount">
  <button data-node="mount-1"><span class="number">1</span><span><code>DashboardLayout</code> makes the assistant globally available.</span></button>
  <button data-node="mount-2"><span class="number">2</span><span>...</span></button>
</div>
```

The single highest-value interaction on the page. Clicking a step highlights the matching node in the diagram above via `data-node`. `data-node` values are namespaced per stop (`mount-1`, `contract-1`) because the selector is document-wide. Steps are real buttons, so they are keyboard reachable and take the focus ring for free.

### 6.8 Rule callout

```html
<div class="rule"><strong>Rule.</strong> Conversation ownership is part of the data query in <code>ConversationStore::loadOwnedConversation</code>. Removing the <code>creator_id</code> predicate would expose another user's chat through a known UUID.</div>
```

Accent tint block. State the consequence, not the prohibition: "if you remove X, Y happens" beats "do not remove X". One per stop, at most.

### 6.9 Path with copy chip

```html
<span class="path-wrap"><code>api/app/Slices/Assistant/Actions/Query.php</code><button class="copy" data-copy="api/app/Slices/Assistant/Actions/Query.php">copy</button></span>
```

Every repository path the reader might want in a terminal gets this treatment. The chip label swaps to `copied` for one second on click and then reverts. The `data-copy` value must match the visible text exactly.

### 6.10 Code block

```html
<pre><code>message QueryRequest {
  string query = 1;
}</code></pre>
```

Dark in both colour schemes, deliberately, so code reads as a distinct surface rather than as part of the page. Escape `<`, `>` and `&`. Keep fragments short: five lines showing a contract beat forty showing a file. If highlighting is needed, hand-write `<span>` elements with classes styled in the baseline. Never load a highlighter.

### 6.11 Checkpoint accordion

```html
<details><summary>Checkpoint: which file actually opens the panel?</summary><p><code>platform/src/core/assistant/assistant-ui-provider.tsx</code>, through its <code>setOpen(true)</code> actions.</p></details>
```

Native `<details>`, closed by default, one per stop, always last. **The answer is never visible before the click.** The recall attempt is the entire didactic value; revealing the answer removes it. The question is answerable from the stop the reader has just read, and never from outside it. Printing force-opens every accordion, which is handled in the baseline.

### 6.12 Closing section

```html
<section class="next" id="next">
  <div class="eyebrow">Where to go next</div>
  <h2>Three files to open next</h2>
  <p><span class="path-wrap">...</span> for client concurrency and optimistic state.</p>
  <p>The natural next tour is ...</p>
</section>
```

Two or three files with a reason each, then one sentence naming the next tour worth taking.

### 6.13 Chapter

Only used when a tour has more than one subject. See `code-tour` for when that applies.

```html
<section class="chapter" id="part-flexi">
  <div class="chapter-head">
    <div class="eyebrow">Part 2 of 3</div>
    <h2>Flexi on its own</h2>
    <p class="chapter-lede">What a Flexi document is, where it is stored and who owns its lifecycle. How the assistant reads one is deliberately left to Part 3.</p>
  </div>
  <section class="stop" id="..."> ... </section>
  <section class="stop" id="..."> ... </section>
</section>
```

- The chapter title is an `h2` and the stop titles inside drop to `h3`, both carrying `class="stop-title"` so they keep their type scale. Without chapters, stop titles stay `h2`. Heading level tracks the real hierarchy in both cases; the class carries the size.
- **Stop numbering runs continuously across the whole page.** Chapters group stops, they do not restart the count, so "Stop 7 of 11" and the counter keep working unchanged.
- The chapter lede says what this part covers **and what it defers to a later part**. That deferral is what stops a reader hunting in Part 2 for something Part 3 owns.
- Navigation groups its links under a `.nav-group` label per chapter.

### 6.14 Series index

The landing page of a tour series. It is the first page the user opens, so it earns its place or the series is six orphans in a folder.

```html
<div class="series">
  <a href="../proto--all--deep/index.html">
    <span class="unit">1 &middot; Proto</span>
    <span class="meta">7 stops &middot; 18 min &middot; in depth<br>5 August 2026</span>
    <span class="what">Define, version and generate the contract every other unit consumes.</span>
  </a>
</div>
```

- One card per tour, in the order the system's contracts demand, not alphabetically.
- The metadata comes from each member's `manifest.json`, read at build time. Do not retype it from memory: manifests stay correct when a member is refreshed and your memory does not.
- **Every tour that exists for the repository goes on this page**, not only the series members. Earlier tours of a single feature belong under a second heading. One place to find everything is what an index is for.
- Links are relative (`../<tour-id>/index.html`) so the whole directory can be moved or shared as a folder and still work from `file://`.

Each member page carries the return link as the first line of its closing section:

```html
<p class="series-back"><a href="../all--all--deep/index.html">Back to the tour index</a></p>
```

Without it a member is a dead end, and the only route from one tour to another is the file manager.

### 6.15 Counter

```html
<div class="counter" id="counter" aria-live="polite">Stop 1 of 6</div>
```

Fixed bottom right pill. `aria-live="polite"` so screen reader users get the position change without it interrupting them. Hidden in print.

---

## 7. SVG diagram conventions

One visual vocabulary across the whole page, so the reader learns to read it once.

- **Canvas.** `viewBox="0 0 760 N"`, where `N` is `150` for a single row and `160` or more when nodes stack. `width:100%; height:auto; min-width:640px` comes from the baseline, so wide diagrams scroll inside `.map` instead of shrinking to illegibility.
- **Nodes.** `<rect class="node route-node" data-node="stop-n" rx="10" height="60">`, width sized to the label. Surface fill, `--accent-vivid` stroke at `2`.
- **Labels.** `<text class="node-text">`, 13px, weight 650, centred. One line at `y = centre`, or two lines at `centre - 7` and `centre + 12`. Labels carry the **real names** from the codebase. A diagram labelled "Service A" has failed.
- **Edges.** `<line class="edge">` at 2px in `--muted`, with an arrow marker.
- **Markers.** Each `<svg>` needs its own `<defs>` with a **document-unique** marker id (`arrow`, `arrow2`, `arrow3`), because ids are document-wide and a repeated id silently points every diagram at the first one. Reference it with `marker-end="url(#arrow3)"` as an attribute on each `<line>`, consistently, rather than mixing a CSS `marker-end` on `.edge` with inline overrides.
- **Highlighting.** Nodes that correspond to a route step carry `class="route-node"` and a namespaced `data-node`. The highlight state is `--accent-soft` fill with a 4px `--signal` stroke, transitioned over `.25s`.
- **Accessibility.** Every `<svg>` gets `role="img"` and an `aria-label` that describes what the diagram shows in a sentence, not a list of node names.
- **Nothing decorative.** No gradients, no shadows, no illustration. Every shape means something and appears in the legend or a route step.

---

## 8. Canvas

A canvas is only ever added on top of the SVG layer, never instead of it. `visual-explainer` decides **whether** one is warranted and **which** mechanic to build; this section fixes **how** it is built, so a canvas on one page behaves like a canvas on every other page.

### 8.1 The contract

- **Pixel ratio.** CSS sets the display size. JS sets the backing store to that size multiplied by `devicePixelRatio` and scales the context once. Re-run both on `resize`, or the canvas is blurry on every retina screen and stretched on every window change.
- **Colour.** A canvas cannot read CSS custom properties. Read them through `getComputedStyle(document.documentElement).getPropertyValue('--accent')` and cache the set, invalidating on colour-scheme change. **No hex literal ever appears in canvas code**, exactly as in the CSS.
- **Colour scheme.** A canvas does not restyle itself when the system flips to dark. Listen for `matchMedia('(prefers-color-scheme: dark)')` change, re-read the tokens and redraw. Forgetting this leaves a light-mode canvas sitting in a dark page.
- **Idle.** No `requestAnimationFrame` loop runs while nothing is happening. Movement is driven by scroll, by a click, or by a run that finishes and cancels its own loop. A permanently running loop is both the peripheral-vision problem and a battery problem.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, draw the completed end state immediately, skip every transition, and keep all interaction working. A reader who has asked for no motion still gets the whole picture and can still click a node.
- **Print.** Canvas prints whatever bitmap it currently holds, which mid-animation is a meaningless frame. Listen for `beforeprint` and draw the end state first.
- **Accessibility.** A canvas is opaque to assistive technology. Give it `role="img"` and a descriptive `aria-label`, and treat it as strictly additive: **it never carries information that is not also in the prose or in a stop's SVG.** Every interaction it offers has a non-canvas equivalent elsewhere on the page.
- **Hit testing.** Keep a JS model of the node rectangles and test pointer coordinates against it. Set `cursor:pointer` only while the pointer is over an interactive region, so the affordance is honest.
- **Type.** Same font stacks as the page, nothing below 11px, same weights.
- **Fallback.** Whatever sits between `<canvas>` and `</canvas>` is what a reader without JS gets. Put a one-sentence description of the flow there, not nothing.

### 8.2 Vocabulary

The canvas uses the same visual language as the SVG diagrams, so a reader learns it once: rounded rectangles at `rx 8` to `10`, `--accent-vivid` strokes at 1.5 to 2, `--surface` fills, `--muted` edges with arrowheads, the active node in `--accent-soft` with a `--signal` stroke, real names from the repository on every node. A packet is a filled circle in `--accent`.

Failure gets no third hue. The two-hue discipline holds here too, so a broken node is marked by **pattern rather than colour**: a dashed stroke plus a cross drawn at the same weight, with the packet stopped against it and every downstream node dropped to a `--line` stroke and `--muted` label. This reads unambiguously in both colour schemes and for a reader who cannot distinguish red from green, which a red node would not.

### 8.3 The flow simulator

**The one canvas most tour pages should have, and it lives at the end of the document, not the top.** It is the recap: the reader has just walked six stops one at a time, and this is where the whole thing runs end to end in one place, under their control.

It absorbs what used to be four separate mechanics. A packet moving through the route, a payload changing shape, a node that can be made to fail, and a replay the reader scrubs are not four features; they are four views of the same simulation, and splitting them produced four half-built widgets instead of one good one.

Why the end and not the top: a sticky canvas at the top is in the reader's peripheral vision for the entire page, has to fight every other sticky element for offsets, and is useless before they know what the nodes mean. At the end it is a summary, which is a thing readers actually want, and it costs nothing while they read.

#### What it does

- **Transport controls.** Play and pause, next, back, reset. Play advances node to node, **dwelling at each one long enough to read the panel** (around 1.2s), and stops at the end rather than looping. Next and back step manually and pause. The reader is always in charge of the pacing.
- **Every node shows its input and its output** as the run passes through it: what arrived, what left, in the repository's own vocabulary. This is the payload transformation, now anchored to a node rather than floating with the packet.
- **Clicking a node makes it fail.** The run halts there, the node takes the failure treatment, everything downstream drops to inactive and is marked as never reached, and the panel shows **the actual error response that node produces**. Clicking again restores it. More than one node can be armed at once; the run stops at the first.
- **The panel names its sources.** Under each payload, the file it was taken from, as a monospace line with a copy chip. This is what makes "based on the real code" checkable rather than a promise, and it turns the simulator into a set of pointers back into the repository.

#### The data lives in the DOM, not in a JavaScript array

This is the important structural rule and it is what the previous version got wrong.

Ship every step as real markup inside a `<details class="sim-steps">` beneath the simulator, and have the script read the simulation out of that DOM. Do not define the steps as a JS object literal.

One decision buys four things: the page works with JavaScript disabled, the payloads are in the accessibility tree instead of trapped in a canvas, printing produces the complete flow because the baseline force-opens every `<details>`, and the canvas provably carries no information that isn't also available as text. A JS array gives none of those.

```html
<section class="sim" id="simulation">
  <div class="eyebrow">Summary</div>
  <h2>The whole flow, end to end</h2>
  <p class="sim-lede">Play it through, step it, or select a node and break it to see what the caller actually gets back.</p>

  <div class="sim-stage">
    <canvas id="sim" role="img" aria-label="Six nodes in sequence: web form, API, validator, queue, worker, orders table.">
      The flow runs web form, API, validator, queue, worker, orders table. Every step is listed in full below.
    </canvas>
  </div>

  <div class="sim-nodes" role="group" aria-label="Nodes">
    <button type="button" aria-current="true" data-broken="false">1. web form</button>
    <button type="button" aria-current="false" data-broken="false">2. api</button>
  </div>

  <div class="sim-controls">
    <button type="button" id="sim-back">Back</button>
    <button type="button" id="sim-play" aria-pressed="false">Play</button>
    <button type="button" id="sim-next">Next</button>
    <button type="button" id="sim-break">Break this node</button>
    <button type="button" id="sim-reset">Reset</button>
    <span class="sim-where" id="sim-where" aria-live="polite">Step 1 of 6 &middot; web form</span>
  </div>

  <div class="sim-panel" id="sim-panel"></div>

  <details class="sim-steps" id="sim-steps">
    <summary>Every step as text</summary>
    <ol>
      <li data-node="api" data-label="api">
        <h4>api</h4>
        <p class="sim-what">Parses the body against the shared schema and rejects anything that does not match.</p>
        <div class="sim-io">
          <div><h4>In</h4><pre><code>{ "lines": [ { "sku": "SKU-114", "qty": 2 } ] }</code></pre>
            <span class="sim-source">api/src/orders/routes.ts</span></div>
          <div><h4>Out</h4><pre><code>{ "orderId": "01J8F2K9", "status": "pending_stock" }</code></pre>
            <span class="sim-source">api/src/orders/routes.ts</span></div>
          <div><h4>If it fails</h4><pre><code>422 { "error": "lines must not be empty" }</code></pre>
            <span class="sim-source">api/src/orders/validate.ts</span></div>
        </div>
      </li>
    </ol>
  </details>
</section>
```

The panel is filled by cloning the matching `<li>`, not by rebuilding it from strings.

#### Layout and text fitting

The two things that break a simulator in practice are laying the nodes out in one row and drawing labels without measuring them. Both are specified here so neither is left to judgement.

**Nodes wrap onto rows. They are never all on one line.**

- **Four per row at 760px of canvas width and above, three below it.** Never more than four, whatever the width, because a node narrower than about 150px cannot hold a real component name.
- **Node width is fixed**, not derived by dividing the available width by the node count. Compute it once as `(width - gap * (perRow + 1)) / perRow`, using `perRow` above, so every node in every row is the same size and labels have a known budget. Deriving it from the node count is what makes a nine-node route render as nine slivers running off the right edge.
- **Rows read left to right**, like text, and the connector from the last node of one row to the first of the next is a rounded elbow going down and back, carrying its own arrowhead so the direction is unambiguous. Do not serpentine alternate rows: it saves a connector and costs the reader the reading order, which is the one thing a sequence diagram must not do.
- **The canvas height is computed from the row count** and set from JavaScript: `rows * (nodeHeight + rowGap) + padding`. The CSS gives it a `min-height` only. A fixed CSS height clips the second row.

**Labels are measured, never guessed.**

- Wrap with `context.measureText`, word by word, against the node's inner width minus 12px of padding each side. Not by splitting the word list in half, which is what produces text hanging out of the box.
- Up to **two lines**. If two lines still do not fit, step the font down 13px, 12px, 11px, and stop there. Nothing below 11px.
- If it still does not fit at 11px on two lines, truncate the second line with a single ellipsis character. **The full name always remains visible in the node's pill button and in the panel heading**, so nothing is actually lost, and the pills are where a long name belongs anyway.
- Measure after setting the font, not before. Setting `context.font` afterwards invalidates the measurement.

#### Why nodes render with no text, and how not to do that

Blank nodes are the most common visible canvas bug and there are three separate causes. All three are cheap to prevent and impossible to spot in code review, so they are specified rather than left to care.

**1. An undefined token silently discards the colour.** `getComputedStyle(el).getPropertyValue('--accent')` returns an **empty string** when the token is not defined, and `context.fillStyle = ''` is not an error: the assignment is simply ignored and the previous fill stays in place. If that previous fill was the node's background, the label is drawn in the background colour and the node looks empty.

Never read a token without a fallback:

```js
const token = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const ink = token('--ink', '#1b2420')
```

This is also why the full token set is not optional. A page that abbreviated `--accent-soft` to `--soft` gets an empty string everywhere it reads `--accent-soft`, and the failure shows up as blank canvas text rather than as anything that points at the cause.

**2. The label is read from the wrong element.** Do not fish the node's name out of the step markup with `querySelector('h4')`. A step contains several headings, `<h4>In</h4>` and `<h4>Out</h4>` among them, and one reordering of the markup is enough to start drawing the word "In" on every node, or to return `null` and throw.

**Put the label on the step as an attribute** and read exactly that:

```html
<li data-node="api" data-label="api">
```

`data-label` is required on every step, and it is what the canvas draws. The heading inside the step is for the reader; the attribute is for the renderer. When they disagree, nothing silently guesses which one was meant.

**3. The fitting logic returns an empty string.** Measuring and truncating has to guarantee a non-empty result. If a single word does not fit at 11px, do not emit `''`; truncate the word itself and append the ellipsis. Assert it before drawing:

```js
if (!line1) line1 = label.slice(0, 3) + '…'
```

A node showing `Ass…` is imperfect. A node showing nothing is broken, and the reader has no way to tell which node it was.

**More than eight nodes means the route is too coarse-grained for one simulator.**

At that point the reader is looking at a wiring diagram, not a route, and no amount of layout fixes it. Two ways out, in order of preference:

1. **Segment it.** With chapters, give each chapter its own simulator covering its own nodes. Three simulators of five nodes each teach far more than one of fifteen.
2. **Raise the altitude.** Collapse adjacent nodes that belong to the same unit into one node named for the unit, and let the per-stop diagrams carry the detail inside it. A node is a place where the payload meaningfully changes, not every function it passes through.

#### Interaction and accessibility

The canvas is the picture; the HTML controls are the interaction. Every action has a real button:

- The node pills select a node, mirror the run position with `aria-current`, and show a broken node with a dashed border and a strikethrough. Clicking the canvas is a shortcut for the same thing, never the only way.
- `Break this node` toggles failure on the selected node and updates the pill's `data-broken`. A node with no supplied error response is **disabled**, not silently inert, with a title explaining that the code did not yield one.
- `sim-where` is `aria-live="polite"` so the position is announced as it changes.
- Under `prefers-reduced-motion`, the packet does not tween: play jumps from node to node on the same dwell, and everything else is unchanged.
- In print, the canvas, the pills and the controls are hidden and the step list prints in full.

#### The failure states must come from the code

A made-up error response is worse than no break-it mode, because the reader cannot tell it apart from a real one and will quote it back later.

- The error shown for a node is the one that node actually returns: the status code and body from the handler, the exception the caller maps, the fallback value, the sentinel. If it is a 422 with a specific message, show that message.
- **A node with no error response found in the code is not breakable.** Disable it and say why.
- Every payload and every error carries its source file. If you cannot name the file, you did not read it, and it does not go in.

### 8.4 Timeline lanes

One lane per unit, time left to right, bars for active periods, a playhead the reader can drag. Lane labels are the unit names. The bar that matters is usually the one showing work continuing after the user already had a response, so label that moment explicitly rather than leaving it to be inferred.

Use this **instead of** the flow simulator's single row, not in addition, when the flow has asynchronous or parallel parts. A row of nodes does not merely omit concurrency, it asserts something false: that each step waits for the last. Everything else in 8.3 still applies, including the DOM-first data, the transport controls and the sourced payloads.

---

## 9. Motion

Animation earns its place by showing something a static picture cannot: a message travelling an edge, a step transforming an input, a state changing. Movement that only decorates is noise, and on a page someone is trying to learn from, it is worse than noise.

- CSS transitions by default. SMIL only for motion along a path.
- **Nothing loops in the reader's peripheral vision.** Animate on entry, on hover, or on an explicit interaction, then rest.
- Durations: `.2s` for the progress rail, `.25s` for node highlight, `.4s` ceiling for anything else.
- `prefers-reduced-motion: reduce` kills all transitions and smooth scrolling, and the page must remain fully usable and fully legible with every end state visible. The baseline handles this; do not add a transition outside it that the media query cannot reach.

---

## 10. Script contract

This is the whole script. Copy it verbatim; adjust only the stop count if it is not derived. It handles progress, active link, counter, route highlighting, copy chips, the mobile drawer, and keyboard navigation.

```js
const stops = [...document.querySelectorAll('.stop')]
const links = [...document.querySelectorAll('nav a')]
const progress = document.querySelector('#progress')
const counter = document.querySelector('#counter')
const navToggle = document.querySelector('#nav-toggle')
const navLinks = document.querySelector('#nav-links')
function updateProgress() {
  const scrollable = document.documentElement.scrollHeight - innerHeight
  progress.style.width = `${scrollable > 0 ? (scrollY / scrollable) * 100 : 0}%`
  let index = 0
  stops.forEach((stop, current) => { if (stop.getBoundingClientRect().top < innerHeight * .45) index = current })
  links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${stops[index]?.id}`))
  counter.textContent = `Stop ${Math.min(index + 1, stops.length)} of ${stops.length}`
}
addEventListener('scroll', updateProgress, { passive: true }); addEventListener('resize', updateProgress)
updateProgress() // required: without this the counter and the active link are wrong until the first scroll
document.querySelectorAll('.route button').forEach((button) => button.addEventListener('click', () => {
  const route = button.closest('.route')
  route.querySelectorAll('button').forEach((item) => item.classList.remove('selected'))
  document.querySelectorAll('.route-node').forEach((node) => node.classList.remove('highlight'))
  button.classList.add('selected')
  document.querySelectorAll(`[data-node="${button.dataset.node}"]`).forEach((node) => node.classList.add('highlight'))
}))
document.querySelectorAll('.copy').forEach((button) => button.addEventListener('click', async () => {
  await navigator.clipboard.writeText(button.dataset.copy)
  const label = button.textContent; button.textContent = 'copied'; setTimeout(() => { button.textContent = label }, 1000)
}))
navToggle.addEventListener('click', () => { const open = navLinks.classList.toggle('open'); navToggle.setAttribute('aria-expanded', open) })
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { navLinks.classList.remove('open'); navToggle.setAttribute('aria-expanded', 'false') }
  if (event.key === 'j' || event.key === 'k') { const current = stops.findIndex((stop) => stop.getBoundingClientRect().top >= -20); const next = event.key === 'j' ? Math.min(current + 1, stops.length - 1) : Math.max(current - 1, 0); stops[next].scrollIntoView({ behavior: 'smooth' }) }
})
```

Style: single quotes, no semicolons at statement ends, `const` by default, arrow functions for callbacks, `function` declarations for named functions. This matches `rules/` and the Platform pillar's own conventions.

---

## 11. Accessibility checklist

Run through this before delivering. It is short because the baseline does most of the work.

- Headings in order, no level skipped. One `h1`, on the cover.
- Every interactive element is a real `<button>`, `<a>` or `<summary>`. Never a clickable `<div>`.
- `:focus-visible` ring is present and never removed. `3px` `--focus`, `3px` offset.
- `nav` has an `aria-label`. The drawer toggle keeps `aria-expanded` in sync.
- Counter is `aria-live="polite"`. Progress rail is `aria-hidden="true"`.
- Every `<svg>` has `role="img"` and a descriptive `aria-label`.
- Colour is never the only signal. The active nav link gains a border and a weight change, not just a colour. The highlighted node gains a stroke width change, not just a hue.
- Keyboard: tab reaches everything, `j`/`k` move between stops, `Escape` closes the drawer.
- The page is readable and complete under `prefers-reduced-motion: reduce`, in both colour schemes, and when printed.

---

## 12. Responsive behaviour

One breakpoint, at `900px`.

**Above:** two-column grid, sticky sidebar, drawer toggle hidden, diagrams at `min-width:640px`.

**Below:** the grid collapses to a block, padding drops to `22px 18px 60px`, the sidebar becomes static with a full-width toggle button, the link list hides behind `.nav-links.open`, diagrams relax to `min-width:560px` and scroll, and the counter moves closer to the edge.

No other breakpoints. If something breaks between the two, fix the component rather than adding a breakpoint.

---

## 13. Print

Navigation, progress rail, counter and copy chips are hidden. The layout goes single column at full width. **Every `<details>` is forced open**, so a printed page carries the checkpoint answers rather than a list of unanswerable questions. Stops avoid page breaks. Background goes white, text goes black.

---

## 14. What may vary, and what may not

**May vary per page:** the content, the number of stops, the diagram shapes and their labels, the brand line and the page title, the facts pills, the reading time, whether an analogy appears in a given stop, and additional CSS rules appended below the baseline for something genuinely new.

**May not vary:** the token names and their values, the class names, the component structures, the script, the breakpoint, the font stacks, the radii, the focus treatment, the checkpoint being closed by default, and the two-hue discipline.

If a page seems to need a token or a component that does not exist here, that is a signal to extend **this file** so the next page gets it too, not to make a local exception. A local exception is invisible to the next page and guarantees drift.

---

## 15. Verification before delivering

**Run `_shared/check-tour.mjs` first.** It mechanises most of this list, including the whole token set and the real palette values, and it takes under a second:

```
node ~/.config/opencode/skills/_shared/check-tour.mjs <path-to-index.html> --stops N
```

A page that fails it is not delivered. The manual checks below cover what a script cannot see.


- [ ] Opens from `file://` with the network disabled, and looks complete.
- [ ] No external request of any kind in the source. Grep for `http://`, `https://`, `//cdn`, `@import`, `<link`.
- [ ] Readable in both light and dark, checked by toggling the system setting, not by reasoning about it.
- [ ] Any new colour pairing has a computed contrast ratio, not an estimated one.
- [ ] Every diagram has a unique marker id, and every `data-node` resolves to a node in that stop's diagram.
- [ ] Every `data-copy` matches its visible path exactly.
- [ ] Tab through the whole page: the focus ring is visible on every stop, and nothing is unreachable.
- [ ] `j`, `k` and `Escape` behave.
- [ ] Print preview: no navigation, accordions open, nothing clipped.
- [ ] Reduced motion on: nothing animates, nothing is hidden as a result.
- [ ] Every canvas: no hex literals, tokens re-read on colour-scheme change, `devicePixelRatio` applied, no idle animation loop.
- [ ] Every canvas: end state drawn under reduced motion and before printing, `role="img"` and `aria-label` present, fallback text between the tags.
- [ ] Simulator: the step data is real markup inside `.sim-steps`, not a JavaScript array. Disable JS and check the payloads are still there.
- [ ] Simulator: every payload and every error response shows the file it came from, and that file exists.
- [ ] Simulator: nodes with no error response in the code are disabled rather than breakable with an invented failure.
- [ ] Simulator: play dwells long enough at each node to read the panel, and stops at the end instead of looping.
- [ ] Simulator: nodes wrap at four per row (three when narrow), every node is the same width, and no node is clipped by the canvas edge.
- [ ] Simulator: every label was measured with `measureText` and fits inside its node. Check the longest name in the route, not the first one.
- [ ] Simulator: every step has a non-empty `data-label`, and every node on the canvas actually shows text. Look at the picture, do not infer it from the code.
- [ ] Simulator: every `getPropertyValue` call has a fallback. An undefined token returns an empty string and silently keeps the previous colour.
- [ ] Simulator: the canvas height was computed from the row count in JavaScript, so the last row is not cut off.
- [ ] Simulator: eight nodes or fewer. More than that means segmenting per chapter or collapsing nodes to unit level.
- [ ] `updateProgress()` is called once at the end of the script, not only bound to events.
- [ ] Chapters present: numbering runs continuously, chapter titles are `h2` with stop titles at `h3`, and navigation is grouped.
