# Shared Dust in-container / cloud-agent development environment

Agent-agnostic Dockerfile + scripts used by:

- **Cursor / VS Code Dev Containers** via [`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json)
- **Cursor Cloud Agents** via thin adapter [`.cursor/environment.json`](../.cursor/environment.json)
- **Laptop CLI** via `bash dev/scripts/docker-run.sh`
- **Other AI agents** by calling the same scripts (`install` → `infra` / `up`)

Mac-native workflows stay separate: `tools/start-mprocs.sh` (mprocs + Docker Compose) and `tools/dev.sh` (process-compose).

## Quick start (Dev Containers)

Export the same host secrets as for `docker-run.sh`, open [`dust.code-workspace`](../dust.code-workspace) (single-root), then **Dev Containers: Reopen in Container** (or **Open Workspace in Container...**).

On create: `install.sh`. On each start: `infra.sh`. Apps/mprocs are not auto-started — in a container terminal run:

```bash
bash dev/scripts/apps.sh
```

## Quick start (laptop CLI)

```bash
export OP_SERVICE_ACCOUNT_TOKEN=...   # 1Password service account
# optional: DEV_WORKOS_USER_* , GCP_SERVICE_ACCOUNT
bash dev/scripts/docker-run.sh        # build/start container → install → infra → mprocs
bash dev/scripts/docker-run.sh --shell
```

Local builds use Docker's native architecture (`linux/arm64` on Apple Silicon,
`linux/amd64` on Intel) by default. Set `DUST_DEV_PLATFORM=linux/amd64` or
`DUST_DEV_PLATFORM=linux/arm64` to override it. When switching architecture,
rebuild and reset the named volumes because `node_modules` and Rust build
artifacts contain architecture-specific binaries:

```bash
bash dev/scripts/docker-run.sh --build --reset-volumes
```

## Persistent data

Postgres, Redis, Elasticsearch, Temporal and Qdrant all keep their state under
`DUST_DATA_ROOT` (`/var/lib/dust-dev`), backed by the single `dust-dev-data`
volume. `init-data-dirs.sh` creates the per-service subdirectories and, on an
empty volume, `initdb`s a fresh Postgres cluster. `infra.sh` then recreates
databases, Elasticsearch indices, and the Qdrant collection. Without the
volume this state lives in the container layer and is lost on every rebuild.

`core/target` is a separate named volume (`dust-dev-cargo-target`). Cargo
leaves old incremental and dep artifacts behind on rebuilds; `infra.sh` runs
`cargo-sweep` on start to drop unused files older than 14 days, artifacts from
uninstalled toolchains, and anything over 12GiB. Override with
`DUST_CARGO_SWEEP_DAYS` / `DUST_CARGO_SWEEP_MAXSIZE`.

`--reset-volumes` drops that data too: the next `infra.sh` starts from a
pristine cluster (schema, indices, collection) with no local workspaces or
documents.

## Scripts

| Script | Role |
|--------|------|
| `install.sh` | `npm install` + lefthook |
| `infra.sh` | Postgres/Redis/Qdrant/ES/Temporal + Chrome managed policies + materialize 1Password + migrations |
| `sweep-cargo-target.sh` | Prune stale `core/target` artifacts on the Cargo volume (14d / 12GiB cap) |
| `init-data-dirs.sh` | Create `DUST_DATA_ROOT` dirs; `initdb` a fresh Postgres cluster if empty |
| `init-qdrant-collections.sh` | Create the Qdrant embedding collection (idempotent) |
| `apps.sh` | Wait for infra, optional WorkOS seed, mprocs |
| `up.sh` | `install?` → `infra` → `apps` (serial entry for laptop / non-Cursor agents) |
| `refresh-op-env.sh` | Re-fetch 1Password Environment into `/tmp` for all shells |
| `docker-run.sh` | Local container launcher |

## Secrets

- **Runtime / host-injected:** `OP_SERVICE_ACCOUNT_TOKEN`, `DEV_WORKOS_*`, `GCP_SERVICE_ACCOUNT` (already in process env; not re-exported).
- **1Password Environment:** materialized once to `/tmp/dust-op-environment.env`, loaded via `BASH_ENV=/tmp/dust-shell-env.sh` for non-interactive bash (infra/mprocs) and via `/root/.zshrc` / `dev/zshrc` for interactive terminals.
- **Local overrides:** `dev/scripts/env.sh` → `apply_local_overrides` forces in-container DB/API URLs after OP load.

## Infra models

| Mode | Where | How |
|------|--------|-----|
| In-container | This image / cloud agents | `infra.sh` starts daemons in the VM |
| Mac compose | Host Docker Desktop | root `docker-compose.yml` via `tools/start-mprocs.sh` |

Inside the container, compose-based mprocs procs (`docker-infra`, `kibana`, …) no-op when `DUST_IN_CONTAINER=1`.

## Base image

`dev/Dockerfile` builds on `ubuntu:24.04` and installs Node from the official tarball
(`NODE_VERSION` build arg) instead of using a `node:*` image. Cursor's in-container screen
recorder (`/exec-daemon/polished-renderer.node`) links against glibc 2.39 and the FFmpeg 6
sonames shipped by Noble (`libavutil.so.58`, `libav{codec,format,device}.so.60`,
`libswscale.so.7`), which Debian 12 (glibc 2.36, FFmpeg 5) and Debian 13 (FFmpeg 7) cannot
provide. Keep the base on Noble and keep `ffmpeg` installed, or agents lose video capture.

## Cursor Cloud snapshots

Cloud agents boot from a prebuilt environment snapshot: `/workspace` is the checkout baked when
that snapshot was built, and it is not re-fetched at boot. `.cursor/environment.json`, however, is
read from current `main`. Moving or renaming anything it references therefore breaks every agent
still booting an older snapshot — `start` fails once with exit 127 and is never retried.

The skew closes on the next successful build, so when `start` fails that way, check that
environment builds are green before touching the scripts. Keep `dev/Dockerfile` buildable:
Docker has no inline comments, so `ENV k=v  # note` is a parse error, not a comment. Values that
need a `# pragma: allowlist secret` marker therefore belong in `dev/scripts/env.sh`, not the image.
