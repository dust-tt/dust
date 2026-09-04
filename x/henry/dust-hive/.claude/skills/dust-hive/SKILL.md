---
name: dust-hive
description: Information about dust-hive, a CLI tool for running multiple isolated Dust development environments. ALWAYS enable this skill when the working directory is in a registered dust-hive worktree. Use for understanding port allocation, running tests, and working with the environment.
---

# dust-hive

## What is dust-hive?

dust-hive is a CLI tool for running multiple isolated Dust development environments simultaneously. Each environment gets its own:
- Git worktree (separate branch)
- Port range (no conflicts between environments)
- Docker containers (isolated volumes)
- Database instances (Postgres, Qdrant, Elasticsearch)

## Detecting a dust-hive Environment

To check if you're currently running in a dust-hive environment:

1. **Check registered environments**: run `dust-hive list`
2. **Check the current environment**: Hive-owned worktrees normally live at
   `<repo>/.hives/{env-name}/`; adopted worktrees can live elsewhere under the main repository
   root, and older environments may still use `~/dust-hive/{env-name}/`

```bash
dust-hive status [ENV_NAME]
```

## Environment States

Environments can be in one of three states:

| State | What's Running | Can Run Tests? |
|-------|----------------|----------------|
| **stopped** | Nothing | No |
| **cold** | SDK and Sparkle watches | Yes (front tests use shared test DB) |
| **warm** | SDK/Sparkle, application services except Viz/Storybook, and Docker | Yes |

Check the current state:
```bash
dust-hive status [ENV_NAME]
```

## Environment Variables (direnv)

Each dust-hive worktree contains a `.envrc` file that automatically loads environment variables when you `cd` into the directory. This is powered by [direnv](https://direnv.net/).

**What this means:**
- Environment variables (ports, database URIs, API keys, etc.) are automatically available
- Variables like `FRONT_DATABASE_URI`, `CORE_API`, `CONNECTORS_API` are pre-configured for the environment's port range

**If environment variables are missing**, manually source the environment:
```bash
source ~/.dust-hive/envs/{ENV_NAME}/env.sh
```

## Port Allocation

Each environment gets a 1000-port range starting at 10000:
- 1st env: 10000-10999 (proxy:10000, core:10001, connectors:10002, front-api:10003, oauth:10006)
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

# Front library and services
npm -w front run tsgo -- --noEmit
npm -w front-api run tsgo -- --noEmit
npm -w front-spa run tsgo -- --noEmit

# Core and OAuth (Rust)
cd core && cargo check && cargo clippy

# Connectors
npm -w connectors run build  # Type-check + build
```

### Quick health check after warming:
```bash
curl -sf http://localhost:10000/api/healthz  # front API through proxy
curl -sf http://localhost:10001/             # core
```

## Running Front Tests in Cold Environments

The `front` project requires a Postgres database and Redis to run tests. dust-hive provides **shared test containers** that allow running front tests without warming up the full environment.

### How it works

- A shared Postgres container runs on port **5433** (started by `dust-hive up`)
- A shared Redis container runs on port **6479** (started by `dust-hive up`)
- Each environment gets its own test database: `dust_front_test_{env_name}`
- `TEST_FRONT_DATABASE_URI` and `TEST_REDIS_URI` are already set in each environment's `env.sh`

### Running front tests

```bash
# From any cold environment, run front tests directly
cd front && npm run test

# Run specific test file
cd front && npm run test -- lib/resources/user_resource.test.ts

# Run with verbose output
cd front && npm run test -- --reporter verbose path/to/test.test.ts
```

**No need to warm the environment** - `dust-hive up` starts the shared test Postgres and Redis.

### Troubleshooting front tests

If front tests fail with database connection errors:
1. Check if test postgres is running: `docker ps | grep dust-hive-test-postgres`
2. If not running, start the shared services: `dust-hive up`
3. Verify the database exists: `docker exec dust-hive-test-postgres psql -U test -l`

## Known Issues

### Node modules structure

In dust-hive environments, dependencies are shared with the main repo:
- Root packages resolve from the main repo's `node_modules`
- Workspace-level `node_modules` use shallow copies when needed
- `@dust-tt` packages point to the current worktree

Do not run `npm install` directly in a Hive worktree:
```bash
# From a clean main repository
dust-hive sync
dust-hive refresh [ENV_NAME]
```

### SDK watcher doesn't detect changes after git rebase

The SDK watcher relies on filesystem events. When running `git rebase`, `git pull`, or `git checkout`, it may not detect file changes.

**Symptoms**: Type errors in front about missing types that should exist in the SDK.

**Solution**: Restart the SDK watcher after git operations that change SDK files:
```bash
dust-hive restart [ENV_NAME] sdk
```

Or manually trigger a rebuild:
```bash
touch sdks/js/src/types.ts
```
