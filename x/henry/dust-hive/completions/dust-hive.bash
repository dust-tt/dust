# Bash completion script for dust-hive (and dh alias)
#
# Install (pick one):
#   1. Source directly in .bashrc:
#        source /path/to/completions/dust-hive.bash
#   2. Copy/symlink into bash_completion.d:
#        ln -s /path/to/completions/dust-hive.bash /etc/bash_completion.d/dust-hive
#        # or on macOS with brew:
#        ln -s /path/to/completions/dust-hive.bash "$(brew --prefix)/etc/bash_completion.d/dust-hive"
#
# Sourcing this file defines:
#   dh    - alias for dust-hive
#   dhs   - spawn -C -c "claude --dangerously-skip-permissions"
#   dho   - open -C
#   dhl   - list
#   dhd   - destroy
#   dhw   - warm
#   dhc   - cool
#   dhcd  - cd into environment worktree (changes dir in current shell)

_dust_hive_services=(sdk sparkle front core oauth connectors front-workers front-spa-poke front-spa-app viz)

_dust_hive_current_env() {
  # 1. Detect from cwd (inside a .hives/<name> worktree)
  local cwd="$PWD"
  if [[ "$cwd" == */.hives/* ]]; then
    local after="${cwd##*/.hives/}"
    echo "${after%%/*}"
    return
  fi
  # 2. Fall back to last-active env from activity.json
  local activity=~/.dust-hive/activity.json
  if [[ -f "$activity" ]]; then
    local last
    last="$(command grep -o '"lastEnv" *: *"[^"]*"' "$activity" 2>/dev/null | head -1)"
    [[ -n "$last" ]] || return
    last="${last##*: \"}"
    last="${last%\"}"
    echo "$last"
  fi
}

_dust_hive_envs() {
  local envs=()
  if [[ -d ~/.dust-hive/envs ]]; then
    while IFS= read -r e; do
      [[ -n "$e" ]] && envs+=("$e")
    done < <(ls ~/.dust-hive/envs 2>/dev/null)
  fi

  local current
  current="$(_dust_hive_current_env)"

  # Put the current env first so it shows up prominently
  local result=()
  if [[ -n "$current" ]]; then
    for e in "${envs[@]}"; do
      [[ "$e" == "$current" ]] && result+=("$e")
    done
    for e in "${envs[@]}"; do
      [[ "$e" != "$current" ]] && result+=("$e")
    done
  else
    result=("${envs[@]}")
  fi

  printf '%s\n' "${result[@]}"
}

_dust_hive_complete() {
  local cur prev words cword
  _init_completion 2>/dev/null || {
    # Fallback if bash-completion library isn't loaded
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    words=("${COMP_WORDS[@]}")
    cword=$COMP_CWORD
  }

  # Find which subcommand is active (skip the binary name at index 0)
  local cmd=""
  local cmd_index=0
  local i
  for (( i=1; i<cword; i++ )); do
    local w="${COMP_WORDS[$i]}"
    if [[ "$w" != -* ]]; then
      cmd="$w"
      cmd_index=$i
      break
    fi
  done

  # Top-level command completion
  if [[ -z "$cmd" ]]; then
    local commands="spawn open reload restart warm cool start stop up down destroy list status logs url cd setup doctor cache refresh forward sync temporal seed-config feed flag help"
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  # Per-command argument/flag completion
  case "$cmd" in
    spawn|s)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-n --name -b --branch-name -r --reuse-existing-branch -O --no-open -A --no-attach -w --warm -W --wait -c --command -C --compact -u --unified-logs" -- "$cur"))
          ;;
        *)
          # No env name completion for spawn (creates new ones)
          ;;
      esac
      ;;
    open|o)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-C --compact -u --unified-logs" -- "$cur"))
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    reload)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-u --unified-logs" -- "$cur"))
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    restart)
      # Determine position: 1st positional = env, 2nd = service
      local pos=0
      for (( i=cmd_index+1; i<cword; i++ )); do
        [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
      done
      if (( pos == 0 )); then
        COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
      elif (( pos == 1 )); then
        COMPREPLY=($(compgen -W "${_dust_hive_services[*]}" -- "$cur"))
      fi
      ;;
    warm|w)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-F --no-forward -p --force-ports" -- "$cur"))
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    cool|c|start)
      case "$cur" in
        -*)
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    stop|x)
      # 1st positional = env, 2nd = service
      local pos=0
      for (( i=cmd_index+1; i<cword; i++ )); do
        [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
      done
      if (( pos == 0 )); then
        COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
      elif (( pos == 1 )); then
        COMPREPLY=($(compgen -W "${_dust_hive_services[*]}" -- "$cur"))
      fi
      ;;
    up)
      COMPREPLY=($(compgen -W "-a --attach -f --force -C --compact" -- "$cur"))
      ;;
    down)
      COMPREPLY=($(compgen -W "-f --force" -- "$cur"))
      ;;
    destroy|rm)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-f --force -k --keep-branch" -- "$cur"))
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    list|ls|l)
      ;;
    status|st|url|cd|refresh)
      case "$cur" in
        -*)
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    logs|log)
      # 1st positional = env, 2nd = service; flags anywhere
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-f --follow -i --interactive" -- "$cur"))
          ;;
        *)
          local pos=0
          for (( i=cmd_index+1; i<cword; i++ )); do
            [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
          done
          if (( pos == 0 )); then
            COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          elif (( pos == 1 )); then
            COMPREPLY=($(compgen -W "${_dust_hive_services[*]}" -- "$cur"))
          fi
          ;;
      esac
      ;;
    setup)
      COMPREPLY=($(compgen -W "-y --non-interactive" -- "$cur"))
      ;;
    doctor|cache)
      ;;
    forward)
      case "$cur" in
        -*)
          ;;
        *)
          # Could be a subcommand or an env name
          local subcmds="status stop"
          COMPREPLY=($(compgen -W "$subcmds $(_dust_hive_envs)" -- "$cur"))
          ;;
      esac
      ;;
    sync)
      COMPREPLY=($(compgen -W "-f --force" -- "$cur"))
      ;;
    temporal)
      case "$cur" in
        -*)
          ;;
        *)
          COMPREPLY=($(compgen -W "start stop restart status logs" -- "$cur"))
          ;;
      esac
      ;;
    feed)
      # 1st positional = env, 2nd = scenario (no known list)
      local pos=0
      for (( i=cmd_index+1; i<cword; i++ )); do
        [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
      done
      if (( pos == 0 )); then
        COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
      fi
      ;;
    flag)
      case "$cur" in
        -*)
          COMPREPLY=($(compgen -W "-d --disable" -- "$cur"))
          ;;
        *)
          local pos=0
          for (( i=cmd_index+1; i<cword; i++ )); do
            [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
          done
          if (( pos == 0 )); then
            COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
          fi
          ;;
      esac
      ;;
    seed-config)
      # Expects a postgres URI — no useful completion
      ;;
  esac
}

