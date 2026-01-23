---
name: dust-hive
description: Information about dust-hive, a CLI tool for running multiple isolated Dust development environments. ALWAYS enable this skill when the working directory is under ~/dust-hive/. Use for understanding port allocation, running tests, and working with the environment.
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

1. **Check working directory**: dust-hive worktrees are located at `~/dust-hive/{env-name}/`
2. **Check for worktree**: The `.git` file (not directory) indicates a git worktree

```bash
# Check if in worktree path
pwd | grep -q "$HOME/dust-hive/" && echo "In dust-hive environment"
```

## Environment States

Environments can be in one of three states:

| State | What's Running | Can Run Tests? |
|-------|----------------|----------------|
| **stopped** | Nothing | No |
| **cold** | SDK watch only | Yes (front tests use shared test DB) |
| **warm** | All services (front, core, connectors, oauth, workers) + Docker | Yes |

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

The `front` project requires a Postgres database and Redis to run tests. dust-hive provides **shared test containers** that allow running front tests without warming up the full environment.

### How it works

- A shared Postgres container runs on port **5433** (started by `dust-hive up`)
- A shared Redis container runs on port **6479** (started by `dust-hive up`)
- Each environment gets its own test database: `dust_front_test_{env_name}`
- `TEST_FRONT_DATABASE_URI` and `TEST_REDIS_URI` are already set in each environment's `env.sh`

### Running front tests

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

### Troubleshooting front tests

If front tests fail with database connection errors:
1. Check if test postgres is running: `docker ps | grep dust-hive-test-postgres`
2. If not running, start it: `docker start dust-hive-test-postgres`
3. Verify the database exists: `docker exec dust-hive-test-postgres psql -U test -l`

## Known Issues

### Node modules structure

In dust-hive environments, `node_modules` for `front` and `connectors` uses a **shallow copy** structure:
- A real `node_modules` directory with symlinks to packages from the main repo
- `@dust-tt/client` is overridden to point to the worktree's SDK (ensuring correct type resolution)

**Running `npm install` requires manual cleanup**:
```bash
rm -rf node_modules && npm install
```

### SDK watcher doesn't detect changes after git rebase

The SDK watcher uses nodemon which relies on filesystem events. When running `git rebase`, `git pull`, or `git checkout`, nodemon may not detect file changes.

**Symptoms**: Type errors in front about missing types that should exist in the SDK.

**Solution**: Restart the SDK watcher after git operations that change SDK files:
```bash
dust-hive restart [ENV_NAME] sdk
```

Or manually trigger a rebuild:
```bash
touch sdks/js/src/types.ts
```
