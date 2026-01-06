# dust-hive Development Context

Follow all rules in **CODING_RULES.md** before making changes.

## Development Workflow

**CRITICAL**: Always run `bun run check` before committing. This runs typecheck, lint, and tests. Never commit code that fails these checks.

```bash
# Before committing - run ALL checks (MANDATORY)
bun run check

# Individual checks
bun run typecheck    # TypeScript strict checks
bun run lint         # Biome linting
bun run lint:fix     # Auto-fix lint issues
bun run format       # Code formatting
bun run test         # All tests
```

**Always fix lint/type errors immediately** - don't accumulate them.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Linting/Formatting**: Biome (strict rules)
- **Testing**: Bun test
- **Terminal UI**: Zellij (viewer only)
- **Process Management**: CLI-managed daemons with PID files
- **Infrastructure**: Docker Compose

## Code Style

- Use Bun APIs where possible (`Bun.spawn`, `Bun.file`, etc.)
- Async/await throughout
- Early returns for error conditions
- Minimal dependencies - prefer standard library
- No `any` types - use proper type definitions
- No non-null assertions (`!`) - handle nullability properly
- Use `const` over `let` where possible
- Use import type for type-only imports

## Project Structure

```
src/
├── index.ts           # CLI entry point
├── forward-daemon.ts  # TCP forwarder daemon (ports 3000,3001,3002,3006 → env)
├── commands/          # Command implementations (all MVP commands complete)
│   ├── cache.ts       # Cache management (show cache status)
│   ├── cool.ts        # Stop services, keep SDK
│   ├── destroy.ts     # Remove environment
│   ├── doctor.ts      # Prerequisite checking
│   ├── forward.ts     # OAuth port forwarding management
│   ├── list.ts        # List environments
│   ├── logs.ts        # View service logs
│   ├── open.ts        # Attach to zellij session (env + main)
│   ├── reload.ts      # Kill and reopen zellij session
│   ├── restart.ts     # Restart a single service
│   ├── seed-config.ts # Extract user data from existing DB
│   ├── spawn.ts       # Create environment
│   ├── start.ts       # Start managed services or resume env
│   ├── status.ts      # Show service health
│   ├── stop.ts        # Stop all services or specific env
│   ├── sync.ts        # Pull main, rebuild binaries, refresh deps
│   ├── temporal.ts    # Temporal server subcommands
│   ├── url.ts         # Print front URL
│   └── warm.ts        # Start docker + all services
└── lib/               # Shared utilities
    ├── activity.ts    # Last-active environment tracking
    ├── cache.ts       # Binary caching for fast init
    ├── commands.ts    # Command helpers (requireEnvironment)
    ├── config.ts      # Configuration management
    ├── docker.ts      # Docker compose + start/stop operations
    ├── environment.ts # Environment CRUD
    ├── env-utils.ts   # Environment variable loading
    ├── envgen.ts      # env.sh generation
    ├── errors.ts      # Shared error utilities
    ├── forwarderConfig.ts # Forwarder port mappings
    ├── fs.ts          # Filesystem helpers
    ├── forward.ts     # TCP forwarder management
    ├── init.ts        # Database initialization with binary caching
    ├── logger.ts      # Console output utilities
    ├── paths.ts       # Path constants and helpers
    ├── ports.ts       # Port allocation
    ├── process.ts     # Daemon management (PID files, spawn/kill)
    ├── prompt.ts      # Interactive prompts
    ├── registry.ts    # Service registry (config, health checks)
    ├── result.ts      # Result<T,E> type for error handling
    ├── seed.ts        # SQL-based database seeding
    ├── services.ts    # Service names and types
    ├── setup.ts       # Dependency installation
    ├── shell.ts       # Shell command builder
    ├── state.ts       # State detection (stopped/cold/warm)
    ├── temporal.ts    # Temporal namespace config (per-env)
    ├── temporal-server.ts # Temporal server management (global daemon)
    └── worktree.ts    # Git worktree operations

tests/
└── lib/               # Unit tests for lib modules
    ├── docker.test.ts
    ├── environment.test.ts
    ├── envgen.test.ts
    ├── init.test.ts
    ├── paths.test.ts
    ├── ports.test.ts
    ├── registry.test.ts
    ├── result.test.ts
    ├── services.test.ts
    ├── shell.test.ts
    └── state.test.ts
```

