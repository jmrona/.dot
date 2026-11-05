# .dot

This repository collects my dot directories, such as `.opencode` and `.claude`. I will add more over time.

## Index

- [.opencode](.opencode/): the opencode v2 harness of agents, commands, plugins, rules and skills.
- [.claude](.claude/): the Claude Code harness of rules, skills, hooks and statusline.
- [Claude Code mods](#claude-code-mods): the function-hook plugins that guard and monitor Claude Code sessions.

## Claude Code statusline

The script `.claude/statusline-command.sh` shows the current directory and the git branch with a clean or dirty marker. It also shows the model, and the usage of the 5-hour and 7-day rate limits with their reset times.

The script needs `jq` and a terminal with truecolor support. It honours `NO_COLOR`. The `statusLine` entry in `.claude/settings.json` wires it in with `bash ~/.claude/statusline-command.sh`.

### Install a Nerd Font

The statusline uses Nerd Font glyphs. Without a Nerd Font, they show as empty boxes or question marks. Any Nerd Font works, and JetBrainsMono is only a suggestion.

On macOS, install the font with Homebrew:

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

On Linux, download JetBrainsMono from https://www.nerdfonts.com/font-downloads. Then unzip it into `~/.local/share/fonts` and rebuild the font cache:

```bash
mkdir -p ~/.local/share/fonts
unzip ~/Downloads/JetBrainsMono.zip -d ~/.local/share/fonts
fc-cache -fv
```

Select "JetBrainsMono Nerd Font" as the font in the terminal settings. Then restart the terminal.

## Claude Code mods

Mods are Claude Code function-hook plugins. They live in `.claude/mods/<mod>/`, and each one has its own README. Mods work with Claude Code only, because opencode has no counterpart.

| Mod | What it does | Scope |
| --- | --- | --- |
| `git-guard` | Stops the model and its subagents from pushing, adding `Co-Authored-By` trailers, running destructive git commands, writing commit messages outside the format and committing secret files. | Any repository |
| `waves` | Shows the subagents that the main loop spawns, grouped in waves, in a pane beside the chat. | Any repository |
| `ember-guard` | Blocks commands that switch the shared Docker stack, edits to generated code and `php artisan test`. | Ember only |
| `ember-evals-budget` | Allows one full `just api evals` run, then asks for `/allow-evals` before another. | Ember only |
| `ember-stack` | Shows a band above the prompt when the shared Docker stack mounts another worktree. | Ember only |
| `ember-verification` | Shows which Ember pillars have fresh `check` and `test` runs since their last edit. | Ember only |

### General mods (any repository)

The mods `git-guard` and `waves` work in any repository. Follow these steps:

1. Copy them to `~/.claude/mods/`. Run this command from the `.dot` root:

   ```bash
   for mod in git-guard waves; do
     rsync -a --delete --exclude .claude-plugin/types --exclude tsconfig.json ".claude/mods/$mod/" ~/.claude/mods/"$mod"/
   done
   ```

2. Add their two folders to `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. Separate the paths with `:`:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/git-guard:~/.claude/mods/waves"
     }
   }
   ```

   Claude Code reads this variable from the process environment or the user settings, never from a project's settings.

3. Start a new Claude Code session. Sessions that were already open do not load new mods.

To check the mods, ask the model to run `git push`. The call is refused with "Pushes are forbidden". Then type `/waves`, and the pane answers "Waves pane opened.".

### Promote the harness

Instead of the manual steps, you can promote the harness with `lab/promote.mjs`. Run these commands from the `.dot` root:

```bash
node lab/promote.mjs
node lab/promote.mjs --apply
node lab/promote.mjs --restore <stamp>
```

- `node lab/promote.mjs` runs the preflight checks and prints a preview. It writes nothing. The preflight fails if `.claude` or `.opencode` has uncommitted changes, or if `node lab/integrity.mjs` or `node lab/surface.mjs check` fails.
- `node lab/promote.mjs --apply` backs up the managed paths, copies the harness and runs two canaries. If the copy or a canary fails, it restores the backup.
- `node lab/promote.mjs --restore <stamp>` restores the backup with that stamp. If the stamp does not exist, the error lists the available stamps.

The command manages the rules, hooks, skills, mods, `statusline-command.sh`, `.mcp.json` and `settings.json` of `~/.claude`. It also manages the rules, agents, commands, scripts, tests, skills, plugins, `AGENTS.md`, `package.json`, `opencode.json` and `cli.json` of `~/.config/opencode`.

Backups go to `~/.harness-backups/<stamp>/`, where the stamp is the local time as `YYYYMMDD-HHMMSS`.

Skills, mods or plugins that exist only in the live folder are listed in the preview as "solo en destino" but never deleted. The JSON files are merged, so local-only keys such as `autoMode` stay. If a scalar differs, the repository value wins and the preview lists the conflict.

### Ember mods (Ember checkouts and worktrees only)

The mods `ember-guard`, `ember-evals-budget`, `ember-stack` and `ember-verification` work only in an Ember checkout or worktree. Follow these steps:

1. Copy them to `~/.claude/mods/`. Run this command from the `.dot` root:

   ```bash
   for mod in ember-guard ember-evals-budget ember-stack ember-verification; do
     rsync -a --delete --exclude .claude-plugin/types --exclude tsconfig.json ".claude/mods/$mod/" ~/.claude/mods/"$mod"/
   done
   ```

2. Add their four folders to `env.CLAUDE_CODE_PLUGIN_DIRS` as well. The variable then holds all six mod paths:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/git-guard:~/.claude/mods/waves:~/.claude/mods/ember-guard:~/.claude/mods/ember-evals-budget:~/.claude/mods/ember-stack:~/.claude/mods/ember-verification"
     }
   }
   ```

3. Set `emberRemote` for each of the four mods. Write the host and path of the Ember git remote, without a scheme. Set it only under `pluginConfigs.<mod>.options.emberRemote` in `~/.claude/settings.json`. The mod matches HTTPS and SSH remotes alike.

   ```json
   {
     "pluginConfigs": {
       "ember-guard": {
         "options": { "emberRemote": "gitlab.example.com/acme/app" }
       },
       "ember-evals-budget": {
         "options": { "emberRemote": "gitlab.example.com/acme/app" }
       },
       "ember-stack": {
         "options": { "emberRemote": "gitlab.example.com/acme/app" }
       },
       "ember-verification": {
         "options": { "emberRemote": "gitlab.example.com/acme/app" }
       }
     }
   }
   ```

   Never write the real value in this repository, because it is public. An Ember mod does nothing while `emberRemote` is unset or empty.

4. In each new worktree, run `mise trust` once. The `ember-stack` mod runs `just docker which`, and mise refuses an untrusted `mise.toml`.

5. Start a new Claude Code session inside the Ember checkout or a worktree.

To check the mods, ask the model to run `just docker up`. The call is refused. Then type `/verification`, and the pane answers "Verification pane opened.". If the stack mounts another worktree, a band appears above the prompt. If nothing happens, run `git remote get-url origin` and check that its output ends with the `emberRemote` value.

### Develop and test

Run these commands from the `.dot` repository root, because the paths are relative:

- `claude plugin test .claude/mods/<mod>` runs the tests of a mod.
- `claude plugin validate .claude/mods/<mod>` checks that a mod is well formed.
- `claude --plugin-dir .claude/mods/<mod>` starts a session with one mod loaded.

### Turn a mod off

Remove its path from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.

## Notes

The file `.opencode/opencode.json` holds absolute paths that are specific to my machine. The files in `.claude/hooks/` and `.claude/.mcp.json` also hold absolute paths that are specific to my machine. Adapt them to your own machine before you use them.
