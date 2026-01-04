# dust-hive MVP Specification v6

## Overview

CLI tool for isolated Dust development environments. Built with Bun + TypeScript.

---

## Commands (MVP)

| Command | Description |
|---------|-------------|
| `spawn [--name NAME] [--base BRANCH] [--no-open]` | Create env, prompt for name if missing, open zellij |
| `open NAME` | Attach to environment's zellij session |
| `warm NAME` | Start docker + services (background, shows progress) |
| `cool NAME` | Stop services, keep SDK watch |
| `start NAME` | Resume stopped env (start SDK watch) |
| `stop NAME` | Full stop (SDK watch + services if warm) |
| `destroy NAME [--force]` | Remove env (--force required if uncommitted changes) |
| `list` | Show all environments with state |
| `status NAME` | Show health of all services |
| `doctor` | Check prerequisites, Temporal search attrs, prompt to install missing tools |

---

## Architecture

### Process Management

**All processes are CLI-managed daemons** (no mprocs):
- SDK watch: daemon with log to `~/.dust-hive/envs/NAME/sdk.log`
- Docker: `docker-compose -f $REPO_ROOT/tools/docker-compose.dust-hive.yml -f docker-compose.override.yml -p dust-hive-NAME up -d`
- App services: each runs as daemon with log file (front.log, core.log, etc.)

**Path resolution:** CLI detects repo root (via `.git`) and uses absolute paths for docker-compose files.

**Logs:**
- Preserve ANSI colors via `FORCE_COLOR=1` env var
- Rotation: truncate when > 100MB

**Zellij is a viewer only:**
- Shell tab: interactive shell with `source env.sh`
- Per-service tabs: `tail -F service.log`
- Closing zellij does NOT stop services

### Service Startup (Direct Launch, No mprocs)

dust-hive directly launches each service with correct port env vars and FORCE_COLOR=1:

```bash
# === Phase 1: SDK watch (started first) ===
source ~/.nvm/nvm.sh && nvm use
cd ~/dust-hive/NAME/sdks/js
FORCE_COLOR=1 npm run watch > ~/.dust-hive/envs/NAME/sdk.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/sdk.pid

# Wait for SDK build before starting app services
while [ ! -f ~/dust-hive/NAME/sdks/js/dist/client.esm.js ]; do sleep 1; done

# === Phase 2: Core services (can start in parallel) ===
source ~/.dust-hive/envs/NAME/env.sh

# Front (uses PORT env var)
cd ~/dust-hive/NAME/front
FORCE_COLOR=1 npm run dev > ~/.dust-hive/envs/NAME/front.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/front.pid

# Core (uses CORE_PORT env var - requires code change)
cd ~/dust-hive/NAME/core
FORCE_COLOR=1 cargo run --bin core-api > ~/.dust-hive/envs/NAME/core.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/core.pid

# OAuth (uses OAUTH_PORT env var - requires code change)
cd ~/dust-hive/NAME/core
FORCE_COLOR=1 cargo run --bin oauth > ~/.dust-hive/envs/NAME/oauth.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/oauth.pid

# Connectors (requires -p flag + TEMPORAL_NAMESPACE override)
cd ~/dust-hive/NAME/connectors
TEMPORAL_NAMESPACE=dust-hive-NAME-connectors FORCE_COLOR=1 npx tsx src/start.ts -p $CONNECTORS_PORT > ~/.dust-hive/envs/NAME/connectors.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/connectors.pid

# === Phase 3: Workers (wait for front to be ready) ===
until curl -sf http://localhost:$PORT/api/healthz > /dev/null; do sleep 1; done

# Front workers
cd ~/dust-hive/NAME/front
FORCE_COLOR=1 ./admin/dev_worker.sh > ~/.dust-hive/envs/NAME/front-workers.log 2>&1 &
echo $! > ~/.dust-hive/envs/NAME/front-workers.pid
```

### Warm Services (MVP)

