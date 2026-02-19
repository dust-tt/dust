# dust-hive

CLI tool for running multiple isolated Dust development environments simultaneously.

Each environment gets its own:
- Git worktree (separate branch)
- Port range (no conflicts)
- Docker containers (isolated volumes)
- Database instances

## Prerequisites

Install these before using dust-hive:

```bash
# Bun (runtime for dust-hive itself)
curl -fsSL https://bun.sh/install | bash

# nvm (Node version manager for front/connectors)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Rust toolchain (for core/oauth)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Zellij (terminal multiplexer)
brew install zellij

# Docker (via OrbStack or Docker Desktop)
brew install --cask orbstack

# Temporal CLI (workflow engine)
brew install temporal

# direnv (auto-load environment variables)
brew install direnv

# Build dependencies
brew install cmake protobuf

# sccache (optional - Rust compilation cache, speeds up rebuilds)
brew install sccache

# fzf (optional - used by `dust-hive open` when NAME is omitted)
brew install fzf

# psql (required for seed-config command)
brew install postgresql
```

> **Linux users**: Also install `lsof` if not already available (`sudo apt install lsof`)

### direnv setup

1. **Add the shell hook** to your shell config:

   **For zsh** (`~/.zshrc`):
   ```bash
   eval "$(direnv hook zsh)"
   ```

   **For bash** (`~/.bashrc`):
   ```bash
   eval "$(direnv hook bash)"
   ```

2. **Silence verbose output** by creating `~/.config/direnv/direnv.toml`:
   ```bash
   mkdir -p ~/.config/direnv
   cat > ~/.config/direnv/direnv.toml << 'EOF'
   [global]
   hide_env_diff = true
   EOF
   ```

This enables automatic environment loading when you `cd` into any dust-hive worktree. The `.envrc` file in each worktree sources the environment variables for that environment.

After adding the hook, restart your shell or run `source ~/.zshrc` (or `~/.bashrc`).

### sccache setup

Configure cargo to use sccache by adding to `~/.cargo/config.toml`:

```toml
[build]
rustc-wrapper = "sccache"
```

## Installation

```bash
# From the dust repo
cd x/henry/dust-hive

# Install dependencies and link globally
bun install
bun link
```

Now `dust-hive` is available globally. No build step needed - Bun runs TypeScript directly.

## Initial Setup

1. **Create config file** with your secrets:

```bash
mkdir -p ~/.dust-hive
cp /path/to/your/.env ~/.dust-hive/config.env
```

The `config.env` must use `export` statements (e.g., `export API_KEY=xxx`). It contains all the environment variables from your local dev setup (API keys, OAuth secrets, etc.).

2. **Start managed services** (temporal server + main zellij session):

```bash
# From the main Dust repo (on main branch, clean working directory)
dust-hive up

# Or attach to the main zellij session immediately
dust-hive up -a
```

This runs `dust-hive sync` to update dependencies, starts the Temporal server as a managed daemon, and creates a main zellij session with tabs for the repo shell and temporal logs.

## Quick Start

```bash
# Start managed services (temporal + test postgres + test redis + main session)
dust-hive up

# Create a new environment
dust-hive spawn myenv

# Start all services (docker, front, core, connectors, etc.)
dust-hive warm myenv

# Open the environment's terminal UI
dust-hive open myenv

# Get the app URL
dust-hive url myenv
# http://localhost:10000

# Open in browser
open $(dust-hive url myenv)

# Stop everything when done
dust-hive down
```

## Commands

> **Tip**: Run `dust-hive <command> --help` for all available options.

### Managed Services

| Command | Description |
|---------|-------------|
| `up [-a] [-f]` | Start temporal + test postgres + test redis + sync + create main session (from main repo) |
| `down [-f]` | Stop all envs, temporal, test postgres, test redis, and sessions |
| `temporal start\|stop\|restart\|status\|logs` | Manage Temporal server |

### Environment Commands

