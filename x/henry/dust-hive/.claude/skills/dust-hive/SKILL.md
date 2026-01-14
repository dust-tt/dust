---
name: dust-hive
description: Information about dust-hive, a CLI tool for running multiple isolated Dust development environments. ALWAYS enable this skill when the working directory is under ~/dust-hive/. Use for environment status, Dust app commands, and understanding port allocation.
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

## Automatic Environment Loading (direnv)

Each dust-hive worktree contains a `.envrc` file that automatically loads the environment variables when you `cd` into the directory. This is powered by [direnv](https://direnv.net/).

**What this means:**
- Environment variables (ports, database URIs, API keys, etc.) are automatically available in your shell
- No need to manually source `env.sh` or set environment variables
- Variables like `FRONT_DATABASE_URI`, `CORE_API`, `CONNECTORS_API` are pre-configured for the environment's port range

**Troubleshooting:** If you encounter errors about missing environment variables, the user may not have direnv configured. In that case, manually source the environment:
```bash
source ~/.dust-hive/envs/{ENV_NAME}/env.sh
```

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
| `dust-hive up [-a]` | Start temporal + test postgres + test redis + sync + main session |
| `dust-hive down [-f]` | Stop everything (all envs, temporal, test postgres, test redis, sessions) |
| `dust-hive temporal start/stop/status` | Control temporal server |

### Environment Lifecycle
| Command | Description |
|---------|-------------|
| `dust-hive spawn [--name NAME]` | Create new environment |
| `dust-hive warm [NAME]` | Start docker + all services |
| `dust-hive cool [NAME]` | Pause services + docker, keep SDK (fast restart) |
| `dust-hive start [NAME]` | Resume stopped environment |
| `dust-hive stop [NAME]` | Full stop + remove docker containers |
| `dust-hive destroy NAME` | Remove environment completely |

> **cool vs stop**: `cool` pauses Docker containers (faster re-warm), `stop` removes them (clean slate).

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
# TypeScript SDK (watch is running - check logs if issues after SDK changes)
dust-hive logs [ENV_NAME] sdk

# Front (Next.js)
cd front && npm run lint                                              # ESLint
cd front && NODE_OPTIONS="--max-old-space-size=8192" npx tsgo --noEmit  # Type-check
cd front && npm run build                                             # Build

# Core (Rust)
cd core && cargo check && cargo clippy

# Connectors
cd connectors && npm run lint   # ESLint
cd connectors && npm run build  # Type-check + build

# OAuth (Rust)
cd oauth && cargo check && cargo clippy
```

### Quick health check after warming:
```bash
curl -sf http://localhost:10000/api/healthz  # front
curl -sf http://localhost:10001/             # core
```

## Running Front Tests in Cold Environments

The `front` project requires a Postgres database and Redis to run tests. dust-hive provides **shared test containers** that allow running front tests without warming up the full environment. This is useful for any agent making changes to front that needs to verify tests pass.

### How it works

- A shared Postgres container runs on port **5433** (started by `dust-hive up`)
- A shared Redis container runs on port **6479** (started by `dust-hive up`)
- Each environment gets its own test database: `dust_front_test_{env_name}`
- `TEST_FRONT_DATABASE_URI` and `TEST_REDIS_URI` are already set in each environment's `env.sh`

### Running front tests in a cold environment

**IMPORTANT**: You must set `NODE_ENV=test` when running front tests.

```bash
# From any cold environment, run front tests directly
cd front && NODE_ENV=test npm test

# Run specific test file
cd front && NODE_ENV=test npm test lib/resources/user_resource.test.ts

# Run with verbose output
cd front && NODE_ENV=test npm test --reporter verbose path/to/test.test.ts
```

**No need to warm the environment** - the shared test Postgres and Redis are always available.

### Test infrastructure lifecycle

| Action | Test Postgres | Test Redis |
|--------|---------------|------------|
| `dust-hive spawn` | Database created (`dust_front_test_{env_name}`) | N/A (shared) |
| `dust-hive destroy` | Database dropped | N/A (shared) |
| `dust-hive up` | Container started (port 5433) | Container started (port 6479) |
| `dust-hive down` | Container stopped | Container stopped |

### Troubleshooting front tests

If front tests fail with database connection errors:
1. Check if test postgres is running: `docker ps | grep dust-hive-test-postgres`
2. If not running, start it: `docker start dust-hive-test-postgres`
3. Verify the database exists: `docker exec dust-hive-test-postgres psql -U test -l`

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
└── .envrc               # direnv config (sources env.sh automatically)
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

## Known Issues

### Node modules structure in dust-hive environments

In dust-hive environments, `node_modules` for `front` and `connectors` uses a **shallow copy** structure:
- A real `node_modules` directory with symlinks to packages from the main repo
- `@dust-tt/client` is overridden to point to the worktree's SDK (ensuring correct type resolution)

**Running `npm install` works automatically**: dust-hive injects a `preinstall` script into package.json and creates a `.dust-hive-shallow-copy` marker file. When npm runs, the preinstall detects the marker and cleans up the shallow copy before proceeding. After install, you'll have a standard npm-managed node_modules.

### SDK watcher doesn't detect changes after git rebase

The SDK watcher uses nodemon which relies on filesystem events. When running `git rebase`, `git pull`, or `git checkout`, nodemon may not detect the file changes due to how git updates files (fsevents on macOS can miss rapid file operations).

**Symptoms**: Type errors in front about missing types that should exist in the SDK (e.g., new enum values, new fields).

**Solution**: Restart the SDK watcher after git operations that change SDK files:
```bash
dust-hive restart [ENV_NAME] sdk
```

Alternatively, manually trigger a rebuild by touching the SDK source:
```bash
touch sdks/js/src/types.ts
```