| Service | Required | Notes |
|---------|----------|-------|
| postgres | yes | Docker |
| redis | yes | Docker |
| qdrant_primary | yes | Docker (clustered) |
| qdrant_secondary | yes | Docker (clustered) |
| elasticsearch | yes | Docker |
| apache-tika | yes | Docker (file extraction) |
| core | yes | Rust binary (needs CORE_PORT support) |
| oauth | yes | Rust binary (needs OAUTH_PORT support) |
| front | yes | Next.js (uses PORT env var) |
| connectors | yes | TypeScript (uses -p flag) |
| front-workers | yes | Temporal worker (waits for front) |

**Not in MVP:** sqlite-worker (optional, can start manually if needed)

### State Detection

State derived from running processes:

| State | SDK watch | Docker | App services |
|-------|-----------|--------|--------------|
| cold | yes | no | no |
| warm | yes | yes | yes |
| stopped | no | no | no |

**Inconsistent states**: Show warning inline in `list`:
```
NAME           STATE     PORTS       BRANCH
auth-feature   warm ⚠️    10000-10099 auth-feature-workspace
               (SDK not running)
```

### Port Allocation

Base ports start at **10000**, incrementing by 1000.

| Service | Offset | env-1 | env-2 |
|---------|--------|-------|-------|
| front | +0 | 10000 | 11000 |
| core | +1 | 10001 | 11001 |
| connectors | +2 | 10002 | 11002 |
| oauth | +6 | 10006 | 11006 |
| postgres | +432 | 10432 | 11432 |
| redis | +379 | 10379 | 11379 |
| qdrant (HTTP) | +334 | 10334 | 11334 |
| qdrant (gRPC) | +333 | 10333 | 11333 |
| elasticsearch | +200 | 10200 | 11200 |
| apache-tika | +998 | 10998 | 11998 |

### Git Worktrees

Each environment gets a **new branch**:
```
git worktree add ~/dust-hive/NAME -b NAME-workspace BASE
```

### Environment Variables

Two-layer system:
1. **Global secrets**: `~/.dust-hive/config.env` (user configures once)
2. **Port overrides**: Generated per-env in `~/.dust-hive/envs/NAME/env.sh`

**Complete env.sh** (derived from port base, NAME=environment name):
```bash
source ~/.dust-hive/config.env

# === Ports (for services that read env vars) ===
export PORT=10000                    # Next.js
export CORE_PORT=10001               # Core API (requires code change)
export CONNECTORS_PORT=10002         # Connectors (passed via -p flag)
export OAUTH_PORT=10006              # OAuth (requires code change)

# === Temporal namespaces (per-env isolation) ===
export TEMPORAL_NAMESPACE=dust-hive-NAME
export TEMPORAL_AGENT_NAMESPACE=dust-hive-NAME-agent
export TEMPORAL_CONNECTORS_NAMESPACE=dust-hive-NAME-connectors
export TEMPORAL_RELOCATION_NAMESPACE=dust-hive-NAME-relocation

# === Init script vars (for init_dev_container.sh) ===
export POSTGRES_PORT=10432
export POSTGRES_HOST=localhost
export QDRANT_URL=http://localhost:10334
export ELASTICSEARCH_INIT_URL=http://localhost:10200

# === Inter-service URLs ===
export CORE_API=http://localhost:10001
export CONNECTORS_API=http://localhost:10002
export OAUTH_API=http://localhost:10006
export DUST_FRONT_API=http://localhost:10000
export DUST_FRONT_INTERNAL_API=http://localhost:10000
export DUST_CLIENT_FACING_URL=http://localhost:10000
export DUST_PUBLIC_URL=http://localhost:10000
export NEXT_PUBLIC_DUST_CLIENT_FACING_URL=http://localhost:10000
export DUST_AUTH_REDIRECT_BASE_URL=http://localhost:3000
export CONNECTORS_PUBLIC_URL=http://localhost:10002

# === Database URIs ===
export FRONT_DATABASE_URI=postgres://dev:dev@localhost:10432/dust_front
export FRONT_DATABASE_READ_REPLICA_URI=postgres://dev:dev@localhost:10432/dust_front
export CORE_DATABASE_URI=postgres://dev:dev@localhost:10432/dust_api
export CORE_DATABASE_READ_REPLICA_URI=postgres://dev:dev@localhost:10432/dust_api
export CONNECTORS_DATABASE_URI=postgres://dev:dev@localhost:10432/dust_connectors
export CONNECTORS_DATABASE_READ_REPLICA_URI=postgres://dev:dev@localhost:10432/dust_connectors
export OAUTH_DATABASE_URI=postgres://dev:dev@localhost:10432/dust_oauth

# === Service URIs ===
export REDIS_URI=redis://localhost:10379
export REDIS_CACHE_URI=redis://localhost:10379
export QDRANT_CLUSTER_0_URL=http://127.0.0.1:10334
export ELASTICSEARCH_URL=http://localhost:10200
export TEXT_EXTRACTION_URL=http://localhost:10998
```