| Command | Description |
|---------|-------------|
| `spawn [NAME] [--no-open] [--no-attach] [--warm] [--wait]` | Create new environment |
| `warm [NAME] [--no-forward] [--force-ports]` | Start docker + all services |
| `cool [NAME]` | Pause services + docker, keep SDK (fast restart) |
| `start [NAME]` | Resume stopped environment (when NAME provided) |
| `stop [NAME]` | Full stop + remove docker containers |
| `destroy [NAME] [--force]` | Remove environment completely (multi-select if NAME omitted) |
| `restart [NAME] SERVICE` | Restart a single service |
| `open [NAME]` | Open zellij terminal session |
| `reload [NAME]` | Kill and reopen zellij session |
| `list` | Show all environments |
| `status [NAME]` | Show service health |
| `logs [NAME] [SERVICE] [-f]` | View service logs |
| `url [NAME]` | Print front URL |

### Utilities

| Command | Description |
|---------|-------------|
| `setup [-y]` | Check prerequisites and guide initial setup (run this first!) |
| `doctor` | Check prerequisites (non-interactive) |
| `cache` | Show binary cache status |
| `forward [NAME\|status\|stop]` | Manage OAuth port forwarding |
| `sync [-f]` | Pull latest main, rebuild binaries, refresh deps |
| `seed-config <postgres-uri>` | Extract user data from existing DB for seeding |

**Aliases**: Most commands have short aliases (e.g., `s` for spawn, `o` for open, `w` for warm). Run `dust-hive --help` to see all aliases.

