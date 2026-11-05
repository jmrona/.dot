# Workflow

## Design Before Implementation

You **MUST NOT** write production code, scaffold a project, invoke an implementation skill, or take any implementation action until a design has been presented and explicitly approved by your human partner. This applies regardless of perceived simplicity. Every change needs a design. Trivial changes get trivial designs, such as the short path statement, but the user still approves them.

The design lives in the conversation unless it has been captured in a ticket, an epic body, or a committed specification. You **MUST NOT** rely on a design state that exists only in your own context without the user having seen and approved it.

### The Brainstorming Router Is the Design Step

The procedural entry point for the design step is the `brainstorming` skill (the router). Unless the short path below applies, you **MUST** invoke it before any code edit, regardless of how obvious the change feels. The router enters plan mode and asks the user to pick one of three modes (standard, committee, or skip). The skip option exists for cases where structured brainstorming would be overkill, it captures a brief design statement and proceeds. The router being mandatory does not mean every change goes through a long dialogue. If the design input has `Source: work-on-ticket` and a `Mode:` line, the user already chose the mode in `work-on-ticket`, and the router does not ask again.

Unless the short path applies, you **MUST NOT** bypass the router by:

- Designing in your own context and considering it "presented" because you typed it in the conversation
- Entering plan mode manually instead of through the router
- Picking `brainstorming-skip` on the user's behalf, the user picks the mode, the router asks (except in a ticket run, as the router paragraph above states)
- Deciding the work is "too small" or "obvious" to need the router when the short path does not apply. The user approves the short path statement, and the skip option exists for exactly this case

### The Short Path for Small Changes

You can skip the router when all three criteria hold. Verify them against code that you have read, including the places that use the code that you change.

1. The change is fully determined: one correct edit exists and no design decision remains.
2. The change adds no new surface: no new function, file, export, endpoint, option, or dependency. It does not change what a caller observes, except to correct a misspelling in user-facing text.
3. A reader can take in the change at a glance: one file and about five lines at most.

State the change in one or two sentences that name the file and the edit. Then wait for explicit approval before you edit. Use no skill and no plan mode for the design step.

If any criterion fails, or if you have any doubt, you **MUST** use the router. Bug fixes always go through the router. Test-driven development, verification, review, and the debugging gate still apply as the rules require.

### What Counts as an Approved Design

- A design produced by the `brainstorming` router (any of its modes: standard, committee, or skip) that the user has explicitly approved
- An epic or ticket containing a design that the user has written or previously approved. A ticket pickup still goes through the `brainstorming` router, which takes the mode that the user chose in `work-on-ticket`.
- A specification committed to the repository that the user has pointed to as the source of truth for the current change
- A short path statement of the change that the user has explicitly approved

### What Does Not Count

- A design you proposed but the user has not responded to
- A design the user said "it looks fine" to without reviewing specifics
- Your own interpretation of the user's request that you have not surfaced and confirmed through the router
- "Obvious" implementations where you skipped the router because the work felt small, unless an approved short path statement covers them
- A plan you put in the conversation without entering plan mode through the router, other than an approved short path statement

### Bug Fixes

Bug fixes also require an approved design, even if the design is a single sentence. At minimum, present the failing-test reproduction approach and which function or module will change, and get explicit approval before writing the fix. The router (with skip mode if appropriate) is the way to do this. Bug fixes never use the short path. The rules in `testing.md` still apply: the failing test comes before the fix.

## Sequencing Work

When a task involves multiple changes, you **MUST** complete them in the order the design specifies. If the design does not specify an order, foundations and dependencies come first, features next, integration after dependencies, polish last. You **MUST NOT** reorder tasks to make progress look faster or to avoid a harder task.

## Stopping Conditions

You **MUST** stop and consult your human partner when:

- The design turns out to be wrong once implementation begins
- A subagent reports it is blocked in a way that changes the scope of the work
- Verification fails in a way that suggests the design, not just the implementation, is at fault
- You find yourself about to bypass any rule in these instructions

"I will just do this small thing first and tell them after" is not an acceptable response to any of the above. Stop, report, wait for instructions.
