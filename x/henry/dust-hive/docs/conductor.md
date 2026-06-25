# Plug DustHive into Conductor

This guide wires Conductor as the workspace creator and DustHive as the
environment manager.

The important rule: Conductor owns the Git worktree, then DustHive adopts that
worktree. Do not make Conductor warm DustHive environments. Starting the
environment in the cold state is enough for normal agent work.

## What this gives you

- Conductor creates one worktree per workspace.
- DustHive registers that worktree as an environment.
- DustHive creates the per-environment `env.sh`, `.envrc`, ports, test database,
  and cold build watchers.
- `sdk` and `sparkle` run in cold state.
- Docker and the full app stack stay stopped unless you explicitly warm the
  environment.

## Prerequisites

1. Install and set up DustHive.

   ```bash
   cd /Users/henryfontanier/dev/dust/x/henry/dust-hive
   bun install
   bun link
   dust-hive doctor
   ```

2. Install `direnv` and add the shell hook.

   ```bash
   brew install direnv
   echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
   ```

3. Optional: hide direnv's verbose environment diff.

   ```bash
   mkdir -p ~/.config/direnv
   cat > ~/.config/direnv/direnv.toml <<'EOF'
   [global]
   hide_env_diff = true
   EOF
   ```

4. Restart your shell or run:

   ```bash
   source ~/.zshrc
   ```

## 1. Put Conductor worktrees under `.hives`

DustHive's adopted worktrees must live inside the main Dust repo. This is what
keeps the shared `node_modules` and workspace overrides working.

Create a Conductor root inside the Dust repo:

```bash
DUST_REPO=/Users/henryfontanier/dev/dust
mkdir -p "$DUST_REPO/.hives/external/conductor"
```

In Conductor:

1. Open Settings.
2. Go to User settings.
3. Open Advanced.
4. Set the Conductor root directory to:

   ```text
   /Users/henryfontanier/dev/dust/.hives/external/conductor
   ```

If the file picker hides `.hives`, use macOS "Go to Folder" in the picker:

```text
Cmd+Shift+G
```

Then paste the full path.

## 2. Add local Conductor repo settings

Create a machine-local Conductor settings file in the main Dust checkout:

```bash
cd /Users/henryfontanier/dev/dust
mkdir -p .conductor
$EDITOR .conductor/settings.local.toml
```

Use this content:

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

spotlight_testing = false

[scripts]
setup = '''
set -euo pipefail

if HIVE_PATH="$(dust-hive cd "$CONDUCTOR_WORKSPACE_NAME" 2>/dev/null)"; then
  if [ "$HIVE_PATH" != "$CONDUCTOR_WORKSPACE_PATH" ]; then
    echo "DustHive env '$CONDUCTOR_WORKSPACE_NAME' already exists at $HIVE_PATH, expected $CONDUCTOR_WORKSPACE_PATH" >&2
    exit 1
  fi

  dust-hive start "$CONDUCTOR_WORKSPACE_NAME"
else
  dust-hive adopt \
    --path "$CONDUCTOR_WORKSPACE_PATH" \
    --name "$CONDUCTOR_WORKSPACE_NAME" \
    --base-branch "$CONDUCTOR_DEFAULT_BRANCH" \
    --wait
fi

mkdir -p .codex/skills
if [ -d .claude/skills ]; then
  cp -R .claude/skills/. .codex/skills/
fi
'''

run = '''
dust-hive start "$CONDUCTOR_WORKSPACE_NAME"
'''

archive = '''
dust-hive unregister "$CONDUCTOR_WORKSPACE_NAME" || true
'''

run_mode = "concurrent"
```

Why each piece is there:

- `setup`: runs after Conductor creates the worktree. It adopts the worktree
  into DustHive, starts the cold watchers, and copies Dust skills into the
  Codex skill location.
- `run`: keeps the environment started, but does not warm it.
- `archive`: removes DustHive's registration and generated resources while
  leaving Conductor to archive or remove its own worktree.
- `spotlight_testing = false`: keeps Conductor testing workspace-local.

Do not enable "Auto-run after setup" for this repository. The setup script
already starts the DustHive environment in cold state. The run script is only
for the Run button.

Optional validation:

```bash
npx -y @taplo/cli lint \
  --schema https://conductor.build/schemas/settings.repo.schema.json \
  .conductor/settings.local.toml