> **Tip**: When `NAME` is omitted, you'll get an interactive picker to select an environment.
> It pre-selects the current environment (if you're in a worktree) or the last one you used.

### Services

Available services for `logs` command:
- `sdk` - TypeScript SDK watcher
- `front` - Next.js frontend
- `core` - Rust core API
- `oauth` - Rust OAuth service
- `connectors` - TypeScript connectors
- `front-workers` - Temporal workers

## Environment States

| State | Description |
|-------|-------------|
| **stopped** | Nothing running |
| **cold** | Only SDK watch running |
| **warm** | All services running |

## Port Allocation

Each environment gets a 1000-port range:

| Environment | Port Range | Front | Core | Connectors |
|-------------|------------|-------|------|------------|
| 1st env | 10000-10999 | 10000 | 10001 | 10002 |
| 2nd env | 11000-11999 | 11000 | 11001 | 11002 |
| 3rd env | 12000-12999 | 12000 | 12001 | 12002 |

## OAuth Forwarding

OAuth providers (WorkOS, Google, GitHub, etc.) are configured to redirect to `http://localhost:3000`. Since dust-hive uses different ports per environment, a TCP forwarder routes standard ports to the active environment:

| Standard Port | Service | Environment Port |
|---------------|---------|------------------|
| 3000 | front | base + 0 |
| 3001 | core | base + 1 |
| 3002 | connectors | base + 2 |
| 3006 | oauth | base + 6 |

**Automatic**: When you run `dust-hive warm`, these ports are automatically forwarded to that environment.
The forwarder listens on `127.0.0.1` by default; set `DUST_HIVE_FORWARD_LISTEN_HOST=0.0.0.0` to expose it to your LAN.

```bash
# Manual control
dust-hive forward status    # Check current forwarding
dust-hive forward env-b     # Switch to a different environment
dust-hive forward stop      # Stop forwarding

# Skip auto-forward on warm
dust-hive warm myenv --no-forward

# Force-kill any processes blocking service ports during warm
dust-hive warm myenv --force-ports
```

When working with multiple environments, use `forward` to switch which one receives OAuth callbacks:

```bash
# env-a is warm and receiving OAuth at :3000
dust-hive forward env-b     # Switch OAuth to env-b
```

If the ports are already owned by another dust-hive forwarder, `dust-hive forward NAME` will switch it automatically.
If those ports are owned by a different process, the command will fail with details so you can stop it.

## Preconditions

### `dust-hive up` and `dust-hive sync`

These commands must be run from the **main Dust repository** (not a worktree):

1. **Not in a worktree**: Run from `~/path/to/dust` (the main clone)
2. **On main branch**: Run `git checkout main` first
3. **Clean working directory**: Commit or stash changes (untracked files OK)

If you see errors about "cannot run from worktree" or "checkout main first", these preconditions aren't met.

## Configuration settings

You can customize the behavior of `dust-hive` by editing `~/.dust-hive/settings.json`:

```json
{
  "multiplexer": "zellij",
  "branchPrefix": "tom-",
  "useGitSpice": false
}
```

* **multiplexer**: Terminal multiplexer to use (`"zellij"` or `"tmux"`, default: `"zellij"`)
* **branchPrefix**: Prefix to add to branch names (e.g., `"tom-"` creates branches like `"tom-myenv"`)
* **useGitSpice**: Use git-spice to manage stacks (requires git-spice installed and configured)

## Terminal Sessions (zellij/tmux)

> **Note**: The following describes the default zellij experience. If you set `"multiplexer": "tmux"` in settings, sessions use tmux instead (with different shortcuts).

### Main Session

When you run `dust-hive up`, a main session (`dust-hive-main`) is created with:

- **main** - Shell at the repo root
- **temporal** - Temporal server logs (runs `dust-hive temporal logs`)

Attach to it with `dust-hive up -a` or by running zellij directly: `zellij attach dust-hive-main`.

### Environment Sessions

When you run `dust-hive open`, you get a terminal with tabs:

- **shell** - Interactive shell with environment loaded
- **sdk** - SDK build logs
- **front** - Next.js logs
- **core** - Core API logs
- **oauth** - OAuth service logs
- **connectors** - Connectors logs
- **workers** - Temporal worker logs

If you want to start warming while you work in the shell, use:

```bash
dust-hive spawn myenv --warm
```

This opens zellij with an extra **warm** tab that runs `dust-hive warm myenv`.

To create the session in the background without attaching (useful for scripts or CI):

```bash
dust-hive spawn myenv --warm --no-attach
```

This creates the zellij session and starts services, but leaves you in your current terminal. Use `dust-hive open myenv` to attach later.

## Workflow Examples

### Working on a feature

```bash
# Create environment
dust-hive spawn my-feature

# Start everything
dust-hive warm my-feature

# Open terminal
dust-hive open my-feature

# ... work on your feature ...

# When done for the day
dust-hive stop my-feature
```

### Running multiple environments

```bash
# Create and warm two environments
dust-hive spawn env-a --warm
dust-hive spawn env-b --warm

# Both running simultaneously
dust-hive list
# env-a    warm    http://localhost:10000
# env-b    warm    http://localhost:11000

# Access both
open http://localhost:10000  # env-a
open http://localhost:11000  # env-b
```

### Cleaning up

```bash
# Stop and remove an environment
dust-hive destroy my-feature

# If there are uncommitted changes
dust-hive destroy my-feature --force
```

## Troubleshooting

### "Environment not found"

Check if it exists:
```bash
dust-hive list
```

### Services not starting

Check prerequisites:
```bash
dust-hive doctor
```

### Docker issues

Make sure Docker/OrbStack is running:
```bash
docker ps
```

### Zellij "Waiting to run"

Reload the session:
```bash
dust-hive reload myenv
```

### Check service health

```bash
dust-hive status myenv
```

### View logs

```bash
# Last 500 lines
dust-hive logs myenv front

# Follow logs
dust-hive logs myenv front -f
```

### Running `npm install`

To run `npm install` in a dust-hive worktree, you must first delete `node_modules`:
```bash
rm -rf node_modules && npm install
```
This is necessary because dust-hive uses a shallow copy structure (symlinks) that is incompatible with npm's expectations.

## Development

```bash
# Run directly (no build step)
bun run src/index.ts <command>

# Run all checks
bun run check

# Individual checks
bun run typecheck    # TypeScript
bun run lint         # Biome linter
bun run test         # Unit tests
```