## Testing Guidelines

- Write tests for all library functions
- Use descriptive test names
- Test error conditions, not just happy paths
- Keep tests focused and fast

## Key Architecture Decisions

1. **No mprocs** - All services run as background daemons managed by the CLI
2. **Zellij is passive** - Only shows logs via `tail -F`, closing it doesn't stop services
3. **Port isolation** - Base port 10000, +1000 per environment
4. **Git worktrees** - Each env gets a new branch: `NAME-workspace`
5. **Managed Temporal** - `dust-hive start` runs Temporal as a daemon, namespaces created per env

## Commands Reference

### Managed Services (global)

| Command | Description |
|---------|-------------|
| `start [-a]` | Start temporal + sync + create main session (from main repo, requires clean main branch) |
| `stop [-f]` | Stop all envs, temporal, and zellij sessions (requires confirmation or --force) |
| `temporal start/stop/restart/status` | Direct temporal server control |

### Environment Commands

| Command | Description |
|---------|-------------|
| `spawn` | Create environment (worktree + symlinks + SDK watch); supports --warm, --no-attach, --wait |
| `warm` | Start docker + all services (auto-forwards port 3000, supports --no-forward/--force-ports) |
| `cool` | Stop services, keep SDK watch |
| `start [NAME]` | Resume stopped env (when NAME provided or in worktree) |
| `stop [NAME]` | Full stop of env (when NAME provided or in worktree) |
| `destroy` | Remove environment |
| `open` | Attach to zellij session |
| `reload` | Kill and reopen zellij session |
| `restart` | Restart a single service |
| `list` | Show all environments |
| `status` | Show service health |
| `logs` | View service logs |
| `url` | Print front URL |
| `doctor` | Check prerequisites |
| `cache` | Show binary cache status |
| `forward` | Manage OAuth port forwarding (ports 3000,3001,3002,3006 → env) |
| `sync` | Pull latest main, rebuild binaries, refresh deps |
| `seed-config` | Extract user data from existing DB for seeding new environments |

## Performance

Typical timings (with aggressive parallelization):
- **spawn**: ~7 seconds (symlinks node_modules and cargo target from main repo)
- **warm (first)**: ~80 seconds (parallel DB init: Postgres, Qdrant, Elasticsearch)
- **warm (subsequent)**: ~18 seconds (all services start in parallel)

### Parallelization

First warm runs everything in parallel:
- Docker containers start (no blocking wait)
- core + oauth start immediately (compile while init runs)
- Temporal namespaces, Postgres init, Qdrant init, ES init run concurrently
- Each init waits only for its own container

### Cache System

dust-hive uses the main Dust repo as a cache source for:
1. **Node modules**: Symlinked from main repo (instant, but shared - see warning below)
2. **Cargo target**: Symlinked from main repo (shared compilation + linking cache)
3. **Rust binaries**: Pre-compiled for init scripts (qdrant, elasticsearch, init_db)

**WARNING**: node_modules are symlinked, not copied. Running `npm install` in a worktree
will modify the main repo's node_modules. If you need isolation, manually run:
`rm -rf node_modules && npm ci`

**sccache** (optional): When worktree code differs from main, cargo recompiles. sccache
caches compilations by content hash, making rebuilds after branch switches faster.

Check cache status:
```bash
dust-hive cache            # Show what's cached
dust-hive sync             # Pull main, rebuild binaries, refresh deps
```

## Testing the CLI

```bash
# Quick health check after warm
curl -sf http://localhost:10000/api/healthz  # front
curl -sf http://localhost:10001/             # core

# Run from project root
bun run src/index.ts <command>
```
