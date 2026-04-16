# `dsbx forward` end-to-end tests

Dockerised bun tests that exercise `dsbx forward` against the live production
egress-proxy. The container sets up iptables `REDIRECT` rules for a dedicated
`dust-fwd` uid so plain `fetch("https://dust.tt/")` calls from within the test
transparently flow through the forwarder and the proxy — the same path a
production sandbox will take.

The tests replace the old `egress-proxy/scripts/smoke.ts` helper: everything
now runs through `dsbx forward`.

## What it covers

- **Matrix** (6 cases): valid JWT + allowed domain (ALLOW), valid JWT + denied
  domain (DENY + deny log entry with `reason: proxy_denied`), expired JWT,
  wrong `iss`, wrong `aud`, bad signature. All DENY cases additionally verify
  `/tmp/dust-egress-denied.log` contains a correctly-formatted line for the
  denied target.
- **Streaming**: real agent call — POST a "write a short poem" message to the
  Dust agent (`sId=dust` by default) on your workspace, iterate the streamed
  `generation_tokens` events via the `@dust-tt/client` SDK, assert at least
  one token was received. Uses your workspace API key; the request flows
  `fetch → iptables REDIRECT → dsbx forward → egress-proxy → dust.tt`.

## Required env

| var | purpose |
| --- | --- |
| `EGRESS_PROXY_JWT_SECRET` | HS256 secret shared with the proxy. Fetch from GCP Secret Manager. |
| `DUST_API_KEY` | workspace API key (streaming test only) |
| `DUST_WORKSPACE_ID` | target workspace sId (streaming test only) |

## Optional env (all have sensible defaults)

| var | default |
| --- | --- |
| `EGRESS_PROXY_HOST` | `eu.sandbox-egress.dust.tt` |
| `EGRESS_PROXY_PORT` | `4443` |
| `EGRESS_PROXY_TLS_NAME` | same as `EGRESS_PROXY_HOST` |
| `EGRESS_PROXY_ALLOWED_DOMAIN` | `dust.tt` |
| `EGRESS_PROXY_DENIED_DOMAIN` | `example.com` |
| `EGRESS_PROXY_JWT_TTL_SECONDS` | `300` |
| `EGRESS_PROXY_SB_ID` | `e2e-<timestamp>` |
| `DUST_AGENT_ID` | `dust` |
| `DUST_API_BASE_URL` | `https://dust.tt` |
| `DUST_AGENT_PROMPT` | short "write a poem" prompt |
| `RUST_LOG` | `info` (tracing filter for `dsbx forward`) |

## Running

From the monorepo root:

```bash
export EGRESS_PROXY_JWT_SECRET="$(gcloud secrets versions access latest \
  --project=<proj> --secret=egress-proxy-jwt-secret)"
export DUST_API_KEY=sk-...
export DUST_WORKSPACE_ID=...

./cli/dust-sandbox/e2e/run.sh         # matrix + streaming
./cli/dust-sandbox/e2e/run.sh matrix  # just the matrix
./cli/dust-sandbox/e2e/run.sh streaming
```

`run.sh` builds the image on each invocation (docker layer cache makes
subsequent builds fast) and runs with `--cap-add=NET_ADMIN` so iptables works
inside the container.

## How it works

- Stage 1 of the Dockerfile builds the `dsbx` binary from the current tree.
- Stage 2 (the runtime image) installs `iptables` + `bun`, creates a `dust-fwd`
  system user (uid 3000), and copies in `dsbx`, `smoke.ts`, `case.ts`, and
  `entrypoint.sh`.
- `entrypoint.sh` (root) installs the iptables `REDIRECT` rules, then execs
  the bun orchestrator (`smoke.ts`).
- `smoke.ts` (root) mints a per-case JWT, writes it to the forwarder's token
  file, spawns `dsbx forward`, then uses
  `runuser --preserve-environment -u dust-fwd -- bun /app/case.ts …` to drop
  to `dust-fwd` and issue the actual HTTPS request. Between JWT-variant cases
  it tears down and respawns `dsbx forward` so the new token is picked up
  (token-file hot-reload is out of scope in the forwarder for now).
- For every DENY case, `smoke.ts` reads `/tmp/dust-egress-denied.log` and
  asserts the expected `DENIED <domain>:<port> (reason: proxy_denied)` entry
  is present.
