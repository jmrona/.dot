---
name: pick-up-jira-work
description: Use when the user asks what Jira work to pick up next without providing a ticket key. Research-only: searches EMBER Scrum active sprint work first, asks before checking the EMBER backlog, recovers hierarchy and dependency context, summarises the recommendation, and stops without implementation.
---

# Pick Up Jira Work

## Research-Only Contract

This skill selects and summarises Jira work. It does not start implementation.

You MUST NOT:

- Transition Jira issues.
- Assign or unassign Jira issues.
- Create, switch, or delete branches.
- Fetch branches.
- Edit files.
- Invoke `work-on-ticket`, `ember-work-on-ticket`, or `subagent-driven-development`.
- Claim work has started.

If the user wants to implement the recommended ticket afterwards, stop and let the next user request trigger the normal ticket-specific workflow.

## Load the Ticketing Rules First

This skill uses the shared ticket hierarchy semantics from `~/.config/opencode/skills/_shared/tickets.md`. Before running the procedure below, you MUST read that file using the read tool if you have not already read it in this session.

This skill also depends on ticketing-system detection. The procedure below invokes `detect-ticketing-system` first. If the detected system is not Jira, stop and explain that this skill only supports Jira selection.

## Preconditions

Use this skill when the user asks what Jira ticket to pick up next and does not provide a specific ticket key.

Do not use this skill when:

- The user provides a specific ticket key such as `PROJ-123`; use the normal ticket-specific workflow instead.
- The user asks to implement a ticket immediately; first recommend a ticket and stop.
- The requested ticketing system is GitHub, Linear, GitLab, or a Markdown backlog.

## Procedure

You MUST complete these steps in order.

1. **Detect Jira.** Invoke `detect-ticketing-system`. Continue only when Jira is detected. If multiple systems are detected, ask the user which one to use and continue only if they choose Jira.

2. **Load shared hierarchy rules.** Read `~/.config/opencode/skills/_shared/tickets.md`. Use its Epic / Story / Task recovery rules when following parent or epic relationships.

3. **Search active sprint work assigned to the current user first.** Search EMBER active sprint tickets assigned to the current Jira user. Run the Major query first, then the non-Major query if no eligible Major ticket is found:

   ```jql
   project = EMBER AND Sprint in openSprints() AND assignee = currentUser() AND status = "Ready for development" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint in openSprints() AND assignee = currentUser() AND status = "Ready for development" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

4. **Search unassigned active sprint work if needed.** If no eligible assigned active sprint ticket is found, search unassigned EMBER active sprint tickets. Run the Major query first, then the non-Major query if no eligible Major ticket is found:

   ```jql
   project = EMBER AND Sprint in openSprints() AND assignee is EMPTY AND status = "Ready for development" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint in openSprints() AND assignee is EMPTY AND status = "Ready for development" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

5. **Stop and ask before backlog search if no active sprint ticket is eligible.** If no direct pickup candidate is found from steps 3 and 4, do not run any `Sprint is EMPTY` or backlog query yet. Present this response and wait for the user's answer:

   ```markdown
   **No Active Sprint Candidate**
   I found no EMBER tickets available for direct pickup in active sprints.

   **Reason**
   - <Evidence-based reason from the active sprint searches, or "Jira did not return enough detail to determine why.">

   **Active Sprint Searches Attempted**
   - Current user, Ready for development, Major / non-Major
   - Unassigned, Ready for development, Major / non-Major

   Would you like me to search the EMBER backlog, or would you prefer another answer?
   ```

   Use only reasons supported by evidence already gathered. Do not speculate that the team has no work. If the user asks to search the backlog, continue at step 6. If the user gives another answer, follow that answer within this skill's research-only contract.

6. **Search ready backlog work assigned to the current user only after explicit opt-in.** If the user asks to search the EMBER backlog, search EMBER backlog tickets assigned to the current Jira user. Run the Major query first, then the non-Major query if no eligible Major ticket is found:

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee = currentUser() AND status = "Ready for development" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee = currentUser() AND status = "Ready for development" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

