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
#   dhx   - spawn -C -c "codex"
#   dhb   - open app URL in browser
#   dhdb  - open psql on environment database
#   dhcd  - cd into environment worktree (changes dir in current shell)

_dust_hive_services=(sdk sparkle front core oauth connectors front-workers front-spa-poke front-spa-app viz)
_dust_hive_warm_state_services=(front front-api core oauth connectors front-workers front-spa-poke front-spa-app viz)
# Avoid invoking the Bun CLI from completion; derive state from PID files plus one Docker scan.

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

_dust_hive_pid_is_running() {
  local pid_file="${1:?usage: _dust_hive_pid_is_running <pid-file>}"
  local pid

  [[ -r "$pid_file" ]] || return 1
  IFS= read -r pid < "$pid_file" || [[ -n "$pid" ]] || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1

  kill -0 "$pid" 2>/dev/null
}

_dust_hive_service_is_running() {
  local env_name="${1:?usage: _dust_hive_service_is_running <env> <service>}"
  local service="${2:?usage: _dust_hive_service_is_running <env> <service>}"

  _dust_hive_pid_is_running "$HOME/.dust-hive/envs/$env_name/$service.pid"
}

_dust_hive_docker_warm_envs() {
  command docker ps --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null |
    awk '/^dust-hive-/ { sub(/^dust-hive-/, ""); print }' |
    sort -u
}

_dust_hive_name_in_lines() {
  local name="${1:?usage: _dust_hive_name_in_lines <name> <lines>}"
  local lines="${2-}"

  [[ "
$lines
" == *"
$name
"* ]]
}

_dust_hive_fast_state_rows() {
  local docker_warm_envs env_dir env_name state service

  [[ -d "$HOME/.dust-hive/envs" ]] || return

  docker_warm_envs="$(_dust_hive_docker_warm_envs)"

  while IFS= read -r env_dir; do
    env_name="${env_dir##*/}"
    [[ -f "$env_dir/metadata.json" ]] || continue

    state="stopped"
    if _dust_hive_name_in_lines "$env_name" "$docker_warm_envs"; then
      state="warm"
    elif _dust_hive_service_is_running "$env_name" "sdk" &&
      _dust_hive_service_is_running "$env_name" "sparkle"; then
      state="cold"
    fi

    if [[ "$state" != "warm" ]]; then
      for service in "${_dust_hive_warm_state_services[@]}"; do
        if _dust_hive_service_is_running "$env_name" "$service"; then
          state="warm"
          break
        fi
      done
    fi

    printf '%s %s\n' "$env_name" "$state"
  done < <(command find "$HOME/.dust-hive/envs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
}

_dust_hive_envs_by_states() {
  local desired_states=("$@")
  [[ ${#desired_states[@]} -gt 0 ]] || return
  local envs=()
  local name

  while IFS= read -r name; do
    [[ -n "$name" ]] && envs+=("$name")
  done < <(
    _dust_hive_fast_state_rows | awk -v desired_states="${desired_states[*]}" '
      BEGIN {
        split(desired_states, states, " ")
        for (i in states) {
          state_set[states[i]] = 1
        }
      }
      state_set[$2] { print $1 }
    '
  )

  local current
  current="$(_dust_hive_current_env)"

  local result=()
  if [[ -n "$current" ]]; then
    for name in "${envs[@]}"; do
      [[ "$name" == "$current" ]] && result+=("$name")
    done
    for name in "${envs[@]}"; do
      [[ "$name" != "$current" ]] && result+=("$name")
    done
  else
    result=("${envs[@]}")
  fi

  printf '%s\n' "${result[@]}"
}

_dust_hive_warmable_envs() {
  _dust_hive_envs_by_states cold
}

_dust_hive_warm_envs() {
  _dust_hive_envs_by_states warm
}

_dust_hive_coolable_envs() {
  _dust_hive_warm_envs
}

_dust_hive_startable_envs() {
  _dust_hive_envs_by_states stopped
}

_dust_hive_stoppable_envs() {
  _dust_hive_envs_by_states cold warm
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
          COMPREPLY=($(compgen -W "$(_dust_hive_warmable_envs)" -- "$cur"))
          ;;
      esac
      ;;
    cool|c)
      case "$cur" in
        -*)
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_coolable_envs)" -- "$cur"))
          ;;
      esac
      ;;
    start)
      case "$cur" in
        -*)
          ;;
        *)
          COMPREPLY=($(compgen -W "$(_dust_hive_startable_envs)" -- "$cur"))
          ;;
      esac
      ;;
    stop|x)
      # 1st positional = env, 2nd = service or another env, later positionals = envs
      local pos=0
      for (( i=cmd_index+1; i<cword; i++ )); do
        [[ "${COMP_WORDS[$i]}" != -* ]] && (( pos++ ))
      done
      if (( pos == 0 )); then
        COMPREPLY=($(compgen -W "$(_dust_hive_stoppable_envs)" -- "$cur"))
      elif (( pos == 1 )); then
        COMPREPLY=($(compgen -W "${_dust_hive_services[*]} $(_dust_hive_envs)" -- "$cur"))
      else
        COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "$cur"))
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
        COMPREPLY=($(compgen -W "$(_dust_hive_warm_envs)" -- "$cur"))
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
            COMPREPLY=($(compgen -W "$(_dust_hive_warm_envs)" -- "$cur"))
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
dhx() { command dust-hive spawn -C -c "codex" "$@"; }