```

## 3. Create a Conductor workspace

Create a new workspace in Conductor. Conductor will:

1. Pick a city name, for example `kyoto`.
2. Create a worktree under:

   ```text
   /Users/henryfontanier/dev/dust/.hives/external/conductor/workspaces/dust/kyoto
   ```

3. Run the setup script.
4. Let DustHive adopt that worktree as env `kyoto`.

Verify from any terminal:

```bash
dust-hive status kyoto
dust-hive cd kyoto
```

Expected state:

```text
State: cold
Services:
  sdk      running
  sparkle  running
Docker: Stopped
```

That is the intended default. Only run `dust-hive warm kyoto` when you actually
need the full app stack.

## 4. Understand where env files live

DustHive writes two different files:

```text
<worktree>/.envrc
~/.dust-hive/envs/<env-name>/env.sh
```

For a Conductor workspace named `kyoto`:

```text
/Users/henryfontanier/dev/dust/.hives/external/conductor/workspaces/dust/kyoto/.envrc
/Users/henryfontanier/.dust-hive/envs/kyoto/env.sh
```

The `.envrc` file is hidden because it starts with a dot. Use:

```bash
ls -la "$(dust-hive cd kyoto)"
```

The `env.sh` file is not inside the worktree. It lives in DustHive's state
directory under `~/.dust-hive/envs/<env-name>/`.

## 5. Make direnv load in Conductor terminals

First, make sure normal direnv is installed:

```bash
command -v direnv
grep -n 'direnv hook zsh' ~/.zshrc
```

Open a fresh Conductor terminal in the workspace and run:

```bash
echo "$PORT"
echo "$FRONT_DATABASE_URI"
```

If those are set, direnv is working.

If they are missing, check whether direnv sees the worktree:

```bash
pwd
direnv status
direnv allow
exec zsh -l
```

Then check again:

```bash
echo "$PORT"
```

### Fallback zsh hook

Some Conductor terminal startup paths can enter the workspace after zsh startup,
which means a one-time `.zshrc` check can run too early. Add this fallback hook
to `~/.zshrc` after the normal direnv hook:

```zsh
# Conductor + DustHive: load the Hive env for Conductor-managed workspaces.
_dust_hive_load_conductor_env() {
  emulate -L zsh

  local workspace_root="/Users/henryfontanier/dev/dust/.hives/external/conductor/workspaces/dust"
  [[ "$PWD/" == "$workspace_root/"* ]] || return 0

  local workspace_tail="${PWD#$workspace_root/}"
  local env_name="${CONDUCTOR_WORKSPACE_NAME:-${workspace_tail%%/*}}"
  [[ -n "$env_name" ]] || return 0

  local env_file="$HOME/.dust-hive/envs/$env_name/env.sh"
  [[ -f "$env_file" ]] || return 0
  [[ "${DUST_HIVE_ENV_NAME:-}" == "$env_name" ]] && return 0

  source "$env_file"
  export DUST_HIVE_ENV_NAME="$env_name"
}