7. **Search unassigned ready backlog work if needed.** If no eligible ready backlog ticket assigned to the current user is found, search unassigned EMBER backlog tickets. Run the Major query first, then the non-Major query if no eligible Major ticket is found:

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee is EMPTY AND status = "Ready for development" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee is EMPTY AND status = "Ready for development" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

8. **Search Backlog-status fallback candidates only after explicit opt-in.** Search EMBER backlog tickets in `Backlog` status as second-option fallback candidates, not direct pickup recommendations. Search current-user assigned tickets first, then unassigned tickets. Run the Major query first inside each ownership bucket:

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee = currentUser() AND status = "Backlog" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee = currentUser() AND status = "Backlog" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee is EMPTY AND status = "Backlog" AND priority = Major AND resolution = Unresolved ORDER BY updated ASC
   ```

   ```jql
   project = EMBER AND Sprint is EMPTY AND assignee is EMPTY AND status = "Backlog" AND resolution = Unresolved ORDER BY priority DESC, updated ASC
   ```

   Label `Backlog` status results as fallback candidates that need team confirmation or movement to `Ready for development` before direct implementation. Do not search direct pickup candidates without an assignee filter. Tickets assigned to someone else are not direct pickup candidates.

9. **Fetch full candidate details before deciding.** For each promising search result, use Jira get-issue to fetch at least summary, description, status, priority, assignee, reporter, labels, issue type, parent or epic, subtasks, issue links, components, fix versions, created, and updated. Fetch comments only when the description or links do not explain readiness.

10. **Filter direct pickup eligibility.** A ticket is directly pick-up-ready only when all of these are true:

    - It belongs to project `EMBER`.
    - The issue is unresolved and not in a Done status category.
    - Its status is exactly `Ready for development`.
    - It is in an active sprint, or it is in the EMBER backlog after the user explicitly asked to search the backlog.
    - It is assigned to the current Jira user or has no assignee.
    - Its status name does not clearly mean `Done`, `Closed`, `Resolved`, `Cancelled`, `Canceled`, `Won't Do`, `Duplicate`, `Blocked`, `On Hold`, or `Waiting`.
    - It is not an Epic, unless the project visibly uses Epics as direct work items.
    - It has no confirmed unresolved blockers under the blocker rules below, or it qualifies for the one-blocker branch exception below.
    - Its parent or epic context is recoverable, or the missing context is explicitly reported as a risk.

    A ticket in `Backlog` status is not directly pick-up-ready. It can only be presented as an EMBER backlog fallback candidate with a caveat that it needs team confirmation or movement to `Ready for development` before direct implementation.

    The one-blocker branch exception applies only when all of these are true:

    - The ticket is in an active EMBER sprint, not the backlog.
    - It has exactly one deduplicated confirmed unresolved blocker.
    - The blocker identity is a confirmed Jira key, not an inferred or ambiguous reference.
    - The blocker has one clearly identified existing branch from the read-only branch evidence rules below.
    - The branch name contains the blocker Jira key as a distinct token, such as `feature/EMBER-123-fix`, `EMBER-123_fix`, or `EMBER-123.fix`, not a loose substring such as `EMBER-1234`.
    - A distinct token means the blocker key is bounded by the start or end of the branch name, or by separators such as `/`, `-`, `_`, or `.`. Do not match `XEMBER-123`, `EMBER-1234`, or `EMBER-123fix`.

    Treat tickets using this exception as branch-dependent, not unblocked. Do not apply the exception to backlog tickets, tickets with more than one unresolved blocker, ambiguous blocker identities, ambiguous branch matches, or blockers without confirmed branch evidence.

