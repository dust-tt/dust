# Shared Dust in-container / cloud-agent development environment

Agent-agnostic Dockerfile + scripts used by:

- **Cursor Cloud Agents** via thin adapter [`.cursor/environment.json`](../.cursor/environment.json)
- **Laptop** via `bash dev/scripts/docker-run.sh`
- **Other AI agents** by calling the same scripts (`install` → `infra` / `up`)

Mac-native workflows stay separate: `tools/start-mprocs.sh` (mprocs + Docker Compose) and `tools/dev.sh` (process-compose).

## Quick start (laptop)

```bash
export OP_SERVICE_ACCOUNT_TOKEN=...   # 1Password service account
# optional: DEV_WORKOS_USER_* , GCP_SERVICE_ACCOUNT
bash dev/scripts/docker-run.sh        # build/start container → install → infra → mprocs
bash dev/scripts/docker-run.sh --shell
```

## Scripts

| Script | Role |
|--------|------|
| `install.sh` | `npm install` + lefthook |
| `wait-for-workspace.sh` | Wait for the git tree (Cloud warm-fork race), then `--then` exec infra/apps |
| `infra.sh` | Postgres/Redis/Qdrant/ES/Temporal + materialize 1Password + migrations |
| `apps.sh` | Wait for infra, optional WorkOS seed, mprocs |
| `up.sh` | `install?` → `infra` → `apps` (serial entry for laptop / non-Cursor agents) |
| `refresh-op-env.sh` | Re-fetch 1Password Environment into `/tmp` for all shells |
| `docker-run.sh` | Local container launcher |

## Cursor Cloud `start` / `terminals`

`.cursor/environment.json` points `start` and the mprocs terminal at `wait-for-workspace.sh --then …` (with a short `until [ -f … ]` bootstrap, because the waiter itself lives in the checkout). That avoids exit 127 when Cursor fires those commands before `/workspace` has the git tree on warm-fork `gitSetup: reuse`. Laptop `docker-run.sh` / `up.sh` do not use the waiter.

## Secrets

- **Runtime / host-injected:** `OP_SERVICE_ACCOUNT_TOKEN`, `DEV_WORKOS_*`, `GCP_SERVICE_ACCOUNT` (already in process env; not re-exported).
- **1Password Environment:** materialized once to `/tmp/dust-op-environment.env`, loaded via `BASH_ENV=/tmp/dust-shell-env.sh` and `dev/bashrc`.
- **Local overrides:** `dev/scripts/env.sh` → `apply_local_overrides` forces in-container DB/API URLs after OP load.

## Infra models

| Mode | Where | How |
|------|--------|-----|
| In-container | This image / cloud agents | `infra.sh` starts daemons in the VM |
| Mac compose | Host Docker Desktop | root `docker-compose.yml` via `tools/start-mprocs.sh` |

Inside the container, compose-based mprocs procs (`docker-infra`, `kibana`, …) no-op when `DUST_IN_CONTAINER=1`.
