# Plug DustHive into Conductor

Use this when Conductor should create each Git worktree, while DustHive should
own the per-worktree Dust environment.

The same pattern works for any external workspace manager:

1. Put the external tool's worktrees under the main Dust checkout.
2. Run `dust-hive adopt --path <worktree> --name <env>` after the tool creates a
   worktree.
3. Run `dust-hive start <env>` to keep the cold environment ready.
4. Install a local Git hook that copies repo-local Claude skills into each
   worktree and points `.codex` at `.claude`.
5. Run `dust-hive unregister <env>` when the external workspace is archived.

Do not warm environments automatically from setup scripts. A cold environment
with `sdk` and `sparkle` running is enough for normal agent work. Run
`dust-hive warm <env>` manually only when you need the full app stack.

## 0. Pick your Dust checkout path

Set this to your main Dust checkout:

```bash
export DUST_REPO="$HOME/dev/dust"
```

All commands below assume that variable is set.

## 1. Check prerequisites

Install DustHive from the Dust checkout:

```bash
cd "$DUST_REPO/x/henry/dust-hive"
bun install
bun link
dust-hive doctor
```

Install `direnv` and enable it for zsh:

```bash
brew install direnv
grep -q 'direnv hook zsh' ~/.zshrc || echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
```

Optional: silence the verbose direnv diff:

```bash
mkdir -p ~/.config/direnv
cat > ~/.config/direnv/direnv.toml <<'EOF'
[global]
hide_env_diff = true
EOF
```

Restart the shell:

```bash
exec zsh -l
```

## 2. Point Conductor at `.hives`

Create a Conductor root inside the main Dust checkout:

```bash
mkdir -p "$DUST_REPO/.hives/external/conductor"
```

In Conductor:

1. Open Settings.
2. Go to User settings.
3. Open Advanced.
4. Set the Conductor root directory to:

   ```text
   <your Dust checkout>/.hives/external/conductor
   ```

If the macOS file picker hides `.hives`, press `Cmd+Shift+G` in the picker and
paste the full path.

The root must be under the main Dust checkout. DustHive relies on this for the
shared repo layout and `node_modules` behavior.

## 3. Install the worktree hook

Git worktrees do not copy ignored local files. Install a local `post-checkout`
hook so skills are present as soon as `git worktree add` finishes, before
Conductor starts its first agent process.

Run this once from the main Dust checkout:

```bash
cd "$DUST_REPO"
mkdir -p .husky
grep -qxF '.husky/' .git/info/exclude || echo '.husky/' >> .git/info/exclude

cat > .husky/post-checkout <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

worktree="$(git rev-parse --show-toplevel 2>/dev/null || true)"
common_git_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"

if [ -z "$worktree" ] || [ -z "$common_git_dir" ]; then
  exit 0
fi

case "$common_git_dir" in
  /*) ;;
  *) common_git_dir="$(cd "$worktree" && cd "$common_git_dir" && pwd -P)" ;;
esac

main_checkout="${common_git_dir%/.git}"

if [ "$worktree" = "$main_checkout" ]; then
  exit 0
fi

if [ ! -d "$main_checkout/.claude/skills" ]; then
  exit 0
fi

mkdir -p "$worktree/.claude"
rm -rf "$worktree/.claude/skills"
cp -R "$main_checkout/.claude/skills" "$worktree/.claude/skills"

if [ -f "$main_checkout/.claude/config.toml" ]; then
  cp "$main_checkout/.claude/config.toml" "$worktree/.claude/config.toml"
fi

rm -rf "$worktree/.codex"
ln -s .claude "$worktree/.codex"
EOF

chmod +x .husky/post-checkout
git config core.hooksPath "$DUST_REPO/.husky"
```

Keep your main checkout in the same layout:

```bash
if [ ! -e .codex ]; then
  ln -s .claude .codex
fi
```

## 4. Add Conductor scripts

Create a machine-local Conductor config in the main Dust checkout:

```bash
cd "$DUST_REPO"
mkdir -p .conductor
$EDITOR .conductor/settings.local.toml
```

Paste this:

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
    --base-branch "$CONDUCTOR_DEFAULT_BRANCH"
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

Leave "Auto-run after setup" off in Conductor. The setup script already starts
the cold DustHive environment. Use the Run button only when you want to call
`dust-hive start` again.

Validate the TOML:

```bash
npx -y @taplo/cli lint \
  --schema https://conductor.build/schemas/settings.repo.schema.json \
  .conductor/settings.local.toml
```

## 5. Create a Conductor workspace

Create a new Conductor workspace for Dust.

Conductor will create a city-named worktree such as:

```text
<your Dust checkout>/.hives/external/conductor/workspaces/dust/kyoto
```

The Git hook creates:

```text
<worktree>/.claude/skills
<worktree>/.codex -> .claude
```

The setup script registers that worktree with DustHive as env `kyoto`.

Check it from any terminal:

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

## 6. Make Conductor terminals load the env

Conductor terminals can enter the worktree after zsh startup. When that happens,
the normal `eval "$(direnv hook zsh)"` line has already run and the DustHive env
does not load.

Add this Conductor-specific direnv fallback once from a normal terminal where
`DUST_REPO` is set:

```bash
if ! grep -q 'DUST_HIVE_CONDUCTOR_WORKSPACES' ~/.zshrc; then
  cat >> ~/.zshrc <<EOF

# DustHive + Conductor direnv fallback.
export DUST_HIVE_CONDUCTOR_WORKSPACES="$DUST_REPO/.hives/external/conductor/workspaces/dust"
EOF

  cat >> ~/.zshrc <<'EOF'

_dust_hive_conductor_direnv() {
  emulate -L zsh
  command -v direnv >/dev/null 2>&1 || return 0

  local root="${DUST_HIVE_CONDUCTOR_WORKSPACES%/}"
  if [[ "$PWD/" == "$root/"* || -n "${DIRENV_DIR:-}" ]]; then
    eval "$(direnv export zsh)"
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _dust_hive_conductor_direnv
EOF
fi
```

