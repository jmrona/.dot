---
name: brainstorming
description: "You MUST use this before any code edit: creating features, fixing bugs, building components, adding functionality, refactoring, or modifying behaviour. Routes the design step to standard, committee, or skip mode based on a single user choice, then hands off to the chosen mode skill."
---

# Brainstorming (Router)

This skill is the procedural entry point for the design step required by `../../rules/common/workflow.md`. Its only job is to put the session into plan mode and then hand off to one of three mode skills:

- `brainstorming-standard`: interactive dialogue, user knows the codebase
- `brainstorming-committee`: hands-off deliberation by three subagents, user reviews the final design
- `brainstorming-skip`: lightweight design capture for cases where structured brainstorming would be overkill

For the rule that no implementation may begin until a design has been approved, see `../../rules/common/workflow.md`. For the rule that this skill must be invoked before any code edit, see `../../rules/common/skills-policy.md`.

## When to Run

Invoke this skill before any code edit, no matter how small. The three modes give you a gradient: full structured brainstorming for genuinely new design work, lightweight skip for changes where the design is already obvious to the user. The skip option exists, so the router can be a hard requirement without becoming a usability tax. You **MUST NOT** rationalise your way out of invoking the router by deciding the work is "obvious" or "small", that is the skip option's job, not yours.

## Procedure

1. **Enter plan mode.** Use `entering plan mode (in OpenCode, plan mode is toggled by the user pressing Tab; ask the user to enter plan mode before reviewing the design)`. Plan mode's read-only safety enforces the design-before-implementation rule from `../../rules/common/workflow.md` for the duration of the session, regardless of which mode is chosen.
2. **Recommend a mode, then ask the user which mode.** Choose the mode you recommend from evidence in the request. Recommend skip only when a design is already agreed in context or a ticket carries one. Do not recommend skip just because the change looks small. Recommend committee when there are several open technical decisions or the user asks for hands-off work. Recommend standard otherwise. Put the recommended option first and append ` (Recommended)` to its label. Use ` (Recomendado)` when the user writes in Spanish. Begin its description with `Recommended because` and the specific reason from this request. The other options keep the descriptions below. Ask with `question` as specified below. **MUST NOT** ask as plain text. Recommending is advice, not selection: you **MUST** ask and wait for the user's choice. There is one exception. If the design input has `Source: work-on-ticket` and a `Mode:` line, the user already chose the mode in the `work-on-ticket` scope question. In that case, plan mode is still mandatory, and you hand off to that mode without asking. If a ticket input has no `Mode:` line, or the input does not come from `work-on-ticket`, ask as described above.
3. **Hand off via `skill`.** Invoke the chosen mode skill and stop. Do not run any of the steps yourself; the mode skill owns the entire procedure from this point. **MUST NOT** invoke more than one mode skill, and **MUST NOT** invoke `create-tickets` or `subagent-driven-development` directly: those are downstream of the mode skill, not of the router.

## The Mode Question

The options are listed in their default order. At ask time, move the recommended option to the top and mark it as step 2 describes.

```
question:
  question: "How would you like to approach the design step?"
  header: "Mode"
  options:
    - label: "Standard brainstorming"
      description: "Interactive dialogue. I know the codebase. Reach a design efficiently."
    - label: "Committee brainstorming"
      description: "Hands-off deliberation by 3 AI agents. I will only review the final design."
    - label: "Skip brainstorming"
      description: "I have a clear design already. Capture a brief statement and proceed to implementation."
  multiSelect: false
```

| User picks              | Hand off to               |
|-------------------------|---------------------------|
| Standard brainstorming  | `brainstorming-standard`  |
| Committee brainstorming | `brainstorming-committee` |
| Skip brainstorming      | `brainstorming-skip`      |

## What This Skill Does Not Do

- It does not explore the codebase. The mode skill does that.
- It does not ask clarifying questions about the brief. The mode skill does that.
- It does not present a design. The mode skill does that.
- It does not invoke `design-review`. The interactive mode skills do that; `brainstorming-skip` does not run `design-review` because the user has explicitly chosen a lightweight path.
- It does not invoke `create-tickets` or `subagent-driven-development`. The mode skill does that after the user has approved the design.

If you find yourself doing any of the above inside this skill, stop. You have skipped the hand-off. Invoke the chosen mode skill and let it run.

## Common Mistakes

| Mistake                                                    | Why it is wrong                                                                                    |
|------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| Picking a mode for the user                                | The user picks. The router asks, except for a user-chosen `Mode:` line in a `work-on-ticket` input. |
| Picking `brainstorming-skip` because the work "looks easy" | Recommending skip is allowed. Selecting it is not: the user picks the mode.                        |
| Recommending without a reason | The description of the recommended option **MUST** start with `Recommended because` and a reason taken from the request. |
| Skipping the router because the user said "just add X"     | "Just add X" does not waive the router. Invoke the router; the user can pick skip if they want to. |
| Running the chosen mode's procedure inline                 | The router only routes. Hand off via `skill`.                                      |
| Skipping plan mode because the session "feels safe"        | Plan mode is the gate. Enter it before asking the question.                                        |
| Asking the mode question as plain text                     | Use `question`. Plain text invites freeform answers that defeat the routing.     |