_dust_hive_load_conductor_env
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _dust_hive_load_conductor_env
add-zsh-hook precmd _dust_hive_load_conductor_env
```

Restart the Conductor terminal:

```bash
exec zsh -l
```

This fallback does not depend on Conductor exporting
`CONDUCTOR_WORKSPACE_NAME`. It derives the env name from the workspace path and
then sources `~/.dust-hive/envs/<env-name>/env.sh` directly.

## 6. Optional `cn` helper for workspace names

Conductor gives workspaces city names. Keep the city directory and DustHive env
name stable, but rename the Git branch and Conductor display metadata with a
small helper.

Install the helper:

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/conductor-name <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

usage() {
  cat <<'USAGE'
Usage:
  conductor-name [--dry-run] <name>

Examples:
  conductor-name fix-workspace-env
  conductor-name "external worktree docs"
  conductor-name fontanierh/external-worktree-docs
USAGE
}

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
  shift
fi

if [[ $# -eq 0 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

label="$*"

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

if [[ "$label" == */* && "$label" != *" "* ]]; then
  branch="$label"
  display_name="${label##*/}"
else
  display_name="$label"
  slug="$(slugify "$display_name")"
  if [[ -z "$slug" ]]; then
    echo "Could not derive a branch slug from: $display_name" >&2
    exit 1
  fi
  branch="fontanierh/$slug"
fi

workspace_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$workspace_root" ]]; then
  echo "Not inside a git worktree." >&2
  exit 1
fi

hive_env="$(basename "$workspace_root")"
metadata="$HOME/.dust-hive/envs/$hive_env/metadata.json"
if [[ ! -f "$metadata" ]]; then
  echo "Could not find DustHive metadata for env '$hive_env'." >&2
  echo "Expected: $metadata" >&2
  exit 1
fi

current_branch="$(git -C "$workspace_root" branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "Could not determine current branch in: $workspace_root" >&2
  exit 1
fi

if [[ "$current_branch" != "$branch" ]] && git -C "$workspace_root" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch already exists: $branch" >&2
  exit 1
fi

db="$HOME/Library/Application Support/com.conductor.app/conductor.db"

sql_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

echo "Workspace: $workspace_root"
echo "Hive env:   $hive_env"
echo "Branch:     $current_branch -> $branch"
echo "Label:      $display_name"

if [[ "$dry_run" -eq 1 ]]; then
  exit 0
fi

if [[ "$current_branch" != "$branch" ]]; then
  git -C "$workspace_root" branch -m "$branch"
fi

if [[ -f "$db" ]]; then
  root_sql="$(sql_quote "$workspace_root")"
  branch_sql="$(sql_quote "$branch")"
  label_sql="$(sql_quote "$display_name")"
  sqlite3 "$db" "
    update workspaces
       set branch = $branch_sql,
           placeholder_branch_name = $branch_sql,
           workspace_name = $label_sql,
           user_set_workspace_name = 1,
           user_set_branch_name = 1,
           updated_at = datetime('now')
     where workspace_path = $root_sql;
  "
fi

tmp="$(mktemp)"
jq --arg branch "$branch" '.workspaceBranch = $branch' "$metadata" > "$tmp"
mv "$tmp" "$metadata"

echo "Done. If Conductor does not refresh immediately, switch workspaces or restart the app."
EOF

chmod +x ~/.local/bin/conductor-name
```

Add the alias:

```bash
echo 'alias cn="conductor-name"' >> ~/.zshrc
source ~/.zshrc
```

Use it from inside the Conductor workspace:

```bash
cn "external worktree docs"
```

That turns the branch into:

```text
fontanierh/external-worktree-docs
```

It also updates DustHive's `workspaceBranch` metadata and Conductor's local
display metadata. It does not rename the worktree directory or DustHive env.

Always dry-run first if you are not sure which workspace the terminal is in:

```bash
cn --dry-run "external worktree docs"
```

## Troubleshooting

### Conductor cannot browse to `.hives`

Use `Cmd+Shift+G` in the file picker and paste the full path:

```text
/Users/henryfontanier/dev/dust/.hives/external/conductor
```

### Setup says the env already exists at another path

The same Conductor city name was already registered in DustHive. Either archive
the old Conductor workspace or unregister the stale env:

```bash
dust-hive unregister <env-name>
```

Only unregister if you are sure the old Conductor workspace no longer needs
that DustHive state.

### `echo "$PORT"` is empty in the terminal

Check the generated env directly:

```bash
source "$HOME/.dust-hive/envs/<env-name>/env.sh"
echo "$PORT"
```

If that works, the DustHive env exists and only shell loading is broken. Fix
direnv or add the fallback zsh hook above.

### The workspace is warm after creation

The setup or run script is calling `dust-hive warm`. Remove that call. The
Conductor integration should use only:

```bash
dust-hive adopt ...
dust-hive start ...
```

Warm manually only when you need the full app stack.

### The Conductor sidebar still shows the city name

Use the `cn` helper to rename the branch and local display metadata. If the UI
does not refresh immediately, switch away from the workspace and back, or
restart Conductor.

## References

- Conductor workspace model: https://www.conductor.build/docs/concepts/workspaces-and-branches
- Conductor Git worktrees: https://www.conductor.build/docs/concepts/git-worktrees
- Conductor project scripts: https://www.conductor.build/docs/reference/scripts
- Conductor variables: https://www.conductor.build/docs/reference/environment-variables
- Conductor city names: https://www.conductor.build/docs/reference/cities