complete -F _dust_hive_complete dust-hive
complete -F _dust_hive_complete dh

# Shorthand aliases
alias dh='dust-hive'

dhs() { command dust-hive spawn -C -c "claude --dangerously-skip-permissions" "$@"; }
dho() { command dust-hive open -C "$@"; }
dhl() { command dust-hive list "$@"; }
dhd() { command dust-hive destroy "$@"; }
dhw() { command dust-hive warm "$@"; }
dhc() { command dust-hive cool "$@"; }

# dhcd: cd into an environment's worktree in the current shell
dhcd() {
  local tmpfile="${TMPDIR:-/tmp}/dust-hive-cd.$$"
  DUST_HIVE_CD_FILE="$tmpfile" command dust-hive cd "$@"
  local rc=$?
  if (( rc == 0 )) && [[ -f "$tmpfile" ]]; then
    local dir
    dir="$(<"$tmpfile")"
    rm -f "$tmpfile"
    [[ -d "$dir" ]] && cd "$dir"
  else
    rm -f "$tmpfile"
    return $rc
  fi
}

# Completions for shorthand aliases — delegate to the underlying command's completion
_dhs()  { local COMP_WORDS=("dust-hive" "spawn" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dho()  { local COMP_WORDS=("dust-hive" "open" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dhl()  { :; }
_dhd()  { local COMP_WORDS=("dust-hive" "destroy" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dhw()  { local COMP_WORDS=("dust-hive" "warm" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dhc()  { local COMP_WORDS=("dust-hive" "cool" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dhcd() { local COMP_WORDS=("dust-hive" "cd" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }

complete -F _dhs  dhs
complete -F _dho  dho
complete -F _dhl  dhl
complete -F _dhd  dhd
complete -F _dhw  dhw
complete -F _dhc  dhc
complete -F _dhcd dhcd
