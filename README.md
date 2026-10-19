# .dot

This repository collects my dot directories, such as `.opencode` and `.claude`. I will add more over time.

## Index

- [.opencode](.opencode/): the opencode v2 harness of agents, commands, plugins, rules and skills.
- [.claude](.claude/): the Claude Code harness of rules, skills, hooks and statusline.

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

## Notes

The file `.opencode/opencode.json` holds absolute paths that are specific to my machine. The files in `.claude/hooks/` and `.claude/.mcp.json` also hold absolute paths that are specific to my machine. Adapt them to your own machine before you use them.
