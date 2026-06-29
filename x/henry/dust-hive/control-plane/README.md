# Hive control plane

The reusable primitive layer for the Cloud Hive pilot: provisions, lists,
connects to, and reclaims **bees** (Blaxel-backed dust-hive sandboxes). The
`dust-hive` CLI is its first client; the desktop pane and any future interface
are just more clients of the same API.

All Blaxel coupling is isolated behind `src/blaxel/provider.ts` (Risk #7), so the
bee contract can be re-pointed at another sandbox provider without changing the
control plane or its clients.

## API

Every call requires an authenticated client identity (`Authorization: Bearer
<token>`); every per-bee call enforces that the caller owns the target bee
(another owner's bee reads as `404`, so existence never leaks).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/bees` | the caller's fleet |
| `POST` | `/bees` | provision: register + create sandbox from the warm image |
| `GET` | `/bees/:id` | one bee |
| `POST` | `/bees/:id/connect` | mint a short-lived session token, return preview URL |
| `GET` | `/bees/:id/ready` | readiness gate after a resume |
| `DELETE` | `/bees/:id` | reclaim: revoke tokens + delete sandbox + drop record |

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `HIVE_CP_PORT` | `4000` | listen port |
| `HIVE_CP_REGION` | `eu` | Blaxel region for new sandboxes |
| `HIVE_CP_PROVIDER` | `fake` | `fake` (in-memory) or `blaxel` (real sandboxes) |
| `HIVE_CP_BEE_IMAGE` | — | warm base image (required when `provider=blaxel`) |
| `HIVE_CP_BEE_MEMORY_MB` | `16384` | sandbox memory (drives CPU + tmpfs) |
| `HIVE_CP_BEES_FILE` | `~/.dust-hive/control-plane/bees.json` | registry file |
| `HIVE_CP_DEV_TOKENS` | — | dev-only `token=userId,…` map (replaced by WorkOS later) |

When `HIVE_CP_PROVIDER=blaxel`, the `@blaxel/core` SDK reads `BL_API_KEY` and
`BL_WORKSPACE` from the environment.

## Run it (fake provider — works today, no Blaxel needed)

```bash
cd x/henry/dust-hive/control-plane
HIVE_CP_DEV_TOKENS="dev-token=me" bun run start
```

Point the CLI at it (stored in `~/.dust-hive/config.env`):

```bash
dust-hive env set HIVE_CP_URL http://localhost:4000
dust-hive env set HIVE_CP_TOKEN dev-token

dust-hive spawn --remote my-feature   # provision a bee
dust-hive list  --remote              # see the fleet
dust-hive url   --remote my-feature   # print its preview URL
```

## Live test (real Blaxel — once access + a warm image exist)

```bash
export BL_API_KEY=...        # Blaxel workspace credentials
export BL_WORKSPACE=...
HIVE_CP_PROVIDER=blaxel \
HIVE_CP_BEE_IMAGE=<warm-base-image> \
HIVE_CP_DEV_TOKENS="dev-token=me" \
  bun run start
```

The CLI surface is identical — `spawn/list/url --remote` now create and address
real sandboxes. Provisioning boots dust-hive in **bee mode** inside the sandbox
(`dust-hive bee-init`): the image is the worktree, base port 10000, no
worktree/symlink/sync.

## Not yet wired (next milestones)

- Real WorkOS/OIDC verifier (today: `StaticTokenVerifier` via `HIVE_CP_DEV_TOKENS`).
- Authenticated preview tokens returned to the client (preview is created
  `public:false`; the token plumbing lands with the connect/exec path).
- `env`/`agent` state columns in `list --remote` (in-bee, M2) and the
  interactive session + keepalive (M3/M4).
