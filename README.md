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
| `git-guard` | Stops the model and its subagents from pushing and from adding `Co-Authored-By` trailers. | Any repository |
| `waves` | Shows the subagents that the main loop spawns, grouped in waves, in a pane beside the chat. | Any repository |
| `ember-guard` | Blocks commands that switch the shared Docker stack, edits to generated code and `php artisan test`. | Ember only |
| `ember-evals-budget` | Allows one full `just api evals` run, then asks for `/allow-evals` before another. | Ember only |
| `ember-stack` | Shows a band above the prompt when the shared Docker stack mounts another worktree. | Ember only |
| `ember-verification` | Shows which Ember pillars have fresh `check` and `test` runs since their last edit. | Ember only |

### Install

Copy each mod to `~/.claude/mods/<mod>` with `rsync`. Run this command once for each of the six mods:

```bash
rsync -a --exclude .claude-plugin/types --exclude tsconfig.json .claude/mods/<mod>/ ~/.claude/mods/<mod>/
```

Then list the six mod folders in `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, separated by `:`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/git-guard:~/.claude/mods/waves:~/.claude/mods/ember-guard:~/.claude/mods/ember-evals-budget:~/.claude/mods/ember-stack:~/.claude/mods/ember-verification"
  }
}
```

Claude Code reads this variable from the process environment or the `env` block of the user settings. It never reads it from a project's settings.

### Configure the Ember mods

The four `ember-` mods need the `emberRemote` option. It holds the host and path of the Ember git remote, without a scheme. Set it only in `~/.claude/settings.json`, under `pluginConfigs.<mod>.options.emberRemote`. Never set it in this repository. Unset, an Ember mod does nothing.

```json
{
  "pluginConfigs": {
    "ember-guard": {
      "options": { "emberRemote": "gitlab.example.com/acme/app" }
    }
  }
}
```

### Develop and test

Run these commands from the `.dot` repository root, because the paths are relative:

- `claude plugin test .claude/mods/<mod>` runs the tests of a mod.
- `claude plugin validate .claude/mods/<mod>` checks that a mod is well formed.
- `claude --plugin-dir .claude/mods/<mod>` starts a session with one mod loaded.

### Turn a mod off

Remove its path from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.

## Notes

The file `.opencode/opencode.json` holds absolute paths that are specific to my machine. The files in `.claude/hooks/` and `.claude/.mcp.json` also hold absolute paths that are specific to my machine. Adapt them to your own machine before you use them.
