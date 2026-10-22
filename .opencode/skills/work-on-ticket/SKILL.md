---
name: work-on-ticket
description: Picks up a ticket from the project's ticketing system, fetches its parent epic, recovers the embedded design context, presents the scope to the user for confirmation, and hands the confirmed scope to the brainstorming router as the design input. The re-entry point for work planned in a previous session via brainstorming and create-tickets.
---

# Work on Ticket

## Load the Ticketing Rules First

This skill depends on the rules in `skills/_shared/tickets.md`. Those rules are **not** always in context; they live next to the ticket skills and are loaded only when a ticket skill is invoked. Before running the procedure below, you **MUST** read `skills/_shared/tickets.md` using the read tool if you have not already read it in this session.

The detection of which ticketing system is in use lives in the `detect-ticketing-system` skill. The design step that follows lives in the `brainstorming` router. This skill bridges the gap across session boundaries between a ticket that was created in a prior session and the design step that precedes its implementation.

**Precondition**: the user has referenced a specific ticket to work on (for example, "work on #42", "pick up PROJ-123", "implement issue 7"). Without a specific reference, this skill does not apply; if the user is asking what to work on next, that is a triage question, not this skill.

## Procedure

You **MUST** complete these steps in order. Do not skip a step and do not reorder them.

1. **Detect the ticketing system.** Invoke the `detect-ticketing-system` skill to identify where the ticket lives.

2. **Fetch the ticket.** Retrieve its full content: title, description, labels, status, parent or epic relationship, child or sub-issue references, and linked tickets. See "Per-system fetch" below for the specific API calls.

3. **Run `resolve_epic_context`.** Per `skills/_shared/tickets.md`, this is the named procedure that walks from the fetched ticket up to its Epic and recovers the approved design. The procedure is tier-marker-driven: it reads each node's tier marker (Jira issue type, `tier:epic`/`tier:story`/`tier:task` label, or markdown heading level depending on the system), walks at most 2 hops, and terminates at the Epic. See `skills/_shared/tickets.md` "Recovery Before Implementation" for the full procedure, the termination rule, the legacy fallback boundary, and the decision tree.

   The walker **MUST**:
   - Identify the ticket's tier marker.
   - Walk to the Epic in at most 2 hops (Task -> Story -> Epic, or Task -> Epic for the legacy two-tier path).
   - Treat any `## Design` heading found in a Story body as a single-source-of-truth violation (an error, not preferred content).
   - Surface the **specific reference that could not be resolved** on any failure (missing parent, no Epic found, cycle, depth exceeded). Do not silently continue with partial context.
   - Apply the legacy fallback only when a node has no tier marker AND no further parent reference, per `skills/_shared/tickets.md`.

4. **Extract the design.** `resolve_epic_context` returns the Epic and (if walked through one) the Story's theme statement. Extract the Epic body's `## Design` section. This becomes design input for the `brainstorming` router.

   If `resolve_epic_context` succeeds but the resolved Epic has **no** `## Design` section at all (tickets created manually or by an older workflow predating the rule), follow the manual fallback documented in `skills/_shared/tickets.md` under "Recovery Before Implementation". You **MUST NOT** guess the design and proceed.

   If `resolve_epic_context` fails (any error condition above), surface the specific failure to the user and stop. You **MUST NOT** proceed to the design step with partial context.

5. **Explore the codebase.** Read the current state of files relevant to the ticket. Note anything that has changed since the design was written, anything already partially implemented, and anything the design assumes but does not actually exist yet.

6. **Present the scope.** Show the user a structured summary before asking for confirmation:

   - **Ticket**: title and reference
   - **Design context** (from epic): the recovered design section, or a note that none was found
   - **This ticket's scope**:
     - What to build (from the ticket description)
     - Acceptance criteria (from the ticket)
     - Dependencies (from linked tickets, what must exist before this work)
     - What is explicitly out of scope (from sibling tickets, things that belong to other tickets)
   - **Current codebase state**: relevant observations from step 5

7. **Get explicit user confirmation and the mode.** Use one `question` to confirm the scope and to choose the design mode. Plain-text confirmation is not sufficient. Choose the mode you recommend by the rules in step 2 of `skills/brainstorming/SKILL.md`. Put the recommended mode first and append ` (Recommended)` to its label. Use ` (Recomendado)` when the user writes in Spanish. Begin its description with `Recommended because` and the specific reason from the request. The other options keep the descriptions below. The recommendation is advice, so you **MUST** wait for the user's choice.

   ```
   question:
     question: "Is this scope right, and how would you like to approach the design step?"
     header: "Scope"
     options:
       - label: "Scope OK, standard (Recommended)"
         description: "Recommended because <reason from this request>. The scope is correct. Interactive dialogue, then implementation."
       - label: "Scope OK, committee"
         description: "The scope is correct. Three AI agents deliberate and I review the final design."
       - label: "Scope OK, skip"
         description: "The scope is correct. The design is clear, so capture a brief statement and proceed."
       - label: "Adjust scope"
         description: "Something needs changing or is missing. Say what is missing, for example more tickets or more codebase context."
     multiSelect: false
   ```

   The example shows standard as recommended. Reorder and relabel the options to match your recommendation.

   If the user selects "Adjust scope", address the feedback, including any context the user says is missing, and ask again with `question`. Only proceed to step 8 after a "Scope OK" option.