11. **Apply blocker detection conservatively.** Treat a candidate as blocked when any of these are true:

    - A linked unresolved issue has relationship text indicating the candidate is blocked by, depends on, waits for, requires, or is caused by the linked issue.
    - A linked issue uses a `Blocks` style relationship and the link direction is clear that the linked issue blocks the candidate.
    - The candidate status contains `Blocked`, `Waiting`, `On Hold`, or `Dependency`.
    - Labels include `blocked`, `blocker`, `blocked-by`, `waiting`, `on-hold`, `needs-decision`, `needs-design`, or `dependency`.
    - Unresolved subtasks appear to be prerequisite work.
    - The description or visible fields explicitly name unresolved blocker or dependency Jira keys.
    - A returned custom field is visibly a blocker/dependency field and has a populated blocking value.

    If link direction or custom field meaning is ambiguous, classify the issue as a possible blocker and demote the candidate below clearly unblocked tickets. Do not silently mark ambiguous work as unblocked.

    Deduplicate confirmed blockers by Jira key before counting them for the one-blocker branch exception. If exactly one confirmed unresolved blocker remains after deduplication, check whether the blocker has an existing branch using read-only evidence only:

    - Prefer Jira development metadata on the blocker ticket when it exposes linked branch data.
    - If Jira does not expose branch metadata, inspect existing branch refs with read-only commands such as `git branch --list '*<BLOCKER-KEY>*'`, `git branch -r --list '*<BLOCKER-KEY>*'`, or `git ls-remote --heads origin '*<BLOCKER-KEY>*'`.
    - Do not run `git fetch`, `git switch`, `git checkout`, branch creation commands, branch deletion commands, or Jira mutation commands.
    - Confirm the branch only when a single authoritative branch is found and the blocker key appears as a distinct token in the branch name.

    If multiple possible branches match, report the ambiguity and do not apply the one-blocker branch exception. If no branch evidence can be inspected, or the branch match is ambiguous, the one-blocker branch exception does not apply.

12. **Rank eligible candidates.** Prefer candidates in this order:

    - Active EMBER sprint work before EMBER backlog work.
    - Within the same search stage, unblocked eligible tickets before branch-dependent tickets using the one-blocker branch exception.
    - Assigned to the current user.
    - `Ready for development` before `Backlog` status fallback candidates.
    - Priority `Major`.
    - No confirmed or possible blockers.
    - Unassigned ready work.
    - Jira priority order for non-Major candidates.
    - Older `updated` date as a tie-breaker, because stale ready work is usually more useful to pick up than newly touched work.

13. **Recover hierarchy and dependency context.** For the selected candidate, fetch:

    - Up to two upward hops through native parent or epic relationships, matching Task -> Story -> Epic.
    - The parent and/or epic title, key, status, and relevant design or scope excerpts.
    - Direct subtasks and their statuses.
    - Direct linked issues that look like blockers, dependencies, duplicates, or relevant implementation context.
    - Sibling issues under the same parent or epic only when needed to establish scope boundaries; keep this bounded, normally no more than 10 siblings.

14. **Present the recommendation and stop.** When a direct pickup candidate exists, use this structure:

    ```markdown
    **Recommendation**
    Pick up `<KEY>` - `<summary>`.

    **Why This Ticket**
    - Source: active EMBER sprint / EMBER backlog
    - Priority: Major / other
    - Status: <status>
    - Direct pickup eligibility: EMBER, active sprint or backlog, Ready for development, and assigned to current user / unassigned
    - Blockers: none detected / exactly one confirmed blocker with existing blocker branch / possible blockers listed below

    **Ticket Context**
    - Type: <issue type>
    - Assignee: <assignee or unassigned>
    - Labels/components: <values>
    - Updated: <date>

    **Hierarchy**
    - Parent/Epic: <key and summary, or missing with risk>
    - Relevant scope/design excerpt: <concise excerpt or unavailable>

    **Dependencies And Blockers**
    - Confirmed blockers: <list or none>
    - Possible blockers: <list or none>
    - Linked issues: <relevant links>

    **Branch Dependency**
    - Include only when the one-blocker branch exception applies.
    - Blocker: <blocker key and summary/status>
    - Existing blocker branch: `<branch name>`
    - Evidence source: <exact Jira development metadata source or read-only git branch lookup command/result>
    - Branch instruction: create your work branch from `<branch name>`, not from `main` or the default branch, so your work includes the blocker changes.

    **Subtasks**
    - Done/open counts and notable unresolved subtasks

    **Backlog Fallback Candidates**
    - Include only when no direct pickup exists, or when the recommendation has caveats. Label `Ready for development` alternatives as alternate direct pickup candidates. Label `Backlog` status alternatives as fallback candidates that need team confirmation or movement to `Ready for development` before direct implementation.

    **Stop Condition**
    No implementation has started, no Jira state has been changed, and no branches have been created, switched, deleted, or fetched.
    ```

    If no direct pickup candidate exists before backlog opt-in, use the `No Active Sprint Candidate` response in step 5 and ask before searching the backlog. If no direct pickup candidate exists after the user opted into backlog search, replace `Recommendation` with `No Backlog Candidate` and present `Backlog` status results only as fallback candidates, not tickets to pick up immediately.