_dust_hive_matching_row() {
  local query="${1:?usage: _dust_hive_matching_row <worktree-name-query>}"

  command dust-hive list | awk '
    /^[[:space:]]*$/ { next }
    /^NAME[[:space:]]/ { next }
    /^-+/ { next }
    {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[0-9]+-[0-9]+$/) {
          print $1 "\t" $i "\t" $0
          next
        }
      }
    }
  ' | fzf --filter="$query" --delimiter=$'\t' --nth=1,3 | head -n 1
}

_dust_hive_base_port() {
  local query="${1:?usage: _dust_hive_base_port <worktree-name-query>}"
  local row range

  row="$(_dust_hive_matching_row "$query")"

  if [[ -z "$row" ]]; then
    echo "No matching dust-hive worktree for: $query" >&2
    return 1
  fi

  range="$(printf '%s\n' "$row" | cut -f2)"
  printf '%s\n' "${range%%-*}"
}

dhb() {
  local query="${1:?usage: dhb <worktree-name-query>}"
  local offset="${DHB_PORT_OFFSET:-11}"
  local base port url

  base="$(_dust_hive_base_port "$query")" || return
  port=$((base + offset))
  url="http://localhost:${port}"

  echo "Opening $url"
  open "$url"
}

dhdb() {
  local usage="usage: dhdb <worktree-name-query> [front|connectors|core|dust_front|dust_connectors|dust_api|dust_oauth] [psql-args...]"
  local query="${1:?$usage}"
  shift
  local db="dust_front"
  local offset="${DHDB_PORT_OFFSET:-432}"
  local base port

  if (( $# > 0 )); then
    case "$1" in
      front|dust_front)
        db="dust_front"
        shift
        ;;
      connectors|dust_connectors)
        db="dust_connectors"
        shift
        ;;
      core|dust_api)
        db="dust_api"
        shift
        ;;
      oauth|dust_oauth)
        db="dust_oauth"
        shift
        ;;
      -*) ;;
      *)
        echo "Invalid database: $1" >&2
        echo "$usage" >&2
        return 2
        ;;
    esac
  fi

  base="$(_dust_hive_base_port "$query")" || return
  port=$((base + offset))

  echo "Connecting to $db on localhost:$port"
  command psql "postgres://dev:dev@localhost:${port}/${db}" "$@"
}

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
_dhx()  { local COMP_WORDS=("dust-hive" "spawn" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }
_dhb() {
  if (( COMP_CWORD == 1 )); then
    COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "${COMP_WORDS[COMP_CWORD]}"))
  fi
}
_dhdb() {
  if (( COMP_CWORD == 1 )); then
    COMPREPLY=($(compgen -W "$(_dust_hive_envs)" -- "${COMP_WORDS[COMP_CWORD]}"))
  elif (( COMP_CWORD == 2 )); then
    local cur="${COMP_WORDS[COMP_CWORD]}"

    case "$cur" in
      front*) COMPREPLY=(dust_front) ;;
      connectors*) COMPREPLY=(dust_connectors) ;;
      core*) COMPREPLY=(dust_api) ;;
      oauth*) COMPREPLY=(dust_oauth) ;;
      "") COMPREPLY=(dust_front dust_connectors dust_api dust_oauth) ;;
      *) COMPREPLY=($(compgen -W "dust_front dust_connectors dust_api dust_oauth" -- "$cur")) ;;
    esac
  fi
}
_dhcd() { local COMP_WORDS=("dust-hive" "cd" "${COMP_WORDS[@]:1}"); local COMP_CWORD=$(( COMP_CWORD + 1 )); _dust_hive_complete; }

complete -F _dhs  dhs
complete -F _dho  dho
complete -F _dhl  dhl
complete -F _dhd  dhd
complete -F _dhw  dhw
complete -F _dhc  dhc
complete -F _dhx  dhx
complete -F _dhb  dhb
complete -F _dhdb dhdb
complete -F _dhcd dhcd
