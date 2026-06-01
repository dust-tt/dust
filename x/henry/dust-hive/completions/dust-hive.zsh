#compdef dust-hive dh

# Zsh completion script for dust-hive (and dh alias)
#
# Install (pick one):
#   1. Source directly in .zshrc:
#        source /path/to/completions/dust-hive.zsh
#   2. Symlink into a directory on your $fpath:
#        ln -s /path/to/completions/dust-hive.zsh "${fpath[1]}/_dust-hive"
#   3. Add the completions dir to fpath (before compinit):
#        fpath=(/path/to/completions $fpath)
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

_dust_hive_services=(
  sdk sparkle front core oauth connectors front-workers front-spa-poke front-spa-app viz
)
_dust_hive_warm_state_services=(
  front front-api core oauth connectors front-workers front-spa-poke front-spa-app viz
)
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
    # Lightweight JSON parse — avoid external deps
    local last
    last="$(command grep -o '"lastEnv" *: *"[^"]*"' "$activity" 2>/dev/null | head -1)"
    [[ -n "$last" ]] || return
    # Extract value between the last pair of quotes
    last="${last##*: \"}"
    last="${last%\"}"
    echo "$last"
  fi
}

_dust_hive_envs() {
  local -a envs
  if [[ -d ~/.dust-hive/envs ]]; then
    envs=(${(f)"$(ls ~/.dust-hive/envs 2>/dev/null)"})
  fi
  (( $#envs )) || return

  _dust_hive_describe_envs "${envs[@]}"
}

_dust_hive_describe_envs() {
  local -a envs=("$@")
  (( $#envs )) || return

  local current
  current="$(_dust_hive_current_env)"

  if [[ -n "$current" ]] && (( ${envs[(Ie)$current]} )); then
    # Show current/active env first in its own group so menu-select highlights it
    local -a others=("${(@)envs:#$current}")
    local -a active=("$current")
    _describe -V 'current environment' active
    (( $#others )) && _describe -V 'environment' others
  else
    _describe -V 'environment' envs
  fi
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
  (( $# )) || return
  local desired_states="$*"
  local -a envs

  envs=(${(f)"$(
    _dust_hive_fast_state_rows | awk -v desired_states="$desired_states" '
      BEGIN {
        split(desired_states, states, " ")
        for (i in states) {
          state_set[states[i]] = 1
        }
      }
      state_set[$2] { print $1 }
    '
  )"})

  _dust_hive_describe_envs "${envs[@]}"
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

_dust_hive_service() {
  _describe 'service' _dust_hive_services
}

_dust-hive() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _arguments -C \
    '1:command:->command' \
    '*::args:->args'

  case $state in
    command)
      local -a commands=(
        'spawn:Create a new environment'
        'open:Open environment terminal session'
        'reload:Kill and reopen terminal session'
        'restart:Restart a single service'
        'warm:Start docker and all services'
        'cool:Stop services, keep SDK watch'
        'start:Resume stopped environment'
        'stop:Stop all services in environment'
        'up:Start managed services (temporal + test postgres + test redis)'
        'down:Stop all envs, temporal, test postgres, test redis'
        'destroy:Remove environment'
        'list:Show all environments'
        'status:Show service health'
        'logs:Show service logs'
        'url:Print front URL'
        'cd:Print worktree path'
        'setup:Check prerequisites and guide initial setup'
        'doctor:Check prerequisites (non-interactive)'
        'cache:Show binary cache status'
        'refresh:Restore node_modules links in worktree'
        'forward:Manage OAuth port forwarding'
        'sync:Pull latest main, rebuild binaries, refresh deps'
        'temporal:Manage Temporal server'
        'seed-config:Extract user data from existing DB'
        'feed:Run seed script for a scenario'
        'flag:Toggle a feature flag on the workspace'
        'help:Show help'
      )
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        spawn|s)
          _arguments \
            '1::name:' \
            '-n[Environment name]:name:' \
            '--name[Environment name]:name:' \
            '-b[Git branch name]:branch:' \
            '--branch-name[Git branch name]:branch:' \
            '-r[Reuse existing local branch]' \
            '--reuse-existing-branch[Reuse existing local branch]' \
            '-O[Do not open terminal session]' \
            '--no-open[Do not open terminal session]' \
            '-A[Create session but do not attach]' \
            '--no-attach[Create session but do not attach]' \
            '-w[Open with warm tab]' \
            '--warm[Open with warm tab]' \
            '-W[Wait for SDK to build before opening]' \
            '--wait[Wait for SDK to build before opening]' \
            '-c[Run command in shell tab]:command:' \
            '--command[Run command in shell tab]:command:' \
            '-C[Use compact layout]' \
            '--compact[Use compact layout]' \
            '-u[Use single unified logs tab]' \
            '--unified-logs[Use single unified logs tab]'
          ;;
        open|o)
          _arguments \
            '1::name:_dust_hive_envs' \
            '-C[Use compact layout]' \
            '--compact[Use compact layout]' \
            '-u[Use single unified logs tab]' \
            '--unified-logs[Use single unified logs tab]'
          ;;
        reload)
          _arguments \
            '1::name:_dust_hive_envs' \
            '-u[Use single unified logs tab]' \
            '--unified-logs[Use single unified logs tab]'
          ;;
        restart)
          _arguments \
            '1::name:_dust_hive_envs' \
            '2::service:_dust_hive_service'
          ;;
        warm|w)
          _arguments \
            '*::names:_dust_hive_warmable_envs' \
            '-F[Disable OAuth port forwarding]' \
            '--no-forward[Disable OAuth port forwarding]' \
            '-p[Kill processes blocking service ports]' \
            '--force-ports[Kill processes blocking service ports]'
          ;;
        cool|c)
          _arguments '*::names:_dust_hive_coolable_envs'
          ;;
        start)
          _arguments '*::names:_dust_hive_startable_envs'
          ;;
        stop|x)
          _arguments \
            '1::name:_dust_hive_stoppable_envs' \
            '2::service:_dust_hive_service'
          ;;
        up)
          _arguments \
            '-a[Attach to main terminal session]' \
            '--attach[Attach to main terminal session]' \
            '-f[Force rebuild even if no changes]' \
            '--force[Force rebuild even if no changes]' \
            '-C[Use compact layout]' \
            '--compact[Use compact layout]'
          ;;
        down)
          _arguments \
            '-f[Skip confirmation prompt]' \
            '--force[Skip confirmation prompt]'
          ;;
        destroy|rm)
          _arguments \
            '1::name:_dust_hive_envs' \
            '-f[Force destroy even with uncommitted changes]' \
            '--force[Force destroy even with uncommitted changes]' \
            '-k[Keep the git branch]' \
            '--keep-branch[Keep the git branch]'
          ;;
        list|ls|l)
          ;;
        status|st)
          _arguments '1::name:_dust_hive_envs'
          ;;
        logs|log)
          _arguments \
            '1::name:_dust_hive_envs' \
            '2::service:_dust_hive_service' \
            '-f[Follow log output]' \
            '--follow[Follow log output]' \
            '-i[Interactive TUI with service switching]' \
            '--interactive[Interactive TUI with service switching]'
          ;;
        url|cd)
          _arguments '1::name:_dust_hive_envs'
          ;;
        setup)
          _arguments \
            '-y[Run without prompts]' \
            '--non-interactive[Run without prompts]'
          ;;
        doctor|cache)
          ;;
        refresh)
          _arguments '1::name:_dust_hive_envs'
          ;;
        forward)
          _arguments \
            '1::name or subcommand:->forward_arg'
          case $state in
            forward_arg)
              local -a subcmds=('status:Show current forwarding status' 'stop:Stop the port forwarder')
              _describe 'subcommand' subcmds
              _dust_hive_envs
              ;;
          esac
          ;;
        sync)
          _arguments \
            '-f[Force rebuild even if no changes]' \
            '--force[Force rebuild even if no changes]'
          ;;
        temporal)
          _arguments \
            '1::subcommand:(start stop restart status logs)'
          ;;
        seed-config)
          _arguments '1:postgres-uri:'
          ;;
        feed)
          _arguments \
            '1::name:_dust_hive_warm_envs' \
            '2::scenario:'
          ;;
        flag)
          _arguments \
            '1::name:_dust_hive_warm_envs' \
            '2::flag name:' \
            '-d[Disable the flag]' \
            '--disable[Disable the flag]'
          ;;
      esac
      ;;
  esac
}