## Error Handling

- If Jira search fails, show the failed JQL and the error. Do not invent candidates.
- If `currentUser()` is rejected by Jira, say so and ask for the current user's Jira account identifier, or ask whether to continue with unassigned EMBER candidates only.
- If `openSprints()` or `Sprint is EMPTY` is rejected by Jira, show the failed JQL and ask for the EMBER Scrum board filter or board-specific lookup approach.
- If search results are too broad or clearly from unrelated projects, ask the user for a project key or project filter before continuing.
- If parent or epic lookup fails, show the unresolved reference and continue only as a caveated recommendation; do not claim full hierarchy recovery.
- If no active sprint candidate is found, state that no suitable EMBER Scrum work was found in active sprints under the staged criteria, show the active sprint searches that were attempted, and ask whether to search the backlog.
- If no backlog candidate is found after the user explicitly asks for backlog search, state that no suitable EMBER backlog work was found under the staged criteria and show the backlog searches that were attempted.

## Common Mistakes

| Mistake | Why it is wrong |
|---|---|
| Calling `work-on-ticket` after selecting a ticket | This skill is research-only and the user did not ask to implement yet. |
| Selecting the first Jira search result without fetching links and subtasks | Search results do not contain enough dependency context to determine blockers. |
| Treating all Major tickets as automatically pick-up-ready | Major priority does not override blockers, ownership, or missing hierarchy. |
| Recommending a ticket assigned to someone else | This can disrupt ownership. Tickets assigned to someone else are not direct pickup candidates. |
| Recommending a ticket outside `Ready for development` | Non-ready tickets may be useful backlog or triage suggestions, but they are not direct pickup candidates. |
| Treating a ticket with multiple blockers as pickable because one blocker has a branch | The branch exception applies only to exactly one deduplicated confirmed unresolved blocker. |
| Treating a blocker without a confirmed branch as pickable | One blocker is not enough; the existing blocker branch must be clearly identified. |
| Using a loose branch substring match | The blocker key must appear as a distinct token, so `EMBER-12` does not match `EMBER-123`. |
| Hiding that a branch-dependent ticket is still blocked | The recommendation must state that the ticket is conditionally pickable via the blocker branch. |
| Omitting the exact blocker branch name | The user needs the exact branch to create their branch from the blocker branch. |
| Creating, switching, deleting, or fetching branches during selection | This skill is research-only and may use only read-only branch evidence. |
| Searching outside `project = EMBER` | This skill is scoped to EMBER Scrum work only. |
| Searching outside active sprints or the EMBER backlog | This can surface tickets that are not in the team's current pickup lanes. |
| Automatically searching the backlog after active sprint searches fail | The skill must stop, explain that no active sprint candidate was found, and ask before running `Sprint is EMPTY` searches. |
| Using backlog tickets to answer the initial active sprint question | Backlog results are only allowed after the user explicitly opts into backlog search. |
| Treating `Backlog` status as immediate pickup work | `Backlog` status tickets are fallback candidates that need confirmation or movement to `Ready for development`. |
| Assuming a specific blocker custom field exists | Jira projects vary. Inspect visible fields but do not require a field name. |
| Traversing the whole Jira graph | Keep context bounded to parent/epic, direct subtasks, relevant direct links, and limited siblings. |
