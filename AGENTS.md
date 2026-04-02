@AGENTS.local.md

## Cursor Cloud specific instructions

### Architecture overview

Dust is a monorepo with multiple services. The main ones are:
- **front** (Next.js 14, port 3000) — main web app and API
- **connectors** (Express, port 3002) — data connector service
- **core** (Rust/Axum, port 3001) — core AI/data processing API
- **sparkle** — shared design system library (must be built before front)
- **sdks/js** — JS client SDK (must be built before front/connectors)

### Infrastructure (Docker Compose)

Start infrastructure with env vars for Elasticsearch:
```bash
export ES_LOCAL_VERSION=8.13.4 ELASTICSEARCH_PASSWORD=elastic_password ES_LOCAL_PORT=9200 ES_LOCAL_HEAP_INIT=256m ES_LOCAL_HEAP_MAX=512m ES_LOCAL_CONTAINER_NAME=dev-elasticsearch KIBANA_LOCAL_PASSWORD=kibana_password KIBANA_ENCRYPTION_KEY=abcdefghijklmnopqrstuvwxyz123456 KIBANA_LOCAL_CONTAINER_NAME=dev-kibana KIBANA_LOCAL_PORT=5601
docker compose up -d db redis qdrant_primary elasticsearch
```
Required services: PostgreSQL (5432), Redis (6379), Qdrant (6333), Elasticsearch (9200).

Docker in this VM requires `fuse-overlayfs` storage driver and `iptables-legacy`. Docker socket may need `sudo chmod 666 /var/run/docker.sock` after daemon start.

### Database initialization

After starting PostgreSQL, create databases:
```bash
POSTGRES_URI="postgres://dev:dev@localhost:5432/"
for db in dust_api dust_databases_store dust_front dust_front_test dust_connectors dust_connectors_test dust_oauth; do
  psql "$POSTGRES_URI" -c "CREATE DATABASE $db;" 2>/dev/null || true
done
```

Then run migrations:
```bash
cd front && FRONT_DATABASE_URI="postgres://dev:dev@localhost:5432/dust_front" FRONT_DATABASE_READ_REPLICA_URI="postgres://dev:dev@localhost:5432/dust_front" ./admin/init_db.sh --unsafe && cd ..
cd connectors && CONNECTORS_DATABASE_URI="postgres://dev:dev@localhost:5432/dust_connectors" CONNECTORS_DATABASE_READ_REPLICA_URI="postgres://dev:dev@localhost:5432/dust_connectors" ./admin/init_db.sh --unsafe && cd ..
```

### Building libraries

Build order matters: `sdks/js` then `sparkle` before running `front` or `connectors`.
```bash
cd sdks/js && npm run build && cd ../..
cd sparkle && npm run build && cd ..
```

### Running the front service

The front service needs many env vars. Key ones for dev:
- `FRONT_DATABASE_URI`, `FRONT_DATABASE_READ_REPLICA_URI` — PostgreSQL connection
- `REDIS_URI`, `REDIS_CACHE_URI` — Redis connection
- `NEXT_PUBLIC_DUST_CLIENT_FACING_URL`, `NEXT_PUBLIC_DUST_APP_URL` — set to `http://localhost:3000`
- `CORE_API`, `CONNECTORS_API`, `OAUTH_API` — API URLs for other services
- `ELASTICSEARCH_URL`, `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD` — ES connection
- WorkOS vars (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, etc.) — use dummy values for local dev

### Lint, type-check, tests

- **Lint**: `npm run biome` (root) — runs Biome on all workspaces
- **Type-check front**: `cd front && npx tsgo --noEmit`
- **Type-check connectors**: `cd connectors && npx tsgo --noEmit`
- **Front tests**: `cd front && TEST_FRONT_DATABASE_URI="postgres://dev:dev@localhost:5432/dust_front_test" TEST_REDIS_URI="redis://localhost:6379" npm test`
- **Connectors tests**: `cd connectors && CONNECTORS_DATABASE_URI="postgres://dev:dev@localhost:5432/dust_connectors_test" CONNECTORS_DATABASE_READ_REPLICA_URI="postgres://dev:dev@localhost:5432/dust_connectors_test" npm test -- --run`

### Gotchas

- The `sparkle` package requires Node >=24.14.0 in its `engines` field, but builds fine with Node 22.22.0 (the repo's `.nvmrc`). Do not upgrade Node just for sparkle.
- `glob.test.ts` in `front/lib/api/sandbox/image/profile/tests/` has pre-existing failures (6 tests) — not a setup issue.
- The `docker-compose.yml` requires env vars for Elasticsearch that aren't in any `.env` file — they must be exported before running `docker compose`.
- `front/admin/init_db.sh` and `connectors/admin/init_db.sh` check for the `main` branch by default; use `--unsafe` flag to bypass.
- The `package.json` uses `corepack` for npm 11.11.0; run `corepack enable npm` to activate it.
- The full dev environment uses `mprocs` (see `tools/mprocs.yaml`), but individual services can be started independently.
