# Auth Redirect Port Forwarding (dust-hive)

## Summary
Dust-hive assigns unique per-environment ports (10000, 11000, etc). OAuth/WorkOS redirect URIs in Dust are built from the client-facing base URL, which is expected to be the default local dev port (3000). Because dust-hive sets the client-facing URL to the env-specific front port, providers reject redirects (mismatch with their configured URIs) without an auth-specific override.

This doc records what is already implemented and what remains:
- Implemented: an auth-only redirect base (`DUST_AUTH_REDIRECT_BASE_URL`) with fallback to the existing client-facing URL.
- Implemented: dust-hive exports that env var as `http://localhost:3000`.
- Remaining: a forwarder that maps the default port to a selected warm environment.
- Remaining: a CLI command to switch the forwarding target quickly.

## Where redirects are computed today
Client-facing redirect URIs are built in front:
- `front/lib/api/oauth/utils.ts` builds the finalize URL from `config.getAuthRedirectBaseUrl()`.
- `front/pages/api/workos/[action].ts` builds the AuthKit redirect URI from `config.getAuthRedirectBaseUrl()`.
- `front/lib/api/config.ts` resolves `getAuthRedirectBaseUrl()` from `DUST_AUTH_REDIRECT_BASE_URL`, falling back to `getClientFacingUrl()`.
- `front/lib/api/config.ts` resolves `getClientFacingUrl()` from `NEXT_PUBLIC_DUST_CLIENT_FACING_URL`.

In dust-hive, the client-facing URL is set here, and the auth redirect base is exported:
- `x/henry/dust-hive/src/lib/envgen.ts` exports:
  - `DUST_CLIENT_FACING_URL`
  - `DUST_PUBLIC_URL`
  - `NEXT_PUBLIC_DUST_CLIENT_FACING_URL`
  all pointing to `http://localhost:${ports.front}`.
  - `DUST_AUTH_REDIRECT_BASE_URL` pointing to `http://localhost:3000`.

Default local dev values (3000) are documented in:
- `local-dev-setup.md` (multiple `DUST_*` URL entries).
OAuth tests also assume 3000:
- `core/src/oauth/tests/functional_connections.rs`.

## Root cause
OAuth providers are configured to accept redirects at `http://localhost:3000/oauth/<provider>/finalize`. Dust-hive redirects are currently generated with `http://localhost:10000/...` (or similar), so the provider rejects them.

## Goal
Keep per-env service ports for isolation, but make OAuth redirect URIs use the default local dev port. Route that default port to the selected environment.

## Design and current implementation

### 1) Split "service ports" from "auth redirect base"
Keep env-specific ports for internal services and UI navigation:
- `PORT`, `CORE_PORT`, `CONNECTORS_PORT`, `OAUTH_PORT`
- `DUST_FRONT_API`, `DUST_FRONT_INTERNAL_API`
- `DUST_CLIENT_FACING_URL`, `DUST_PUBLIC_URL`, `NEXT_PUBLIC_DUST_CLIENT_FACING_URL`

Add a separate auth redirect base:
- `DUST_AUTH_REDIRECT_BASE_URL`

Implemented:
- In `x/henry/dust-hive/src/lib/envgen.ts`, set `DUST_AUTH_REDIRECT_BASE_URL=http://localhost:3000`.
- In front, use `DUST_AUTH_REDIRECT_BASE_URL` for OAuth + WorkOS redirect URIs, and default to `getClientFacingUrl()` when unset (no-op in prod).

### 2) Add a TCP forwarder for the default port
Implement a small TCP proxy that binds the default port (3000) and forwards all traffic to the selected env front port (10000, 11000, etc).

Why TCP proxy:
- Works for HTTP and WebSockets.
- Avoids extra dependencies.

Implementation sketch (Bun/Node net):
```
net.createServer((client) => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  client.pipe(upstream);
  upstream.pipe(client);
});
```

### 3) New CLI command: `dust-hive forward`
Purpose: manage the forwarding target.

Behavior:
- `dust-hive forward` (no args): forward to the last warmed env.
- `dust-hive forward NAME`: switch forwarding to NAME (must be warm, or at least front running).
- `dust-hive forward status`: show current target + whether forwarding is running.
- `dust-hive forward stop`: stop the forwarder.

### 4) Warm triggers forward
To keep forwarding aligned with the active env:
- After `dust-hive warm NAME` completes and front is healthy, call `dust-hive forward NAME`.
- This ensures the default port is immediately mapped to the warmed env.
- Optional: allow a flag like `--no-forward` to skip the auto-forward behavior.

## Storage and process management
Suggested files under `~/.dust-hive/`:
- `forward.pid` - running forwarder PID.
- `forward.log` - forwarder stdout/stderr.
- `forward.json` - state:
  - `targetEnv`
  - `targetPort`
  - `lastWarm`
  - `updatedAt`

Use a dedicated helper in dust-hive (do not use env-scoped pid files) since forwarding is global.

## Edge cases
- Port 3000 already in use:
  - Forwarder should fail fast with a clear message.
  - Optional: allow `dust-hive forward --port 3001` as an override for special cases.
- Target env stops:
  - Forwarder stays up but connections fail.
  - `forward status` should warn if the target is no longer warm.
- Switching envs:
  - Stop the existing forwarder before starting the new one to avoid port conflicts.
  - Switching should be fast (one command).

## Implemented changes
- `front/lib/api/config.ts` (add `getAuthRedirectBaseUrl`)
- `front/lib/api/oauth/utils.ts` (use `getAuthRedirectBaseUrl`)
- `front/pages/api/workos/[action].ts` (use `getAuthRedirectBaseUrl`)
- `x/henry/dust-hive/src/lib/envgen.ts` (export `DUST_AUTH_REDIRECT_BASE_URL`)
- `x/henry/dust-hive/tests/lib/envgen.test.ts` (expect `DUST_AUTH_REDIRECT_BASE_URL`)
- `x/henry/dust-hive/SPEC.md` and `local-dev-setup.md` (document the env var)

## Remaining work
- `x/henry/dust-hive/src/commands/warm.ts` (auto-call `forward NAME` on success)
- `x/henry/dust-hive/src/commands/forward.ts` (new command)
- `x/henry/dust-hive/src/index.ts` (register command + usage)
- `x/henry/dust-hive/src/lib/paths.ts` (forwarder paths)
- `x/henry/dust-hive/src/lib/forward.ts` (TCP proxy + pid handling)
- `x/henry/dust-hive/README.md` (document forwarding)

## Manual test plan
1. Warm env A and forward:
   - `dust-hive warm env-a`
   - `dust-hive forward env-a`
   - `curl http://localhost:3000/api/healthz` should hit env A front.
2. OAuth flow:
   - Start a provider auth flow, confirm redirect uses `http://localhost:3000/oauth/<provider>/finalize`.
3. Switch to env B:
   - `dust-hive warm env-b`
   - `dust-hive forward env-b`
   - `curl http://localhost:3000/api/healthz` should now hit env B.
4. Direct port still works:
   - `curl http://localhost:10000/api/healthz` still hits env A.
