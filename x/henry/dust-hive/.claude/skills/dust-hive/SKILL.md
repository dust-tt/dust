---
name: dust-hive
description: Information about dust-hive, a CLI tool for running multiple isolated Dust development environments. Use this when working in a dust-hive environment, checking environment status, or running Dust app commands.
---

# dust-hive

## What is dust-hive?

dust-hive is a CLI tool for running multiple isolated Dust development environments simultaneously. Each environment gets its own:
- Git worktree (separate branch)
- Port range (no conflicts between environments)
- Docker containers (isolated volumes)
- Database instances (Postgres, Qdrant, Elasticsearch)

## Code Location

The dust-hive source code is located at `x/henry/dust-hive/` in the Dust monorepo:

```
x/henry/dust-hive/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── forward-daemon.ts  # TCP forwarder daemon
│   ├── commands/          # Command implementations
│   └── lib/               # Shared utilities
├── tests/                 # Unit tests
├── package.json
└── CLAUDE.md              # Development context
```

## Detecting a dust-hive Environment

To check if you're currently running in a dust-hive environment:

1. **Check working directory**: dust-hive worktrees are located at `~/dust-hive/{env-name}/`
2. **Check for worktree**: The `.git` file (not directory) indicates a git worktree
3. **Run status command**: `dust-hive status` shows environment info if you're in one

Programmatically detect the current environment:
```bash
# From the dust-hive CLI
dust-hive status

# Check if in worktree path
pwd | grep -q "$HOME/dust-hive/" && echo "In dust-hive environment"
```

The `detectEnvFromCwd()` function in `src/lib/paths.ts` detects the environment name from the current working directory.

## Environment States

| State | Description | What's Running |
|-------|-------------|----------------|
| **stopped** | Nothing running | - |
| **cold** | Minimal state | SDK watch only |
| **warm** | Full development | All services (front, core, oauth, connectors, workers) + Docker |

## Checking Environment Status

```bash
# Show full status (services, docker, health checks)
dust-hive status [ENV_NAME]

# List all environments with states
dust-hive list

# Check if temporal server is running
dust-hive temporal status

# Check port forwarding status
dust-hive forward status
```

## Common Commands

### Managed Services (Global)
| Command | Description |
|---------|-------------|
| `dust-hive up [-a]` | Start temporal + sync + main session |
| `dust-hive down [-f]` | Stop everything (all envs, temporal, sessions) |
| `dust-hive temporal start/stop/status` | Control temporal server |

### Environment Lifecycle
| Command | Description |
|---------|-------------|
| `dust-hive spawn [--name NAME]` | Create new environment |
| `dust-hive warm [NAME]` | Start docker + all services |
| `dust-hive cool [NAME]` | Stop services, keep SDK |
| `dust-hive start [NAME]` | Resume stopped environment |
| `dust-hive stop [NAME]` | Full stop of environment |
| `dust-hive destroy NAME` | Remove environment completely |

### Development
| Command | Description |
|---------|-------------|
| `dust-hive open [NAME]` | Open zellij terminal session |
| `dust-hive logs [NAME] [SERVICE]` | View service logs |
| `dust-hive restart [NAME] SERVICE` | Restart a single service |
| `dust-hive url [NAME]` | Print the front URL |
| `dust-hive forward [NAME\|status\|stop]` | Manage OAuth port forwarding |

## Port Allocation

Each environment gets a 1000-port range starting at 10000:
- 1st env: 10000-10999 (front:10000, core:10001, connectors:10002, oauth:10006)
- 2nd env: 11000-11999
- 3rd env: 12000-12999

## Running Linters, Type Checks, and Builds

### For dust-hive itself (in `x/henry/dust-hive/`):
```bash
# Run ALL checks before committing (MANDATORY)
bun run check

# Individual checks
bun run typecheck    # TypeScript strict checks
bun run lint         # Biome linting
bun run lint:fix     # Auto-fix lint issues
bun run format       # Code formatting
bun run test         # All tests
```

### For Dust apps (in worktree or main repo):
```bash
# TypeScript SDK
cd types && npm run build

# Front (Next.js)
cd front && npm run lint && npm run build

# Core (Rust)
cd core && cargo check && cargo clippy

# Connectors
cd connectors && npm run lint && npm run build

# OAuth (Rust)
cd oauth && cargo check && cargo clippy
```

### Quick health check after warming:
```bash
curl -sf http://localhost:10000/api/healthz  # front
curl -sf http://localhost:10001/             # core
```

## Services in Each Environment

| Service | Description | Port Offset |
|---------|-------------|-------------|
| sdk | TypeScript SDK watcher | - |
| front | Next.js frontend | +0 |
| core | Rust core API | +1 |
| connectors | TypeScript connectors | +2 |
| oauth | Rust OAuth service | +6 |
| front-workers | Temporal workers | - |

## File Locations

```
~/.dust-hive/
├── config.env           # Your secrets
├── temporal.pid/log     # Temporal server
├── forward.pid/log/json # Port forwarder
├── envs/{NAME}/         # Per-environment state
│   ├── metadata.json    # Environment info
│   ├── ports.json       # Port allocation
│   ├── env.sh           # Port overrides
│   └── *.pid/*.log      # Service processes/logs
└── zellij/              # Zellij layouts

~/dust-hive/{NAME}/      # Git worktrees
```

## Troubleshooting

```bash
# Check prerequisites
dust-hive doctor

# Reload zellij session if stuck
dust-hive reload [NAME]

# View specific service logs
dust-hive logs [NAME] front -f

# Check binary cache status
dust-hive cache

# Sync with main (pull, rebuild binaries, refresh deps)
dust-hive sync
```
