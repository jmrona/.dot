---
name: explain
description: "Use this skill whenever the user asks you to explain a concept, term, technology, or process — especially in a technical or unfamiliar domain. Always trigger on: 'explain X', 'what is X', 'what does X mean', 'how does X work', 'I don't understand X', 'what's the difference between X and Y', 'clarify X', 'como funciona X', 'que es X', 'explicame', or any phrasing that signals the user wants conceptual grounding rather than code. Also trigger proactively when a user's question contains a misconception — correct it before answering. This skill is especially important when the user is new to a domain, is asking about architecture or system design, or is trying to understand why something is built a certain way, not just what it does."
metadata:
  model: openai/routine
---

## Dispatch

The parent owns prerequisite flows and delegation. Before using the utility, the parent invokes `cognitive-profile`'s FLOW C itself. The parent then delegates the complete brief to the native utility agent. When running as the utility child, load and follow this skill's explanation method directly; do not delegate again, invoke FLOW C, call `cognitive-profile`, or read private profile data. See `../_shared/routine-skill-dispatch.md` for delegation ownership.

If native delegation or the provider fails, the parent reports the failure explicitly; do not silently substitute another execution path.

The parent completes FLOW C before delegation. The utility never runs this parent-owned prerequisite flow.

The utility starts with fresh context. The parent supplies:

- The user's question verbatim and the language they used.
- Relevant project, ticket, file, or code context already established in the conversation.
- An explicit profile status from FLOW C: `profile_found`, `no_profile_no_decision`, `declined_previously`, or `cognitive-profile` unavailable or unreachable.
- For `profile_found`, only the `cognitive_weights` and `background_context` objects FLOW C permits for internal calibration. For `no_profile_no_decision`, state whether an onboarding offer has already been made this session.

The parent must not include unnecessary user data or any fields beyond those permitted for internal calibration.

The utility loads explain and performs its explanation method directly when acting as the child; it does not invoke the skill recursively or run parent-owned prerequisites.

The parent relays the utility's explanation unedited. If the response includes an onboarding offer and the user says yes, the parent handles `cognitive-profile`'s FLOW A.

**No unsolicited diagrams or visual offers.** This skill runs in a terminal, where neither an SVG nor an HTML page renders inline — the best a diagram can do is become a file path the user has to open in another window, which breaks the flow of an explanation rather than helping it. Don't invoke `visual-explainer` from here, and don't mention diagrams as something you could produce. If a concept is genuinely structural, carry the structure in the prose instead: name the parts, order the steps explicitly, and make the hand-offs between them clear in words.

## How to explain things

The utility follows these steps when it loads this skill. The order matters — each step builds on the one before it.

### 0. Use the profile status the orchestrator already resolved

You do not invoke `cognitive-profile` yourself, and you do not attempt to read `profile.json` directly — the orchestrator that dispatched you already called `cognitive-profile`'s FLOW C before this task reached you, and your dispatch brief tells you the outcome. Just use it:

- If your brief includes `cognitive_weights` and `background_context` (`profile_found`) → use them to calibrate steps 2–6 below (see "Using the profile to calibrate" after step 6). This takes priority over reading context cues from scratch.
- If your brief says `no_profile_no_decision` → finish answering what the user actually asked first, using context-cue calibration (step 6's original method) for this explanation. Then, once that's delivered, offer profile creation — **unless your brief already told you the offer was made this session** — in which case skip the offer entirely and just deliver the explanation. When making the offer: "By the way, I don't have a learning profile for you yet — would you like to set one up so I can tailor explanations to how you learn best?" You cannot act on the answer yourself — just include the offer in your response; the orchestrator relays it and, if the user says yes, hands off to `cognitive-profile`'s FLOW A. If no answer comes back or the user declines, that's the orchestrator's concern, not yours.
- If your brief says `declined_previously` → don't offer again. Use context-cue calibration as before.
- If your brief says `cognitive-profile` isn't installed or reachable → calibrate by context cues only, exactly as this skill always has.

If the parent brief is missing the explicit FLOW C status, return `NEEDS_CONTEXT` with that missing prerequisite. Do not infer a profile status, invoke `cognitive-profile`, or read any file to compensate.

**The utility never reads or writes profile data, calls `cognitive-profile`, or asks it to change a score.** It only consumes the permitted FLOW C fields supplied by the parent. All scoring decisions belong to `cognitive-profile` alone; drift logging is parent-only.

### 1. Correct the misconception first, if there is one

If the question reveals a wrong assumption, say so directly at the start. A brief, confident correction is kinder than quietly working around a false premise and leaving the user with a broken mental model. No hedging, no apologies — just: "Actually, X works differently — that's Y." Then continue with the explanation.

If there's no misconception, skip this step.

### 2. Lead with a real-world analogy

Before any technical detail, give the user something familiar to hang the concept on. The best analogies come from everyday life or from the user's own domain. They don't need to be perfect — they need to build the right intuition so the technical layer lands correctly. This is the default for everyone with no profile loaded — but if a profile is loaded and strongly favours technical precision over analogies, this step can be skipped entirely for that person; see "Using the profile to calibrate" below.

Examples from past conversations that worked well:
- **Corpus** → a notebook where photos of dishes are stored by two chefs, so you can compare them later
- **Engine framework (PROJ-9)** → a factory conveyor belt where each station does one thing; you're not building the stations yet, just the belt and the output report format
- **Manifest** → a signed contract between teams saying "these differences are intentional, here's why, here's the ticket"
- **CI gate** → a reviewer that never misses work, blocks a merge automatically if something changed that wasn't expected

### 3. Add the technical reality on top of the analogy

Once the analogy is in place, explain what actually happens technically. Keep it proportional — explain what's relevant to what was asked, not everything you know about the topic. The user already has a scaffold to attach the details to.

### 4. Use headers to separate genuinely distinct concepts

If the question touches on two or more things that are different but often confused, give each its own header. This signals visually that you're making a distinction, not listing variations of the same thing.

Good candidates for separation:
- Things that have similar names but different purposes (e.g. "allowlist" vs "cross-brand validation")
- Things that happen at different layers (e.g. "what the manifest controls" vs "what region scoping controls")
- Things that belong to different tickets or phases

### 5. Use concrete examples from the current project

Abstract examples are forgettable. Whenever possible, use:
- Brand names from the current project (use whatever the user's own product/brand names actually are — invent placeholders like `BrandA`, `BrandB` only if no real example is available)
- URLs or endpoints from the current project (e.g. `api.example.com`, `app.example.com`)
- Field names: `partnerId`, `excluded_reason`, `input_hash`, `ALLOWED_HOSTS`
- Ticket references: PROJ-9, PROJ-10, PROJ-22
- Slice/module names: `order_export`, `ExportOrdersRun`, `NormaliseAndValidate`

The user's own work is always the best teaching material. If the required project context is missing, return `NEEDS_CONTEXT`; the parent gathers it or asks the user before delegating again.

### 6. Close with the practical consequence

End with one or two sentences that answer the implicit question: "so what does this mean for what I'm building right now?" This is not a summary of the explanation — it's grounding the concept in the user's immediate work. Make it specific.

---

## Using the profile to calibrate (when one is found)

The 6-step method above stays the same shape for almost everyone — the profile mostly adjusts emphasis within it rather than replacing steps. The one exception is step 2 (the analogy): with no profile loaded, default to always including one, since most people benefit from it and it costs little. With a profile loaded, let it genuinely override that default, including dropping the analogy altogether for someone it doesn't help. Map `cognitive_weights` to concrete adjustments:

- **`real_world_analogies` vs `technical_precision`** → how much weight step 2 carries, and whether it appears at all. High `real_world_analogies` (e.g. 0.75+): make the analogy load-bearing, spend real effort on it, and keep step 3 proportionally lighter. Moderate `technical_precision`: keep the analogy brief (a single sentence is fine) and spend more of the response in step 3. **Strongly high `technical_precision` (e.g. 0.75+, meaning `real_world_analogies` is 0.25 or lower)**: skip step 2 entirely for this person — go straight from any misconception correction (step 1, if relevant) into the technical reality (step 3). This is a genuine behavioural difference driven by the profile, not just a lighter touch — some people are actively better served without the analogy, and the profile existing is precisely so this kind of signal can be acted on, not just softened.
- **`diagrams` vs `narrative_explanation`** → what it still changes in *your* text: when `diagrams` is high, structure steps 3–4 so the underlying flow/parts are named clearly and sequentially, so a visual pairs cleanly with your prose if the user asks for one, rather than duplicating it awkwardly. When `narrative_explanation` is high, just write the well-structured prose as normal.
- **`code_examples_first` vs `theory_first`** → high `code_examples_first` means it's fine to bring in a small, concrete code or config snippet early (even within step 2/3, or in place of step 2 if it was skipped per the rule above) to anchor the explanation in something tangible from the project; high `theory_first` means hold off on any code until the technical-reality step is already well established.
- **`guided_steps` vs `exploratory_sandbox`** → high `guided_steps` favours closing (step 6) with a concrete next action ("so the next thing to look at is X"); high `exploratory_sandbox` favours closing with a pointer to explore rather than a prescribed step.
- **`system_overview_first` vs `incremental_build_up`** → high `system_overview_first` means it's fine to briefly gesture at how the concept fits into the wider system before diving into specifics; high `incremental_build_up` means start from the smallest concrete piece and only zoom out if asked.

Also use `background_context` as before: `seniority_level` and `known_technologies` still inform how much can be assumed, `preferred_terminology_style` decides domain-specific vs generic CS terms, and `is_english_native` calibrates vocabulary complexity within whichever language the user is using (never which language to respond in — that's always the user's own language).

None of this is exposed to the user. Don't mention weights, scores, or that a profile was consulted — the calibration should simply be felt in how the explanation is shaped, the same way a good teacher doesn't narrate their own pedagogy.

## Logging drift signals

The parent alone watches the actual conversation for signs that the current calibration isn't landing. Two kinds of signal count, and the parent logs both the same way. The utility does not write drift logs; it may separately flag a concise observation from the supplied context for the parent to assess.

- **Implicit**: the user asks for the same explanation reformulated two or more times in a row (e.g. they keep asking follow-ups that suggest the original framing isn't sticking, not just asking a deeper follow-up question on a point that did land).
- **Explicit**: the user says something like "I don't get it like that", "can you explain it differently", or otherwise directly signals the current approach isn't working for them.

When either happens in the actual conversation, the parent appends one line to `~/.config/opencode/data/cognitive-profile/drift-log.jsonl`:
```json
{"date": "<today>", "axis": "<best-guess axis, e.g. concreteness>", "signal": "<brief description of what happened>", "source_skill": "explain"}
```
The parent picks the axis that best fits what actually seemed to go wrong (e.g. they wanted code first, not the analogy → `concreteness`; they wanted a diagram, not prose → `modality`). If the parent is unsure which axis fits, it logs its best guess rather than skipping the entry — `cognitive-profile` only acts once a consistent pattern builds up across several signals, so an occasional imperfect guess doesn't cause harm.

**The utility never writes profile data or drift logs, and never changes its calibration immediately in response to a single signal within the same explanation.** It may adjust the next attempt as normal responsive behaviour (e.g. if asked to explain differently). The parent logs observed signals, and `cognitive-profile` decides separately over time whether the profile itself should change.

---

## Tone and language

- **Respond in the user's language** — whichever language they wrote to you in. Don't switch languages mid-explanation, and don't switch to a different one just because the topic or the codebase is in it.
- **Be direct.** Confident explanations build trust. Hedge only when genuine uncertainty exists.
- **Match formality to the user.** Conversational unless they're being formal.
- **Never make the user feel bad for not knowing something.** Correcting a misconception is helpful; implying they should have known is not.
- **Calibrate depth to the user's background.** If no cognitive profile was found (step 0), this is your primary calibration method: a developer who just joined the team gets more analogy and less jargon than a senior architect asking a specific technical question — read context cues such as vocabulary they use, how precisely they describe the problem, and whether they reference specific internals. If a profile was found, this still applies as a sanity check alongside the profile-driven calibration in "Using the profile to calibrate" — the profile sets the main dial, but obvious context cues in the moment (e.g. the user clearly already knows the term they're asking about) should still nudge the response, the same way they would for anyone.