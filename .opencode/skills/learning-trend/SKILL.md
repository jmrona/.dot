---
name: learning-trend
description: Shows how the user's ticket-coach performance has evolved over time — per-ticket scorecards, technology proficiency growth, and seniority progression. Use this when the user asks things like "how am I improving?", "show my progress", "have I gotten better at Go?", "what's my trend", or any request to see evolution/history/improvement related to ticket-coach sessions. This skill is read-only and purely presentational — it never writes to the cognitive profile or scorecards, and only activates when the user explicitly asks to see their progress, never proactively.
metadata:
  model: openai/easy
---

# Learning Trend

This skill presents the scorecard history that `ticket-coach` has been quietly building up (one entry per completed ticket, via `cognitive-profile`'s FLOW D) as a readable picture of how performance and proficiency have evolved. The parent retrieves this data; the utility never reads profile or scorecard files.

This skill is **read-only**: it never writes to profile or scorecard data, and never asks `cognitive-profile` to change anything. The parent owns FLOW E and FLOW C and supplies the permitted results. See `../_shared/routine-skill-dispatch.md` for delegation ownership.

## When this activates

Only on an explicit request from the user to see their progress, history, or improvement (e.g. "how am I doing", "show me my trend", "am I getting better at Go"). Never activate this proactively or as a side effect of another skill's flow — `ticket-coach` does not call this skill, and finishing a ticket does not trigger it.

## Flow

1. **Use the parent-supplied evidence.** The parent calls `cognitive-profile`'s FLOW E for the scorecard history and FLOW C for current proficiency and seniority context, and supplies an explicit status for each. FLOW E status is `no_scorecards_yet` or `scorecards_found`. FLOW C status is `profile_found`, `no_profile_no_decision`, `declined_previously`, or unavailable/unreachable. If a required status or evidence is missing, return `NEEDS_CONTEXT` with what is missing; do not fetch it yourself.
   - For `profile_found`, use only `known_technologies`, `seniority_level`, `proficiency_confidence`, and `seniority_level_confidence` from FLOW C. The parent must not supply raw cognitive axis scores.
   - For `no_profile_no_decision`, `declined_previously`, or unavailable/unreachable, use the explicit status and omit current profile context.
2. **Respect the scorecard status.** If status is `no_scorecards_yet`, tell the user plainly that there's no ticket-coach history yet to show a trend from, and stop here. Don't fabricate a trend from nothing. If status is `scorecards_found`, continue with the supplied history.
3. **Decide what to show** based on what the user actually asked:
   - A general "how am I doing" → give an overview: how many tickets tracked, the rough direction (improving / steady / mixed) for each of the five criteria across the available history, and current proficiency levels per technology.
   - A request scoped to one technology (e.g. "have I gotten better at Go?") → filter to scorecards where that technology appears in `technologies_involved`, and focus the answer there.
   - A request scoped to one criterion (e.g. "am I asking for help less?") → focus on that criterion's trend across all tickets.
4. **Present it as a narrative, not a data dump.** Don't print the raw JSONL or a wall of numbers. Summarise direction and magnitude in plain language, and use the actual ticket IDs and dates where they make the point concrete (e.g. "Looking at your last 5 Go tickets, `code_without_help` has gone from averaging around 3 to consistently landing at 5 — PROJ-40 was the last time you needed real code rather than pseudocode"). A simple visual (e.g. a small chart or sparkline-style table) is welcome if the conversation surface supports it and there's enough data to make one meaningful (roughly 4+ data points) — don't force a chart out of 1-2 entries.
5. **If there isn't much data yet** (fewer than 3-4 scorecard entries), say so honestly rather than overstating a "trend" from a couple of data points — e.g. "You've only got two tickets tracked so far, so it's a bit early to call a trend, but here's what those two look like." Don't manufacture confidence the data doesn't support.
6. **Never show raw `cognitive_profile` axis scores** (e.g. `concreteness: 4.5`) even though FLOW C returns them — that's not what this skill is for, and showing them risks the same false-precision problem the cognitive-profile skill itself avoids by design. Stick to scorecard criteria, technology proficiency levels (`learning`/`intermediate`/`expert`), and `seniority_level` — these are the genuinely earned, behaviourally-grounded numbers, not self-reported ones. This same protection also lives in `cognitive-profile`'s own SKILL.md (see its "FLOW C triggered directly by the user" section) — so it holds even if a request happens to route directly to `cognitive-profile` instead of through this skill.
7. **`proficiency_confidence` and `seniority_level_confidence` are fair to surface, in plain terms** — unlike the cognitive axis scores, these are accumulated directly from scorecard evidence (ticket outcomes), not from a handful of self-reported questionnaire answers, so they don't carry the same false-precision risk. If the user asks something like "how close am I to leveling up in Go?", translate the raw 0–1 value into a plain-language sense of distance rather than reporting the decimal directly (e.g. "you're most of the way there — a couple more strong Go tickets and it should tip over" rather than "your proficiency_confidence is 0.58"). Don't volunteer these numbers unprompted; they're an answer to "how close", not part of a general progress overview unless asked.

## Tone

This should feel like checking in on real progress, not a performance review. Lead with what's genuinely improved before mentioning anything that's flat or mixed. If a criterion has gotten worse recently, mention it plainly but without alarm — frame it as information, not a verdict (e.g. "design autonomy dipped a bit on the last couple of tickets" rather than "you're struggling with design now"). The user is doing this to learn, and the data reflects effort and growth over time more than it reflects any single ticket.