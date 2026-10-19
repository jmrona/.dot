#!/usr/bin/env bash

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "unknown"')
cwd=$(echo "$input" | jq -r '.cwd // "."')
rate_5h=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
rate_7d=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
reset_5h_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
reset_7d_at=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# Portable epoch->date formatter. GNU date uses `-d @epoch`, BSD/macOS uses `-r epoch`.
if date --version >/dev/null 2>&1; then
    fmt_epoch() { date -d "@$1" +"$2"; }
else
    fmt_epoch() { date -r "$1" +"$2"; }
fi

# English ordinal suffix: 1st 2nd 3rd 4th ... 11th 12th 13th 21st 22nd ...
ordinal_suffix() {
    local n=$1
    case $((n % 100)) in
        11|12|13) echo "th" ;;
        *) case $((n % 10)) in
            1) echo "st" ;;
            2) echo "nd" ;;
            3) echo "rd" ;;
            *) echo "th" ;;
        esac ;;
    esac
}

# Truecolor ANSI. Palette: Catppuccin Mocha (matches starship).
# Set NO_COLOR (https://no-color.org/) to disable.
if [ -n "$NO_COLOR" ]; then
    c_cwd=""; c_git_accent=""; c_branch=""; c_model=""
    c_warn=""; c_danger=""
    c_rate_low=""; c_sep=""; c_reset=""
else
    esc=$'\033'
    c_cwd="${esc}[38;2;137;180;250m"        # blue    #89b4fa
    c_git_accent="${esc}[38;2;243;139;168m" # red     #f38ba8
    c_branch="${esc}[38;2;205;214;244m"     # text    #cdd6f4
    c_model="${esc}[38;2;180;190;254m"      # lavender #b4befe
    c_warn="${esc}[38;2;250;179;135m"       # peach   #fab387
    c_danger="${esc}[38;2;243;139;168m"     # red     #f38ba8
    c_rate_low="${esc}[38;2;166;173;200m"   # subtext0 #a6adc8
    c_sep="${esc}[38;2;108;112;134m"        # overlay0 #6c7086
    c_reset="${esc}[0m"
fi

if [ "$cwd" = "$HOME" ]; then
    cwd_display="~"
else
    cwd_display="${cwd##*/}"
fi
cwd_part="${c_cwd}  ${cwd_display}${c_reset}"

git_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
git_dirty=$(git -C "$cwd" status --porcelain 2>/dev/null)

if [ -n "$git_branch" ]; then
    if [ -n "$git_dirty" ]; then
        git_status=""
    else
        git_status=""
    fi
    git_part="${c_git_accent} ${c_branch}${git_branch}${c_reset}${c_git_accent}${git_status}${c_reset}"
else
    git_part=""
fi

model_part="${c_model}  ${model}${c_reset}"

if [ -n "$rate_5h" ] && [ -n "$rate_7d" ]; then
    rate_5h_int=$(printf '%.0f' "$rate_5h")
    rate_7d_int=$(printf '%.0f' "$rate_7d")
    if [ "$rate_5h_int" -ge "$rate_7d_int" ]; then
        rate_max="$rate_5h_int"
    else
        rate_max="$rate_7d_int"
    fi
    if [ "$rate_max" -ge 90 ]; then
        rate_colour="$c_danger"
    elif [ "$rate_max" -ge 60 ]; then
        rate_colour="$c_warn"
    else
        rate_colour="$c_rate_low"
    fi
    if [ -n "$reset_5h_at" ]; then
        reset_5h_ampm=$(fmt_epoch "$reset_5h_at" '%-I:%M%p' | tr -d '.' | tr '[:upper:]' '[:lower:]')
        reset_5h_time="${reset_5h_ampm} $(fmt_epoch "$reset_5h_at" %Z)"
        if [ "$(fmt_epoch "$reset_5h_at" %Y%m%d)" != "$(date +%Y%m%d)" ]; then
            reset_5h_str=" →  ${reset_5h_time} tomorrow"
        else
            reset_5h_str=" →  ${reset_5h_time}"
        fi
    else
        reset_5h_str=""
    fi
    if [ -n "$reset_7d_at" ]; then
        d=$(fmt_epoch "$reset_7d_at" %-d)
        reset_7d_str=" →  $(fmt_epoch "$reset_7d_at" %a) ${d}$(ordinal_suffix "$d") $(fmt_epoch "$reset_7d_at" %b)"
    else
        reset_7d_str=""
    fi
    rate_part="${rate_colour}󰥔  5h ${rate_5h_int}%${reset_5h_str} · 7d ${rate_7d_int}%${reset_7d_str}${c_reset}"
else
    rate_part=""
fi

parts=("$cwd_part")
[ -n "$git_part" ] && parts+=("$git_part")
parts+=("$model_part")

sep=" ${c_sep} ${c_reset} "
output=""
for i in "${!parts[@]}"; do
    if [ "$i" -eq 0 ]; then
        output="${parts[$i]}"
    else
        output="${output}${sep}${parts[$i]}"
    fi
done

if [ -n "$rate_part" ]; then
    printf '%s\n%s\n' "$output" "$rate_part"
else
    printf '%s\n' "$output"
fi