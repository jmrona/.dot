# Initial Questionnaire — cognitive-profile

## Instructions for the LLM (do not show to the user)

- Present the statements one at a time, or in small groups of 2–3, never all 10 in a single block — that overwhelms the user and lowers response quality.
- The user responds with 1–5 (agreement scale, see table below).
- Do not reveal which cognitive axis a statement belongs to, or which "extreme" it represents — this could bias the answer (desirability effect: the user might try to appear "more senior" or "more independent" if they understand the mapping).
- The two statements for the same axis (A and B) must not be shown consecutively — separate them with at least one statement from another axis, to avoid the user comparing them directly and trying to be artificially "consistent" rather than answering each one honestly on its own.
- At the end, calculate each axis's score using:
  `score = 1 + ((agreement_B - agreement_A + 4) / 8) * 4`
  (this maps the difference in agreement between extreme A and extreme B onto a 1–5 scale; if both come out equal, the score lands around 3, the centre.)
- If the user is writing in English, present the statements in British English. If they write in Spanish, present them in Spanish. The skill detects the language of the user's own message in that session — it never assumes anything in advance.

### Input method per question type — important

OpenCode's built-in `question` tool always renders a header, the question text, and a list of options — the user can either pick one of the listed options or use the tool's own built-in "type a custom answer" affordance. There is no way to present a question with *zero* options through this tool. Given that constraint, follow this split:

- **Block 1 statements (the 10 agreement statements)**: fixed 1–5 scale → call `question` with the five scale values as the listed options (in descending order, 5 to 1). This is the correct, intended use of the tool here.
- **`seniority_level`, `preferred_terminology_style`, `session_pace_preference`**: fixed set of mutually exclusive options → call `question` with those options listed.
- **`is_english_native`**: Yes/No → call `question` with exactly those two options.
- **`known_technologies` and `additional_context`**: these are open-ended, free-text answers with no fixed set of valid responses. When calling `question` for these:
  - Do **not** invent two near-duplicate options that both claim to let the user type an answer (e.g. never offer both "Use custom answer" and "Type your own answer" as separate listed options — this produces a broken, confusing selection state, since only the tool's own native custom-answer affordance actually captures free text).
  - List **zero** suggested options if the tool allows it, relying entirely on the native "type a custom answer" affordance. If the tool requires at least one listed option to be present, list exactly **one** brief option such as `"Skip / nothing to add"` (for `additional_context`) — never a second option that duplicates "type your own answer", since the user's actual free-text input always goes through the tool's own custom-answer mechanism, not through a listed option.
  - If, when testing this skill, the question tool's behaviour still produces a confusing or broken state for free-text answers, fall back to asking the question as a plain conversational message with no tool call at all, and wait for the user's normal chat reply instead.

## Agreement scale (always show before the first question)

| Value | Meaning |
|---|---|
| 5 | Strongly agree / describes me perfectly |
| 4 | Somewhat agree |
| 3 | Neutral / not sure |
| 2 | Somewhat disagree |
| 1 | Strongly disagree / doesn't describe me at all |

---

## Block 1 — cognitive_profile (10 statements)

### Axis: concreteness
- **A (theory_first)**: "I prefer to understand the general concept or theory first, before looking at any related code."
- **B (code_examples_first)**: "I prefer to see a working code example first, and understand the theory from that example."

### Axis: structure
- **A (system_overview_first)**: "Before touching any code, I need to see how all the pieces of the system fit together."
- **B (incremental_build_up)**: "I prefer to start with the smallest, most concrete piece and build up the bigger picture gradually."

### Axis: modality
- **A (narrative_explanation)**: "I understand a new system better by reading a well-structured written explanation than by looking at a diagram."
- **B (diagrams)**: "I understand a new system better by looking at a diagram (flow, architecture or sequence) than by reading an explanatory text."

### Axis: autonomy
- **A (guided_steps)**: "I learn best when I have clear, sequential steps with checkpoints at each stage."
- **B (exploratory_sandbox)**: "I learn best when I have freedom to explore and experiment with minimal guidance."

### Axis: abstraction_bridge
- **A (technical_precision)**: "I prefer concepts explained using precise technical terminology, without comparisons to other things."
- **B (real_world_analogies)**: "I understand a technical concept better when it's compared to a real-life experience or situation."

---

## Block 2 — background_context

These questions do not use the 1–5 scale; they take direct answers.

### is_english_native
> ALWAYS show this brief clarification before the question, so the purpose is clear (to avoid it being perceived as a filter or a judgement):
>
> "This question is only to help me adjust the level of technical vocabulary I use in English with you — never to limit anything or judge your ability. If English isn't your first language, I can use simpler terms or explain technical vocabulary in more detail when we talk in English. If you talk to me in another language, this has no effect at all on how I respond."
>
> Question: "Is English your first language?" → Yes / No

### expressive_vagueness_baseline
> ALWAYS show this brief clarification before the question, for the same reason as above — this isn't a judgement of ability, it's purely so ticket-coach doesn't mistake your normal way of expressing yourself for a sign of confusion:
>
> "This one is just so I calibrate how I read your answers later — some people are naturally concise or find it harder to put technical thinking into words on the spot, and that's completely normal. Knowing this in advance means I won't mistake your normal phrasing for a sign you're confused."
>
> Question: "Do you generally find it hard to put technical thinking into words, even when you understand the concept clearly?" → Yes / No

### known_technologies
> **(Free-text answer. When calling the `question` tool, list at most one option — e.g. none, or a single neutral placeholder if the tool requires one — and rely on the tool's native custom-answer input for the actual response. Do not list two options that both mean "type your own answer".)**
>
> "Which programming languages, frameworks, libraries or tools have you worked with, and how would you describe your level in each (learning / intermediate / expert)? Feel free to include anything — not just languages — that might help me build useful comparisons later (e.g. 'Redux', 'Docker', 'TanStack Query'), along with the context you used it in (e.g. 'TypeScript with React', 'PHP with Laravel')."
>
> When recording the answer, classify each item's `type` as `language`, `framework`, `library`, `tool`, or `platform` based on what the user actually named — do not ask the user to classify it themselves, infer it from the name (e.g. "PHP" → language, "Laravel" → framework, "Redux" → library, "Docker" → tool, "AWS" → platform). If genuinely ambiguous, pick the closest fit rather than asking a follow-up question — this is a low-stakes classification used for grouping, not a fact the user needs to confirm.

### seniority_level
> "How would you describe your current experience level?" → Junior / Mid / Senior / Staff or above

### preferred_terminology_style
> "When I explain something, would you rather I use project/ticket-specific terms (e.g. 'island rendering pipeline') or more generic computer science terms, even if that loses some of the project-specific context?" → Domain-specific terms / Generic CS terms

### session_pace_preference
> "Do you prefer short, frequent learning sessions, or long blocks of deep, uninterrupted focus?" → Short and frequent / Long and deep / No strong preference

### additional_context (free-text field, last)
> **(Free-text answer. If calling the `question` tool, list exactly one option, `"Skip / nothing to add"`, and rely on the tool's native custom-answer input for anything the user actually wants to say. Do not list a second option that duplicates "type your own answer".)**
>
> "Lastly — is there anything else you'd like to add that you think would be useful for me to know? For example, something that would help me give you examples based on that experience, or explain things using something you already understand. This is entirely optional, so feel free to just say 'no' if there's nothing to add."

---

## Implementation notes

- After collecting the 10 Block 1 statements, apply the conversion formula and generate the 5 `cognitive_profile` scores, all with `"confidence": "self-reported"` (this is the first run, so there is no observed data yet).
- Calculate `cognitive_weights` from the scores using: `weight_B = (score - 1) / 4; weight_A = 1 - weight_B`.
- **Show this arithmetic explicitly, step by step, for all 5 axes and all 5 pairs before writing any JSON — see SKILL.md, FLOW A, step 6, for the mandatory worked-example format and self-check.** Do not compute these numbers silently; an LLM doing five chained calculations in its head is the most common source of an invalid profile.json (pairs not summing to 1.0).
- Build the full document per `schema.json` and validate before saving.
- The first `update_history` entry must be `{ "trigger": "initial_creation", "method": "full_questionnaire", "date": "<today's date>", "changes": null }`.
- If the user leaves `additional_context` blank or says "no, nothing else", do not create an entry in the array — leave it as an empty array `[]`, not an entry with empty content.