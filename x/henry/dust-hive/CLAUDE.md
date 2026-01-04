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
├── commands/          # Command implementations (all MVP commands complete)
│   ├── cool.ts        # Stop services, keep SDK
│   ├── destroy.ts     # Remove environment
│   ├── doctor.ts      # Prerequisite checking
│   ├── list.ts        # List environments
│   ├── logs.ts        # View service logs
│   ├── open.ts        # Attach to zellij session
│   ├── reload.ts      # Kill and reopen zellij session
│   ├── spawn.ts       # Create environment
│   ├── start.ts       # Resume stopped env
│   ├── status.ts      # Show service health
│   ├── stop.ts        # Full stop
│   ├── url.ts         # Print front URL
│   └── warm.ts        # Start docker + all services
└── lib/               # Shared utilities
    ├── commands.ts    # Command helpers (requireEnvironment)
    ├── config.ts      # Configuration management
    ├── docker.ts      # Docker compose + start/stop operations
    ├── environment.ts # Environment CRUD
    ├── envgen.ts      # env.sh generation
    ├── init.ts        # Database initialization (data-driven)
    ├── logger.ts      # Console output utilities
    ├── paths.ts       # Path constants and helpers
    ├── ports.ts       # Port allocation
    ├── process.ts     # Daemon management (PID files, spawn/kill)
    ├── services.ts    # Service names and types
    ├── shell.ts       # Shell command builder
    └── state.ts       # State detection (stopped/cold/warm)

tests/
├── lib/               # Unit tests for lib/
│   ├── docker.test.ts
│   ├── environment.test.ts
│   └── ports.test.ts
└── commands/          # Integration tests for commands
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
| `spawn` | Create environment (worktree + npm ci + SDK watch) |
| `warm` | Start docker + all services |
| `cool` | Stop services, keep SDK watch |
| `start` | Resume stopped env |
| `stop` | Full stop |
| `destroy` | Remove environment |
| `open` | Attach to zellij session |
| `reload` | Kill and reopen zellij session |
| `list` | Show all environments |
| `status` | Show service health |
| `logs` | View service logs |
| `url` | Print front URL |
| `doctor` | Check prerequisites |

## Testing the CLI

```bash
# Quick health check after warm
curl -sf http://localhost:10000/api/healthz  # front
curl -sf http://localhost:10001/             # core

# Run from project root
bun run src/index.ts <command>
```
