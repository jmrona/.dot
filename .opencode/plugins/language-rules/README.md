# language-rules

This plugin adds the coding rules of a language to an opencode session when the session works with files of that language. Its purpose is that a session carries only the rules it needs, so the rules of unrelated languages stay out of its context. The rules are the Markdown files in `.opencode/rules/<language>/`. The plugin adds rules only for the languages that a session uses. A session that touches no file of a language receives none of its rules.

## Where it acts

The plugin acts on every session that opencode passes to its `context` hook. It does not tell root sessions from subsessions, and it does not check which agent runs the session. Each session gets the rules of the languages that the session itself touched.

## What it hooks

- **`context` hook**: records the languages that the session's tool calls name, then appends one system text part for each recorded language.
- **`session.deleted` event**: received through the event stream. It removes the recorded languages of the deleted session. Events of other types, and deletion events without a session ID, change nothing.

## How it works

### Setup

When the plugin loads, it reads each language folder once: `go`, `javascript`, `php`, `python`, `rust` and `typescript`. It skips a rule file that is unreadable or has no globs, and it logs a warning that names the file. It merges the globs of the remaining files of a language into one list. A language folder that does not exist is left out without a warning. A change to a rule file takes effect only after the plugin loads again.

### Detecting languages

On each call of the hook, the plugin reads the tool calls of the assistant messages. It collects these values from each tool call as references:

- `path`, `filePath` or `file_path`, the file that a tool works on.
- `include`, `glob` or `pattern`, the file filters of a search tool.
- Each file named in a patch header, `*** Add File:`, `*** Update File:` or `*** Delete File:`, found in a top-level string field of the input.

Tool calls whose input is not an object add nothing. User messages add nothing.

A glob is a file path pattern, for example `**/*.ts`, which matches every file whose name ends in `.ts`, in any folder. Each reference is matched against the globs of every language in three steps:

1. The plugin expands braces in the reference, so `*.{go,tsx}` becomes `*.go` and `*.tsx`. The plugin does not expand braces in the globs from frontmatter itself. Node's `path.matchesGlob` accepts brace alternatives, so a glob such as `**/*.{ts,tsx}` works.
2. The plugin replaces each run of `*` and each `?` in the reference with `x`, so `*.go` is compared as `x.go`.
3. A dot segment is a path part that starts with a dot, such as `.config`. The plugin masks dot segments in both the reference and the glob, so `**/*.ts` matches a file inside `.config`. Then Node's `path.matchesGlob` compares the two.

A language is recorded for the session when one reference matches one of its globs.

### Selecting and injecting rules

A recorded language stays recorded until the session is deleted. Each call of the hook appends one system text part for each recorded language, in alphabetical order of the language name. Each part holds the full text of every rule file of that language, joined by blank lines. The frontmatter stays in the text.

## Configuration

The rules live in `.opencode/rules/<language>/` in the repo. After installation, they live in `~/.config/opencode/rules/`. The plugin reads the `rules` folder that sits next to `plugins`.

Only the folders `go`, `javascript`, `php`, `python`, `rust` and `typescript` are read. The `common` folder is not read by this plugin.

The plugin reads only files ending in `.md` from each language folder, in alphabetical order of file name. It ignores every other file.

Each rule file starts with frontmatter. The frontmatter starts at the first `---` line and ends at the next `---` line. It holds a `globs:` line with comma-separated globs, written in the glob syntax that the matching uses. The plugin reads only the first `globs:` line. It ignores other lines, such as a `# noinspection` comment. A file without a `globs:` line is skipped.

This is the frontmatter of `.opencode/rules/typescript/coding-style.md`:

```markdown
---
# noinspection YAMLUnresolvedAlias
globs: **/*.ts, **/*.tsx, **/*.d.ts
---

# TypeScript Coding Style
```

## State

The plugin keeps one map in memory. The map links each session ID to the set of recorded language names. It starts empty when the plugin loads. It removes a session's entry when a `session.deleted` event names that session. The loaded rule texts also stay in memory. Nothing is written to disk.

## Installation

opencode loads plugins from `~/.config/opencode/plugins/<name>/`. The repo copy of this plugin is `.opencode/plugins/language-rules/`.

Install the plugin with promote. Run these commands from the repo root:

```bash
node lab/promote.mjs
node lab/promote.mjs --apply
```

The first command runs the preflight checks and prints a preview. It writes nothing. The second command backs up the managed paths and copies the harness into `~/.config/opencode`. The copy includes `plugins/language-rules` and the `rules` folder. The preflight stops when `.claude` or `.opencode` has uncommitted changes. It also stops when `node lab/integrity.mjs` or `node lab/surface.mjs check` fails.

For the full steps and the restore command, read the section "Promote the harness" in the root `README.md`.

The `.opencode/package.json` file declares `@opencode-ai/plugin`. The plugin imports only Node built-in modules and its own files, so it needs no step beyond promote.

## Known limits

- The plugin reads only the six language folders. It never reads the `common` rules.
- The plugin reads only the fields listed under "Detecting languages". A file named inside a `bash` command does not trigger a language.
- The plugin reads each `pattern` value as a file reference. A search term that looks like a file path or a glob can trigger a language.
- A recorded language stays recorded until the session is deleted. Nothing removes it earlier.
- Rule files load once, at setup. A rule change needs the plugin to load again.
- Each call of the hook appends the full rule text of each recorded language. This makes each call larger.
- The plugin takes the first `---` line of a file as the opening delimiter. A horizontal rule above the frontmatter makes the plugin read the wrong block. That block then has no `globs:` line, so the plugin skips the rule file and logs a warning.
- If recording a language or injecting rules fails, the plugin logs a warning. The session then continues without the rules.
- If the event stream stops, the plugin logs a warning. From then on, deleted sessions keep their recorded languages in memory.
- The plugin has no options. To change the language list, edit the `LANGUAGES` constant in `index.ts`.

## Tests

Run the tests from the repo root:

```
node --test .opencode/plugins/language-rules/*.test.ts
```

The command runs the `.ts` files directly, so Node must strip TypeScript types natively. The code does not pin a Node version. The tests pass on Node 24.

The tests cover frontmatter parsing, glob matching, reference extraction, rule loading, the session language registry and the hook behaviour.

## Turning it off

Remove `~/.config/opencode/plugins/language-rules/`, or move it out of `~/.config/opencode/plugins/`.

The next `node lab/promote.mjs --apply` copies the folder back, because promote mirrors it from the repo. To turn the plugin off for good, remove or move `.opencode/plugins/language-rules/` in the repo too.