Restart the Conductor terminal:

```bash
exec zsh -l
```

Then allow direnv once from inside the Conductor workspace:

```bash
direnv allow
```

For a new Conductor workspace, the setup script in step 4 creates both
`<worktree>/.envrc` and `~/.dust-hive/envs/<env-name>/env.sh`.

For an existing Conductor workspace created before the setup script was added,
run this once from inside that workspace:

```bash
workspace="$(git rev-parse --show-toplevel)"
env_name="$(basename "$workspace")"
"$DUST_REPO/.husky/post-checkout"
dust-hive adopt --path "$workspace" --name "$env_name" --base-branch main
dust-hive start "$env_name"
direnv allow
```

Do not add `source ~/.dust-hive/envs/<env-name>/env.sh` to `~/.zshrc`. That
loads one env globally. The hook above lets direnv load and unload the right env
based on the current directory.

## 7. Optional `cn` CLI for nicer names

Conductor creates city-named workspaces. The city directory and DustHive env
name should stay stable, but you can rename the Git branch and Conductor display
metadata.

Install dependencies:

```bash
brew install jq sqlite
```

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
  conductor-name username/external-worktree-docs

Optional:
  export CONDUCTOR_BRANCH_PREFIX=username
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

for bin in git jq sqlite3 sed mktemp; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing required command: $bin" >&2
    exit 1
  fi
done

label="$*"
branch_prefix="${CONDUCTOR_BRANCH_PREFIX:-}"

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

  if [[ -n "$branch_prefix" ]]; then
    branch="$branch_prefix/$slug"
  else
    branch="$slug"
  fi
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

echo "Workspace: $workspace_root"
echo "Hive env:   $hive_env"
echo "Branch:     $current_branch -> $branch"
echo "Label:      $display_name"

if [[ "$dry_run" -eq 1 ]]; then
  exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
jq --arg branch "$branch" '.workspaceBranch = $branch' "$metadata" > "$tmp"

if [[ "$current_branch" != "$branch" ]]; then
  git -C "$workspace_root" branch -m "$branch"
fi

db="$HOME/Library/Application Support/com.conductor.app/conductor.db"

sql_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

if [[ -f "$db" ]]; then
  root_sql="$(sql_quote "$workspace_root")"
  branch_sql="$(sql_quote "$branch")"
  label_sql="$(sql_quote "$display_name")"
  if updated_rows="$(sqlite3 "$db" "
    update workspaces
       set branch = $branch_sql,
           placeholder_branch_name = $branch_sql,
           workspace_name = $label_sql,
           user_set_workspace_name = 1,
           user_set_branch_name = 1,
           updated_at = datetime('now')
     where workspace_path = $root_sql;
    select changes();
  " 2>/dev/null)"; then
    if [[ "$updated_rows" == "0" ]]; then
      echo "Warning: Conductor database did not contain this workspace path." >&2
    fi
  else
    echo "Warning: could not update Conductor display metadata." >&2
  fi
fi

mv "$tmp" "$metadata"
trap - EXIT

echo "Done. If Conductor does not refresh immediately, switch workspaces or restart the app."
EOF

chmod +x ~/.local/bin/conductor-name
```

Add the alias:

```bash
grep -q 'alias cn=' ~/.zshrc || echo 'alias cn="conductor-name"' >> ~/.zshrc
```

Optional: set a branch prefix:

```bash
echo 'export CONDUCTOR_BRANCH_PREFIX="<your-github-username>"' >> ~/.zshrc
```

Restart the shell:

```bash
exec zsh -l
```

Use it from inside a Conductor workspace:

```bash
cn --dry-run "external worktree docs"
cn "external worktree docs"
```

Without `CONDUCTOR_BRANCH_PREFIX`, that renames the branch to:

```text
external-worktree-docs
```

With `CONDUCTOR_BRANCH_PREFIX=username`, it renames the branch to:

```text
username/external-worktree-docs
```

`cn` does not rename the worktree directory or DustHive env.

## Troubleshooting

### Conductor cannot browse to `.hives`

Press `Cmd+Shift+G` in the macOS file picker and paste:

```text
<your Dust checkout>/.hives/external/conductor
```

### Setup says the env already exists at another path

The city name is already registered in DustHive. Archive the old Conductor
workspace or unregister the stale env:

```bash
dust-hive unregister <env-name>
```

### Conductor terminal env is still missing

Make sure the zsh fallback from step 6 is in `~/.zshrc`, restart the Conductor
terminal, then run:

```bash
direnv allow
```

If this workspace existed before you added the Conductor setup script, adopt it
once with the command in step 6.

### The workspace is warm after creation

Remove any `dust-hive warm` call from Conductor scripts. The scripts should use
only:

```bash
dust-hive adopt ...
dust-hive start ...
```

### Conductor still shows the city name

Run `cn` from inside the workspace. If the UI does not refresh immediately,
switch workspaces or restart Conductor.

## References

- Conductor workspaces: https://www.conductor.build/docs/concepts/workspaces-and-branches
- Conductor Git worktrees: https://www.conductor.build/docs/concepts/git-worktrees
- Conductor project scripts: https://www.conductor.build/docs/reference/scripts
- Conductor variables: https://www.conductor.build/docs/reference/environment-variables
- Conductor city names: https://www.conductor.build/docs/reference/cities
