# Bee image

The warm base image we push to Blaxel. A **bee** is a Blaxel sandbox running this
image: a full, single-tenant dust-hive environment on its own localhost (base
port 10000), reachable through an authenticated Blaxel preview URL. The control
plane provisions a sandbox from this image and then execs
`dust-hive bee-init <name> --warm` inside it.

## What must exist in the sandbox

Derived from the dust-hive `doctor` prerequisites and the dust production
Dockerfiles (`dockerfiles/core.Dockerfile`, `front.Dockerfile`):

| Requirement | Why | Version |
|---|---|---|
| **sandbox-api** binary | Blaxel process/file/exec API (every image must run it) | `ghcr.io/blaxel-ai/sandbox:latest` |
| **dockerd + docker compose** | the bee's stateful services (PG/Redis/Qdrant/ES/Tika) run via compose | docker.io + compose plugin |
| **Node + npm** | front / front-api / marketing / connectors / workers, SDK, sparkle | node 24.16.0, npm 11.11.0 |
| **Rust + cmake + protobuf** | core + oauth (cmake for sentencepiece) | rust 1.85.0 |
| **Bun** | the dust-hive CLI runtime | latest |
| **Temporal CLI** | workers + per-env namespaces (`temporal server start-dev`) | latest |
| **tmux** | bees default to tmux (passive multiplexer, attach over exec) | — |
| **direnv, lsof, git, libjemalloc** | env loading, port mgmt, commits/branch, front runtime | — |
| **dust-hive CLI on PATH** | bee-init / warm / status / logs run in-bee | this repo's `cli/` |
| **the dust repo, baked** | the image *is* the worktree: node_modules installed in place + cargo `target/` prebuilt + `.git` present | at `/workspace/dust` |
| **`settings.json` → tmux** | `~/.dust-hive/settings.json` `{"multiplexer":"tmux"}` | — |

## Files

- `Dockerfile` — debian (glibc) base, sandbox-api, dockerd, the toolchain above,
  the baked repo, prebuilt deps/binaries.
- `entrypoint.sh` — starts sandbox-api, dockerd (vfs), and the temporal dev
  server, then idles. Per-bee boot arrives via the exec API.
- `blaxel.toml` — `mk3`, 16 GB, preview on port 10000.
- `Makefile` — `make build` (buildx, context = repo root).

## Build & push (NEVER create a sandbox)

We are quota-limited: **do not** run `bl deploy`, `bl run`, `make run`, or
`SandboxInstance.create`. They create a sandbox. Only build and push.

```bash
bl login                                  # uses BLAXEL_API_KEY
make -C x/henry/dust-hive/bee-image build  # local image build
bl push                                    # publish to Blaxel registry (no sandbox)
```

Then point the control plane at it: `HIVE_CP_PROVIDER=blaxel HIVE_CP_BEE_IMAGE=dust-bee`.

## Docker-in-sandbox: confirmed facts (Blaxel docs + their docker-in-sandbox source)

Blaxel runs sandboxes in **microVMs**, and **dockerd runs inside** — their
`blaxel/docker-in-sandbox` entrypoint launches a real daemon
(`dockerd --config-file=/etc/docker/daemon.json --host=unix:///run/docker.sock`,
vfs storage driver). So `docker compose up` for the bee's services is viable.
M0 gate #1 ("does docker run in a bee") is **answered yes in principle** — what
remains is confirming it on our **debian/glibc** base (Blaxel only ships/tests
alpine; the limitations below are kernel-level, so they should carry over).

These limitations are stated verbatim in Blaxel's entrypoint comments — **not
distro-specific, they apply to our image too**:

1. **CMD/CMD-SHELL healthchecks do NOT work** (the microVM kernel lacks the
   namespace ops they need). `docker-compose.yml` healthchecks (pg_isready,
   redis-cli, ES curl, tika wget) won't run, so `docker inspect
   .State.Health.Status` never reports `healthy`. **Fixed**: `cli/src/lib/init.ts`
   `waitForContainer` was replaced with host-port probes — a TCP connect for
   Postgres and HTTP probes for Qdrant (`/`) and Elasticsearch
   (`/_cluster/health`), keyed off the published ports in `env.ports`. The same
   code path runs on a laptop, so this is not a bee-only branch.
2. **`docker exec` does NOT work** (same kernel reason). Never use it for in-bee
   readiness or DB creation. `psql` runs host-side against the published port
   (`postgresql-client` is installed in the image), and `init.ts` already shells
   out to `psql`, not `docker exec`. Use `docker run` / `docker logs` /
   `docker attach`, never `docker exec`.
3. **vfs storage driver + tmpfs ceiling (design Risk #3).** vfs is space-heavy
   and the writable layer is ≈ 50% of memory; the warm stack + node_modules +
   DB data dirs may overflow ~8 GB on a 16 GB bee. Measure working-set; design
   **volume-backed DB data dirs** and reconcile with snapshot/resume.
4. **musl vs glibc.** Why this image is debian-based and does not inherit from
   `blaxel/docker-in-sandbox` (alpine/musl) — dust's prebuilt Rust/Node artifacts
   are glibc. We replicate the daemon config rather than the base image. Two
   details copied from the stock image so dockerd actually works on the microVM
   kernel: it uses the **legacy iptables backend** (`update-alternatives --set
   iptables /usr/sbin/iptables-legacy` in the Dockerfile; debian defaults to
   nft, which dockerd can't program here), and the image is built
   **`--platform linux/amd64`** (Blaxel microVMs are amd64; building on an arm64
   host without this flag yields an unrunnable image). Both are in the official
   [Docker-in-Sandbox tutorial](https://docs.blaxel.ai/Tutorials/Docker).

## How the control plane drives a bee

1. `POST /bees` → `SandboxInstance.createIfNotExists({ image: "dust-bee", … })`.
2. `bootBee` → exec `dust-hive bee-init <name> --warm` with `workingDir=/workspace/dust`
   (registers the baked checkout as a single-tenant env, base port 10000, then warms).
3. Preview on port 10000 (`public:false`) → the bee's authenticated preview URL.
4. `connect` mints a session token for exec/attach.
