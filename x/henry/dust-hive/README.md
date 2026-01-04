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
# Bun (runtime)
curl -fsSL https://bun.sh/install | bash

# Zellij (terminal multiplexer)
brew install zellij

# Docker (via OrbStack or Docker Desktop)
brew install --cask orbstack

# Temporal CLI (workflow engine)
brew install temporal

# sccache (Rust compilation cache - speeds up builds across worktrees)
brew install sccache
```

Then configure cargo to use sccache by adding to `~/.cargo/config.toml`:

```toml
[build]
rustc-wrapper = "sccache"
```

## Installation

```bash
# From the dust repo
cd x/henry/dust-hive

# Build and link globally
bun install
bun run build
bun link
```

Now `dust-hive` is available globally.

## Initial Setup

1. **Create config file** with your secrets:

```bash
mkdir -p ~/.dust-hive
cp /path/to/your/.env ~/.dust-hive/config.env
```

The `config.env` must use `export` statements (e.g., `export API_KEY=xxx`). It contains all the environment variables from your local dev setup (API keys, OAuth secrets, etc.). See `local-dev-setup.md` for the full list.

2. **Start Temporal server** (keep running in a separate terminal):

```bash
temporal server start-dev
```

## Quick Start

```bash
# Create a new environment
dust-hive spawn myenv

# Start all services (docker, front, core, connectors, etc.)
dust-hive warm myenv

# Open the terminal UI
dust-hive open myenv

# Get the app URL
dust-hive url myenv
# http://localhost:10000

# Open in browser
open $(dust-hive url myenv)
```

## Commands

| Command | Description |
|---------|-------------|
| `spawn [--name NAME] [--base BRANCH] [--no-open] [--warm]` | Create new environment |
| `warm NAME [--no-forward] [--force-ports]` | Start docker + all services |
| `cool NAME` | Stop services, keep SDK watch |
| `start NAME` | Resume stopped environment |
| `stop NAME` | Full stop of all services |
| `destroy NAME [--force]` | Remove environment completely |
| `restart NAME SERVICE` | Restart a single service |
| `open NAME` | Open zellij terminal session |
| `reload NAME` | Kill and reopen zellij session |
| `list` | Show all environments |
| `status NAME` | Show service health |
| `logs NAME [SERVICE] [-f]` | View service logs |
| `url NAME` | Print front URL |
| `doctor` | Check prerequisites |
| `cache [status\|rebuild] [--status] [--rebuild]` | Show or rebuild binary cache |
| `forward [NAME\|status\|stop]` | Manage OAuth port forwarding |
| `sync [BRANCH]` | Rebase on branch (default: main), rebuild binaries, refresh deps |

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

## Zellij Session

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

### Zellij Shortcuts

- `Ctrl+o` then `d` - Detach (keeps services running)
- `Ctrl+o` then `w` - Session manager
- `Ctrl+o` then `[` - Scroll mode (arrow keys to scroll)
- `Alt+n` - Next tab
- `Alt+p` - Previous tab

## Workflow Examples

### Working on a feature

```bash
# Create environment from current branch
dust-hive spawn --name my-feature

# Start everything
dust-hive warm my-feature

# Open terminal
dust-hive open my-feature

# ... work on your feature ...

# When done for the day
dust-hive stop my-feature
```

### Running two environments

```bash
# First environment
dust-hive spawn --name env-a --base main
dust-hive warm env-a

# Second environment
dust-hive spawn --name env-b --base feature-branch
dust-hive warm env-b

# Both running simultaneously
dust-hive list
# env-a    warm    10000-10999
# env-b    warm    11000-11999

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

## Performance

dust-hive uses aggressive caching and parallelization:

| Operation | Time |
|-----------|------|
| `spawn` | ~7 seconds |
| `warm` (first) | ~80 seconds |
| `warm` (subsequent) | ~18 seconds |

First warm is slower because it initializes databases (Postgres, Qdrant, Elasticsearch). Subsequent warms are fast because services just reconnect to existing data.

### Cache System

The cache uses your main Dust repo as source:

1. **Node modules**: Symlinked from main repo (instant)
2. **Rust compilation**: sccache provides content-addressed caching across all worktrees
3. **Rust binaries**: Pre-compiled for init scripts (qdrant, elasticsearch, init_db)

> **Warning**: node_modules are symlinked, not copied. Running `npm install` in a worktree will modify the main repo's node_modules. If you need isolation, manually run: `rm -rf node_modules && npm ci`

> **sccache**: Each worktree compiles its own code, but sccache caches compilation results by content hash. This means unchanged dependencies compile instantly, even across different worktrees with different code.

```bash
# Check cache status
dust-hive cache

# Build missing binaries
dust-hive cache --rebuild

# Update main repo with latest and refresh everything
dust-hive sync
```

## File Locations

```
~/.dust-hive/
├── config.env                 # Your secrets (create this)
├── forward.pid                # Forwarder process ID
├── forward.log                # Forwarder logs
├── forward.json               # Forwarder state (target env)
├── cache/
│   └── source.path            # Path to cache source repo
├── envs/
│   └── NAME/
│       ├── env.sh             # Port overrides
│       ├── ports.json         # Port allocation
│       ├── metadata.json      # Environment info
│       ├── *.pid              # Process IDs
│       └── *.log              # Service logs
└── zellij/
    └── layout.kdl             # Zellij layout

~/dust-hive/
└── NAME/                      # Git worktree
```

## Development

```bash
# Run in dev mode
bun run src/index.ts <command>

# Run all checks
bun run check

# Individual checks
bun run typecheck    # TypeScript
bun run lint         # Biome linter
bun run test         # Unit tests

# Build
bun run build
```