### Docker Compose

**New base file**: `tools/docker-compose.dust-hive.yml`
- No `container_name` directives (let docker-compose generate from project name)
- Includes healthchecks for all services
- Includes qdrant_primary + qdrant_secondary (clustered mode)
- Includes apache-tika

**Healthchecks in base compose:**
```yaml
services:
  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 5s
      retries: 5
  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
  qdrant_primary:
    healthcheck:
      test: ["CMD-SHELL", "sleep 1"]
      interval: 5s
      timeout: 10s
      retries: 3
      start_period: 10s
  elasticsearch:
    environment:
      - xpack.security.enabled=false
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 10
  apache-tika:
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9998/tika || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 5
```

**Per-env override** (ports + volumes):
```yaml
services:
  db:
    ports:
      - "10432:5432"
    volumes:
      - dust-hive-NAME-pgsql:/var/lib/postgresql/data
  redis:
    ports:
      - "10379:6379"
  qdrant_primary:
    ports:
      - "10334:6334"
      - "10333:6333"
    volumes:
      - dust-hive-NAME-qdrant-primary:/qdrant/storage
  qdrant_secondary:
    volumes:
      - dust-hive-NAME-qdrant-secondary:/qdrant/storage
  elasticsearch:
    ports:
      - "10200:9200"
    volumes:
      - dust-hive-NAME-elasticsearch:/usr/share/elasticsearch/data
  apache-tika:
    ports:
      - "10998:9998"
volumes:
  dust-hive-NAME-pgsql:
  dust-hive-NAME-qdrant-primary:
  dust-hive-NAME-qdrant-secondary:
  dust-hive-NAME-elasticsearch:
```

**Warm waits for healthy:** `docker-compose up -d --wait` or poll `docker-compose ps` until all services show healthy.

### Temporal

**Shared Temporal server** (user runs `temporal server start-dev`).

Search attributes created once on shared server. **Note:** `temporal server start-dev` resets state on restart - `doctor` checks and recreates search attributes if missing.

Each env uses **4 namespaces** (created on first warm):
- `dust-hive-NAME` (front)
- `dust-hive-NAME-agent`
- `dust-hive-NAME-connectors`
- `dust-hive-NAME-relocation`

### Database Initialization

On **first warm**:
1. Start docker-compose with `--wait` (blocks until all healthchecks pass)
2. **Wait for SDK build** (`sdks/js/dist/client.esm.js` exists)
3. Create Temporal namespaces if not exist
4. Run parameterized init_dev_container.sh (uses `$POSTGRES_PORT`, `$QDRANT_URL`, etc.)
5. `cd core && cargo run --bin init_db`
6. `cd front && ./admin/init_db.sh --unsafe && ./admin/init_plans.sh --unsafe`
7. `cd connectors && ./admin/init_db.sh --unsafe`

### Node Version Management

All commands source nvm:
```bash
source ~/.nvm/nvm.sh && nvm use
```