8. **Hand off to the brainstorming router.** Use `skill` to invoke the `brainstorming` skill. The confirmed scope and the chosen mode are the input to the design step, not an approved design. The router enters plan mode and hands off to the mode that the user chose, without asking again. The chosen mode skill implements directly after final approval, without a next-step question. The ticket already exists. You **MUST NOT** invoke `subagent-driven-development` directly from this skill.

   ```
   skill:
     skill: "brainstorming"
   ```

   Before invoking, construct the design input. It begins with these four lines, where `Mode` is the mode that the user chose in step 7:

   ```
   Source: work-on-ticket
   Ticket: <TICKET-KEY>
   Scope: confirmed by the user
   Mode: <standard | committee | skip>, chosen by the user
   ```

   The four lines are followed by:

   1. The design context recovered from the epic (the architectural vision)
   2. The ticket scope (what specifically this ticket delivers)
   3. The acceptance criteria from the ticket (the spec that the design and its implementation are checked against)
   4. Codebase observations from step 5

## Per-System Fetch

The fetch step is per-system, but the tier marker is read uniformly per `skills/_shared/tickets.md`'s Tier Markers section. For each system, fetching the ticket also retrieves enough metadata (issue type, labels, or heading level) for `resolve_epic_context` to identify the tier without an extra round trip.

### GitHub Issues

With GitHub MCP tools: `issue_read` with the issue number. Response includes body, labels, and parent or sub-issue relationship fields. The tier marker is the `tier:epic` / `tier:story` / `tier:task` label.

With `gh` CLI:

```bash
gh issue view <number> --json title,body,labels,milestone,projectItems
```

Read the `tier:*` label from the labels array.

### Jira

With Atlassian MCP tools: `getJiraIssue` with the issue key. Response includes the `parent` and `epic` fields natively. The tier marker is the native issue type (Epic, Story, Task, or Sub-task) returned in the issue payload.

### GitLab Issues

With GitLab MCP tools if available; otherwise:

```bash
glab issue view <number>
```

The tier marker is either the native group Epic association (top tier on premium GitLab) or the `tier:*` label.

### Linear

With Linear MCP tools. Response includes the `parent` field. The tier marker is the `tier:epic` / `tier:story` / `tier:task` label. In a workspace where Linear nesting is degraded to two-tier (per `create-tickets/SKILL.md`), the Story tier is recorded only as a `story:<slug>` label on the Task and reconstructed from the epic body during `resolve_epic_context`; the walker treats such Tasks as direct children of the Epic.

## Finding the Parent

`resolve_epic_context` finds parents using the system's native parent mechanism, not by inspecting body text where a native mechanism exists. The mechanisms by system are:

- **GitHub Issues**: use the native parent field on `issue_read` first; if absent, scan the body for `Part of #N` and `Epic: #N` references (used by the `gh` CLI fallback and by legacy tickets).
- **Jira**: the `parent` or `epic` field on `getJiraIssue`. Jira natively supports Epic-Story and Story-Sub-task relationships.
- **Linear**: the `parent` field on the issue.
- **GitLab**: epic associations (where group Epics are available) or `Part of #N` references in the body (where they are not).
- **Markdown fallback**: heading nesting in the single epic file. A Task's parent is the nearest preceding `### Story:` heading, or the file itself (the Epic) when there is no enclosing Story.

If `resolve_epic_context` cannot resolve a parent reference (the ticket is missing, deleted, or permission is denied), this is an **error**. Surface the unresolved reference to the user via `question` and stop. The legacy fallback documented in `skills/_shared/tickets.md` applies only when a node has no parent reference at all, not when a parent reference exists but cannot be fetched.

## Handling Multiple Tickets

If the user wants to work on multiple tickets, work on them one at a time in dependency order per `../../rules/common/workflow.md`. Take one ticket through the `brainstorming` router and the full `subagent-driven-development` cycle (including reviews) before starting the next. If the user wants genuinely parallel work, suggest separate sessions rather than trying to parallelise in one.

## Edge Cases

- **Ticket already partially implemented**: read git history and current code state, present what exists to the user, and adjust the scope to cover only the remaining work before step 7.
- **Ticket depends on unfinished work**: flag the dependency. Ask the user whether to work on the dependency first or to proceed with stubs or interfaces for the missing pieces.
- **Ticket description is vague**: use the epic's design context to fill in gaps. If still unclear after that, ask the user targeted questions before proceeding. You **MUST NOT** guess at requirements.
- **No ticketing system detected**: if the user provides a ticket reference but `detect-ticketing-system` returns "none", ask the user to paste the ticket content (and the parent epic content if applicable) directly, then run `resolve_epic_context` against the pasted content using markdown heading levels as the tier marker.
