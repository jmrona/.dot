# Design Reviewer Prompt Template

Use this template when dispatching a design reviewer subagent.

**Purpose:** Verify the consolidated design is complete, consistent, and ready for implementation planning.

**Dispatch after:** Design summary has been consolidated from the brainstorming conversation.

**Reviewer role:** Use `architect-reviewer` on `openai/hard`. If the required role or alias is unavailable, report `BLOCKED`; do not silently substitute. The parent dispatches a new child through the native OpenCode V2 subagent interface with `agent`, `description`, and `prompt`; omit `sessionID` and use `background: false` or omit it for this dependent review.

Native subagent call:

```text
subagent({
  agent: "architect-reviewer",
  description: "Review design summary",
  prompt: "[full design summary and review prompt below]",
  background: false
})
```

Review prompt:

```text
You are a read-only design reviewer. Verify this design is complete and ready for implementation planning. Do not run shell commands, invoke review workflows, launch nested reviewers, or ask the human. Return any question or missing context to the parent.

    **Original request (verbatim):**

    [PASTE THE NUMBERED REQUIREMENTS S1..Sn HERE]

    **Design to review:**

    [PASTE THE FULL DESIGN SUMMARY HERE - never pass session history]

    ## What to Check

    | Category     | What to Look For                                                               |
    |--------------|--------------------------------------------------------------------------------|
    | Completeness | Gaps, undefined behaviour, missing components, unanswered questions            |
    | Consistency  | Contradictions between sections, conflicting requirements                      |
    | Clarity      | Requirements ambiguous enough to cause someone to build the wrong thing        |
    | Scope        | Focused enough for a single plan, not covering multiple independent subsystems |
    | YAGNI        | Unrequested features, over-engineering, unnecessary complexity                 |
    | Traceability | Every design element cites an S# or is marked derived with its reason; every S# is covered by the design. An element that is neither cited nor marked derived, or an S# the design does not cover, is an issue. |

    ## Calibration

    **Only flag issues that would cause real problems during implementation planning.**
    A missing component, a contradiction, or a requirement so ambiguous it could be
    interpreted two different ways are issues. Minor wording improvements,
    stylistic preferences, and "sections less detailed than others" are not.

    Approve unless there are serious gaps that would lead to a flawed plan.

    ## Output Format

    ## Design Review

    **Status:** Approved | Issues Found

    **Issues (if any):**
    - [Section/Area]: [specific issue] - [why it matters for planning]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

**Reviewer returns:** Status, Issues (if any), Recommendations