# dh: simple alias for dust-hive
alias dh=dust-hive

# Shorthand aliases (use `function` keyword to avoid zsh alias expansion on the name)
unalias dhs dho dhl dhd dhw dhc dhx dhb dhdb dhcd 2>/dev/null
function dhs  { command dust-hive spawn -C -c "claude --dangerously-skip-permissions" "$@"; }
function dho  { command dust-hive open -C "$@"; }
function dhl  { command dust-hive list "$@"; }
function dhd  { command dust-hive destroy "$@"; }
function dhw  { command dust-hive warm "$@"; }
function dhc  { command dust-hive cool "$@"; }
function dhx  { command dust-hive spawn -C -c "codex" "$@"; }

function _dust_hive_matching_row {
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

function _dust_hive_base_port {
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

function dhb {
  local query="${1:?usage: dhb <worktree-name-query>}"
  local offset="${DHB_PORT_OFFSET:-11}"
  local base port url

  base="$(_dust_hive_base_port "$query")" || return
  port=$((base + offset))
  url="http://localhost:${port}"

  echo "Opening $url"
  open "$url"
}

function dhdb {
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
function dhcd {
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

# Completions for shorthand aliases — complete remaining args for the underlying command
function _dhs  { local words=("dust-hive" "spawn" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dho  { local words=("dust-hive" "open" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dhl  { :; }
function _dhd  { local words=("dust-hive" "destroy" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dhw  { local words=("dust-hive" "warm" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dhc  { local words=("dust-hive" "cool" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dhx  { local words=("dust-hive" "spawn" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }
function _dhb  { _arguments '1::worktree:_dust_hive_envs'; }
function _dhdb_database {
  local cur="${words[CURRENT]}"
  local use_unmatched=0
  local -a dbs

  case "$cur" in
    front*) dbs=(dust_front); use_unmatched=1 ;;
    connectors*) dbs=(dust_connectors); use_unmatched=1 ;;
    core*) dbs=(dust_api); use_unmatched=1 ;;
    oauth*) dbs=(dust_oauth); use_unmatched=1 ;;
    *) dbs=(dust_front dust_connectors dust_api dust_oauth) ;;
  esac

  if (( use_unmatched )); then
    compadd -U -X database -- "${dbs[@]}"
  else
    compadd -X database -- "${dbs[@]}"
  fi
}
function _dhdb {
  case "$CURRENT" in
    2)
      _dust_hive_envs
      ;;
    3)
      if [[ "${words[CURRENT]}" == -* ]]; then
        _files
      else
        _dhdb_database
      fi
      ;;
    *)
      _files
      ;;
  esac
}
function _dhcd { local words=("dust-hive" "cd" "${(@)words[2,-1]}"); local CURRENT=$((CURRENT+1)); _dust-hive; }

# When loaded via fpath, zsh calls the file as a function — invoke the completer.
# When sourced manually, just register with compdef and skip the direct call.
if [[ "$funcstack[1]" == _dust-hive ]]; then
  _dust-hive "$@"
else
  compdef _dust-hive dust-hive dh
  compdef _dhs dhs
  compdef _dho dho
  compdef _dhl dhl
  compdef _dhd dhd
  compdef _dhw dhw
  compdef _dhc dhc
  compdef _dhx dhx
  compdef _dhb dhb
  compdef _dhdb dhdb
  compdef _dhcd dhcd
fi
