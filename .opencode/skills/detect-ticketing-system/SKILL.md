---
name: detect-ticketing-system
description: Identifies the ticketing system from current MCP tool, git remote, and CLI evidence gathered by the parent (GitHub Issues, Jira, GitLab, Linear, or none). Returns the detected system so a caller can pick the right API, or reports when no system is available.
metadata:
  model: openai/routine
---

# Detect Ticketing System

This skill is a reusable detection capability invoked by `create-tickets`, `work-on-ticket`, and any other skill that needs to know where tickets live for the current project. It does not create or read tickets itself; it only identifies the system from evidence supplied by the parent.

For the rules on how tickets and epics must be structured, see `skills/_shared/tickets.md`. The ticket-creation and ticket-recovery skills (`create-tickets`, `work-on-ticket`) load that file when they are invoked.

See `../_shared/routine-skill-dispatch.md` for delegation ownership. The parent gathers current evidence and supplies it in full. The utility does not inspect the live tool catalogue, run shell commands, or discover hidden tools. If supplied evidence is insufficient, return `NEEDS_CONTEXT` with the specific evidence needed.

## Procedure

Use evidence in priority order, stopping when the parent has an unambiguous result: MCP tools, then git remote, then CLI availability. The parent gathers the evidence; the utility resolves only what it was given.

### 1. Available MCP Tools

The parent scans the current Code Mode tool catalogue for ticketing-system namespaces and methods. Match current names, including V2-style namespace/method pairs:

| Current tool pattern | System |
|----------------------|--------|
| `mcp-atlassian` methods such as `jira_*` | Jira |
| GitHub namespace tools for issues | GitHub Issues |
| GitLab namespace tools for issues | GitLab Issues |
| Linear namespace tools for issues | Linear |

A tool's current namespace and method are the evidence; do not rely only on older flattened `mcp__...` spellings. If exactly one system's tools are present, record it and stop. If more than one is present, carry all candidates forward.

### 2. Git Remote

If MCP evidence did not produce exactly one result, the parent supplies the origin remote URL when available.

| Remote contains | System |
|-----------------|--------|
| `github.com` | GitHub Issues |
| `gitlab.com` | GitLab Issues |
| `dev.azure.com` | Azure DevOps |
| `bitbucket.org` | Bitbucket |

A self-hosted instance (`github.mycorp.com`, `gitlab.internal`, on-prem Jira) may still match by substring. If the substring is ambiguous, carry that ambiguity forward.

### 3. CLI Availability

If neither MCP evidence nor the git remote resolves the system, the parent may supply availability evidence for `gh` or `glab`.

| Binary | System |
|--------|--------|
| `gh` | GitHub Issues |
| `glab` | GitLab Issues |

A CLI binary alone is weaker evidence than MCP tools or a matching git remote; a user may have `gh` installed without using GitHub Issues on this project. Treat CLI-only detection as a candidate, not a confirmation.

## Resolution

Resolve only the supplied evidence:

- **Exactly one system found**: return that system and the strongest mechanism that detected it (MCP > git remote > CLI).
- **More than one system found**: return the candidates and state that the parent must ask the user which to use before proceeding. The utility does not ask the user.
- **No system found**: return `none`. The caller decides its own fallback (for example, `create-tickets` writes a structured Markdown file; `work-on-ticket` asks the user to paste the ticket content directly).

This skill never writes tickets. The parent owns any follow-up question or ticket operation.

## Worked Example

The parent supplies current `mcp-atlassian` tools with `jira_*` methods, an origin remote at `github.com`, and GitHub CLI availability.

1. MCP evidence: Jira tools are present and no other ticketing-system MCP tools are present. One system is found: Jira.
2. Remote and CLI checks are skipped because the MCP evidence already resolved the system.

Return: `{ system: "Jira", mechanism: "mcp" }`.

The git remote pointing at `github.com` does not override Jira detection. A project can live in a GitHub repository while tracking tickets in Jira; the MCP tools reflect the user's actual ticketing workflow, so they win.