---

## Directory Structure

```
~/.dust-hive/
├── config.env                    # Global secrets
├── envs/
│   └── NAME/
│       ├── env.sh                # Port overrides + sources config.env
│       ├── docker-compose.override.yml
│       ├── ports.json
│       ├── metadata.json
│       ├── initialized           # DB init complete marker
│       ├── sdk.pid / sdk.log
│       ├── front.pid / front.log
│       ├── core.pid / core.log
│       ├── connectors.pid / connectors.log
│       ├── oauth.pid / oauth.log
│       └── front-workers.pid / front-workers.log
└── zellij/
    └── layout.kdl

~/dust-hive/NAME/                 # Git worktree
```

---

## Test Requirements (MVP Ship Criteria)

### Quick Validation (run frequently)

1. **Health check after warm**
   ```
   dust-hive spawn --name test-health --no-open
   dust-hive warm test-health
   curl -sf http://localhost:10000/api/healthz  # front
   curl -sf http://localhost:10001/             # core (root path)
   # Verify: both return 200
   ```

### Functional Tests

2. **spawn → open → destroy cycle**
3. **spawn → warm → cool → stop → start cycle**
4. **Multiple concurrent cold environments** (3 envs, different port bases)
5. **Two warm environments simultaneously** ← REQUIRED
   ```
   dust-hive spawn --name env-a --no-open && dust-hive warm env-a
   dust-hive spawn --name env-b --no-open && dust-hive warm env-b
   curl -sf http://localhost:10000/api/healthz  # env-a front
   curl -sf http://localhost:11000/api/healthz  # env-b front
   curl -sf http://localhost:10001/             # env-a core
   curl -sf http://localhost:11001/             # env-b core
   # Verify: all respond, no port conflicts
   ```
6. **Zellij session persistence**
7. **Service daemon independence from zellij**
8. **First warm initializes databases**
9. **list and status accuracy**
10. **Inconsistent state warning** (kill SDK manually, verify ⚠️ in list)
11. **doctor prerequisite checking** (including Temporal search attributes)
12. **Duplicate name rejection**
13. **Invalid state transitions**
14. **Graceful handling of crashed processes**
15. **Cleanup on failed spawn**
16. **Destroy with uncommitted changes** (requires --force)

### Integration Test (run once before ship)

17. **Front test suite passes**
    ```
    dust-hive spawn --name test-front --no-open
    dust-hive warm test-front
    cd ~/dust-hive/test-front/front
    source ~/.dust-hive/envs/test-front/env.sh
    npm test
    # Verify: all tests pass
    ```

### Performance Requirements

18. **spawn < 5 minutes** (npm ci is slow)
19. **warm < 2-4 minutes** (first warm with full init)
20. **list < 1 second**
21. **open < 2 seconds**

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `tools/docker-compose.dust-hive.yml` | Create (base compose with healthchecks, qdrant cluster, apache-tika, no container_name) |
| `tools/dust-hive/` | Create (CLI source code) |
| `init_dev_container.sh` | Modify (read ports from env vars: POSTGRES_PORT, QDRANT_URL, etc.) |
| `core/bin/core_api.rs` | Modify (read port from CORE_PORT env var, default 3001) |
| `core/bin/oauth.rs` | Modify (read port from OAUTH_PORT env var, default 3006) |

---

## Out of Scope (MVP)

- Caching (node_modules, rust target, DB snapshots)
- expose/unexpose (Caddy proxy)
- Remote features (share, offload, pull, ssh, sync)
- rebase, code, path commands
- Automatic schema drift handling
- sqlite-worker (can start manually if needed)

---

## Prerequisites for User

1. Clone dust repo
2. Install: Bun, Zellij, Docker, Temporal CLI
3. Create `~/.dust-hive/config.env` with vars from local-dev-setup.md
4. Run `temporal server start-dev` in separate terminal
5. Create Temporal search attributes (or run `dust-hive doctor` to verify/create)
