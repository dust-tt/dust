# dust-hive Development Context

## Specification

The full MVP specification is in **SPEC.md**. Always consult it for architecture decisions, port allocations, service startup order, and implementation details.

## Development Workflow

**IMPORTANT**: Run these commands frequently during development:

```bash
# Before committing - run ALL checks
bun run check

# Individual checks
bun run typecheck    # TypeScript strict checks
bun run lint         # Biome linting
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
│   ├── cache.ts       # Cache management (show/rebuild binaries)
│   ├── cool.ts        # Stop services, keep SDK
│   ├── destroy.ts     # Remove environment
│   ├── doctor.ts      # Prerequisite checking
│   ├── forward.ts     # OAuth port forwarding management
│   ├── list.ts        # List environments
│   ├── logs.ts        # View service logs
│   ├── open.ts        # Attach to zellij session
│   ├── reload.ts      # Kill and reopen zellij session
│   ├── restart.ts     # Restart a single service
│   ├── spawn.ts       # Create environment
│   ├── start.ts       # Resume stopped env
│   ├── status.ts      # Show service health
│   ├── stop.ts        # Full stop
│   ├── url.ts         # Print front URL
│   └── warm.ts        # Start docker + all services
└── lib/               # Shared utilities
    ├── cache.ts       # Binary caching for fast init
    ├── commands.ts    # Command helpers (requireEnvironment)
    ├── config.ts      # Configuration management
    ├── docker.ts      # Docker compose + start/stop operations
    ├── environment.ts # Environment CRUD
    ├── envgen.ts      # env.sh generation
    ├── forwarderConfig.ts # Forwarder port mappings
    ├── fs.ts          # Filesystem helpers
    ├── forward.ts     # TCP forwarder management
    ├── init.ts        # Database initialization with binary caching
    ├── logger.ts      # Console output utilities
    ├── paths.ts       # Path constants and helpers
    ├── ports.ts       # Port allocation
    ├── process.ts     # Daemon management (PID files, spawn/kill)
    ├── registry.ts    # Service registry (config, health checks)
    ├── result.ts      # Result<T,E> type for error handling
    ├── services.ts    # Service names and types
    ├── setup.ts       # Dependency installation
    ├── shell.ts       # Shell command builder
    ├── state.ts       # State detection (stopped/cold/warm)
    ├── temporal.ts    # Temporal namespace config
    └── worktree.ts    # Git worktree operations

tests/
└── lib/               # Unit tests for lib modules (156 tests)
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
5. **Shared Temporal** - User runs `temporal server start-dev`, we create namespaces per env

## Commands Reference

| Command | Description |
|---------|-------------|
| `spawn` | Create environment (worktree + symlinks + SDK watch); supports --warm to open a warm tab |
| `warm` | Start docker + all services (auto-forwards port 3000, supports --no-forward/--force-ports) |
| `cool` | Stop services, keep SDK watch |
| `start` | Resume stopped env |
| `stop` | Full stop |
| `destroy` | Remove environment |
| `open` | Attach to zellij session |
| `reload` | Kill and reopen zellij session |
| `restart` | Restart a single service |
| `list` | Show all environments |
| `status` | Show service health |
| `logs` | View service logs |
| `url` | Print front URL |
| `doctor` | Check prerequisites |
| `cache` | Show or rebuild binary cache |
| `forward` | Manage OAuth port forwarding (ports 3000,3001,3002,3006 → env) |

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
1. **Node modules**: Symlinked from main repo (no npm install needed)
2. **Cargo target**: Symlinked to share Rust compilation cache (incremental builds)
3. **Rust binaries**: Pre-compiled for init scripts (qdrant, elasticsearch, init_db)

Check cache status:
```bash
dust-hive cache            # Show what's cached
dust-hive cache status     # Explicit status
dust-hive cache --rebuild  # Build missing binaries
dust-hive cache rebuild    # Alias for rebuild
```

## Testing the CLI

```bash
# Quick health check after warm
curl -sf http://localhost:10000/api/healthz  # front
curl -sf http://localhost:10001/             # core

# Run from project root
bun run src/index.ts <command>
```
