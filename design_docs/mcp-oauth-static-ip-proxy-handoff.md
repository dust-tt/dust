# Handoff: static IP proxy for MCP OAuth token activity (`core`) — v2

**Task:** Make `core`'s MCP OAuth token requests (`finalize` + `refresh`) use the **static IP
proxy** when the token endpoint is on a **workspace-verified domain**, and the **untrusted egress
proxy** otherwise. This is the token-activity analogue of what `front` already does for MCP
tool-call traffic — but intentionally stricter (see Decision 4).

**Approach:** Option A — `front` computes the decision and persists a `use_static_ip_proxy` flag
(the **string** `"true"`/`"false"`) into the connection metadata; `core` reads it and selects the
proxy. The flag is (1) **stamped at connection creation** and (2) **kept fresh** by `front`
recomputing it and pushing updates to `core` **before** the access-token fetch that may trigger a
refresh.

Background and rejected alternatives: `design_docs/mcp-oauth-static-ip-proxy.md`.

> **v2 changelog (this revision incorporates four independent reviews).** Blockers fixed since v1:
> caller-controlled `extraConfig` could override the decision (now recomputed authoritatively);
> `client_for` could still egress directly (now fail-closed); the freshness sync ran *after* the
> refresh it was meant to protect (now runs *before*, gated by a short TTL); `reqwest` follows
> redirects by default, bypassing the host gate (now disabled for MCP token requests). Plus the
> legacy-workspace parity decision and a batch of representation/file-location/test corrections.

---

## Decisions (resolved — do not re-litigate)

1. **Gate host = `token_endpoint` host only.** Evaluate the verified-domain check against the host
   `core` actually connects to (the persisted `token_endpoint`). Not the MCP server URL, not the
   `authorization_endpoint` (the latter is hit by the user's browser, never by `core`).
2. **The flag is computed authoritatively from the *final persisted* `token_endpoint`, and a
   caller-supplied value is never honored.** This is what keeps the invariant self-protecting: even
   if a caller spoofs `token_endpoint`, an unverified host ⇒ `"false"` ⇒ untrusted egress. The only
   way to get static IP is a `token_endpoint` under a domain the workspace has actually verified.
3. **Fail closed — never direct.** If static IP is requested but unavailable, use untrusted egress;
   if untrusted egress is also unavailable, **return a provider error**. MCP token traffic must
   never fall back to an un-proxied (`reqwest::Client::new()`) client in production.
4. **Token activity is verified-domain-only — it does NOT honor the legacy
   `isWorkspaceUsingStaticIP` workspace exception.** `front`'s tool-call routing also static-IPs a
   single hard-coded legacy workspace (`front/lib/misc.ts:4-8`). Token activity intentionally does
   not — it is the stricter "verified domain only" rule. This is **not** a regression (today all MCP
   token traffic uses untrusted egress), but it is a divergence from tool-call routing. **Requires
   `@spolu` sign-off** per the review note on `misc.ts`.
5. **Freshness = recompute *before* the token fetch, TTL-gated (~5 min).** On the MCP token path,
   `front` recomputes the flag from the connection's `token_endpoint` and PATCHes `core` **before**
   calling `access_token` (which may refresh). A per-connection ~5-min check-TTL bounds the DB cost.
   Honest consistency model: a domain un-verification takes effect within ~5 min; a refresh that
   fires inside an already-checked TTL window may use the prior value once (see "Consistency model"
   below). This is the bounded "within the cache window" guarantee — strictly better than v1, which
   corrected only *after* the refresh.

## Risks & mitigations (read before coding)

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Caller overrides the decision via `extraConfig`** (set `use_static_ip_proxy:"true"`, or spoof `token_endpoint`). | **Critical** | Recompute the flag from the *final* persisted `token_endpoint` and write it **last**; never trust an inbound flag; strip caller overrides of `token_endpoint`/`client_id`/`authorization_endpoint` in the personal branch (Part 1). |
| **Direct egress on proxy build failure / missing env** defeats the invariant. | **Critical** | Fail-closed `client_for` returning `Result`; `try_build_*` helpers return `Option` (None when unconfigured/unbuildable); error if no proxy (Part 2/3). |
| **Freshness applied after the refresh it protects.** | **High** | Recompute + PATCH **before** the `access_token` fetch, TTL-gated (Part 4). |
| **Redirects bypass the host gate** (`reqwest` follows 3xx by default). | **High** | `redirect(Policy::none())` on MCP token clients (Part 2). |
| **Boolean vs string metadata** would crash `core` deserialization. | **Critical** | String `"true"`/`"false"` end-to-end; `core` field `Option<String>`, parsed `== Some("true")`. |
| **Import cycle** (`mcp_authentication.ts` must not import `mcp.ts`). | Medium | Helper lives in leaf module `workspace_has_domains.ts`. |
| **`update_metadata` lockless RMW race** across all metadata writers (finalize **and** the existing credential PATCH). | Low | Writes are idempotent / disjoint keys; optionally `reload()` under handler. |
| **`lazy_static` env capture** makes set/unset proxy tests order-dependent. | Medium | Extract pure config-parsing/building helpers taking explicit values; test those, not env toggling. |

## The rule (do not violate)

Use the static IP proxy to reach a target **only when Dust controls the target domain, or the user
has proved they control it (a verified domain)**. Everything else uses untrusted egress. The static
IP is an allowlisted, documented egress; pointing it at arbitrary domains dilutes that guarantee.

For MCP token activity the egress target is the OAuth **`token_endpoint`** (both `finalize` and
`refresh` POST to it), which is discovered from the untrusted remote server via RFC 8414 — so the
verified-domain check, applied to the actual `token_endpoint` host, is the safeguard.

## `mcp` and `mcp_static` are both covered automatically

- `front`: `MCPOAuthStaticOAuthProvider` (`front/lib/api/oauth/providers/mcp_static.ts`) **extends**
  `MCPOAuthProvider`, inheriting `getUpdatedExtraConfig` (Part 1).
- `core`: `MCPStaticConnectionProvider` (`core/src/oauth/providers/mcp_static.rs`) **delegates**
  `finalize`/`refresh` to the inner `MCPConnectionProvider`, inheriting proxy selection (Part 3).

> `mcp_static`'s "static" = static/pre-registered OAuth credentials (admin supplies
> client_id/secret instead of discovery). **Unrelated** to the static *IP* proxy.

---

## Current state

- **Static IP proxy** = default `Provider::reqwest_client()` (`core/src/oauth/connection.rs:195`,
  env `PROXY_HOST/PORT/USER_NAME/PASSWORD`). Live in prod (Salesforce, Snowflake). **Leave its
  behavior unchanged** (PROXY_* unset ⇒ direct is intentional for those providers).
- **Untrusted egress proxy** = `create_untrusted_egress_client_builder()`
  (`core/src/http/proxy_client.rs:27`, env `UNTRUSTED_EGRESS_PROXY_HOST/PORT`). Returns a *plain*
  (un-proxied) builder when unset — so its mere use does **not** prove a request is proxied.
- MCP overrides `reqwest_client()` to unconditionally use untrusted egress (`mcp.rs:171`).
- `isHostUnderVerifiedDomain(auth, host)` (`front/lib/api/workspace_has_domains.ts:13`) — reuse.
- `getConnectionForMCPServer(auth, ...)` (`front/lib/actions/mcp_authentication.ts:16`) — has
  `auth`, resolves the connection, returns `{ connection, access_token, ... }`. Primary MCP token
  path. **Audit for other direct callers of `getOAuthConnectionAccessToken`** (e.g.
  `front/lib/api/mcp/servers.ts`) — see Part 4e.
- `getOAuthConnectionAccessToken({ config, logger, connectionId })`
  (`front/lib/api/oauth_access_token.ts:29`) — generic, no `auth`, 5-min process-local cache.

---

## Implementation

### Part 1 — `front`: compute the flag authoritatively and stamp it at creation

**Representation (critical):** OAuth metadata is string-valued by convention —
`ExtraConfigType = z.record(z.string(), z.string())` (`front/types/oauth/lib.ts:8`) and
`OAuthConnectionType.metadata: Record<string, string>` (`lib.ts:486`). The flag MUST be the string
`"true"`/`"false"`. A boolean is a type error here, and `core` deserializing a `bool` from `"true"`
fails (`serde_json` does not coerce) → `InvalidMetadataError` on every MCP finalize/refresh.

**Helper — place in the leaf module `front/lib/api/workspace_has_domains.ts`** (NOT `mcp.ts`;
`mcp_authentication.ts` reuses it and must stay free of `mcp.ts` imports to avoid a cycle):

```ts
// returns a boolean; callers stringify when storing in metadata
export async function computeUseStaticIpProxy(
  auth: Authenticator,
  tokenEndpoint: string | undefined
): Promise<boolean> {
  if (!tokenEndpoint) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(tokenEndpoint);
  } catch {
    return false;
  }
  // Static IP egress requires HTTPS — an http:// token endpoint is never eligible.
  if (url.protocol !== "https:") {
    return false;
  }
  return isHostUnderVerifiedDomain(auth, url.hostname);
}
```

**Stamp in `MCPOAuthProvider.getUpdatedExtraConfig`** (`front/lib/api/oauth/providers/mcp.ts`).
Critical ordering: build the final metadata first, **strip any caller-supplied
`use_static_ip_proxy`**, then compute from the *final* `token_endpoint` and write the flag last.

> Why ordering matters: `isExtraConfigValid` for personal actions returns `true` as soon as
> `mcp_server_id` is present, and the code ships the **original** `extraConfig` to metadata (it only
> does `safeParse(...).success`; it does not use the parsed/stripped result). So adding a schema
> field does NOT sanitize at runtime — you must overwrite explicitly.

- **`platform_actions`** (`mcp.ts:262-273`):
  ```ts
  const finalConfig = { ...restConfig, code_challenge, code_verifier };
  delete finalConfig.use_static_ip_proxy; // never trust an inbound value
  finalConfig.use_static_ip_proxy = String(
    await computeUseStaticIpProxy(auth, finalConfig.token_endpoint)
  );
  return finalConfig;
  ```
- **`personal_actions`** (`mcp.ts:249-260`): the authoritative `token_endpoint` /
  `authorization_endpoint` / `client_id` come from the reused **workspace** connection — they must
  win over any caller override. Spread `...restConfig` **first**, then set those authoritative
  fields and the computed flag last (whitelist only genuinely user-controlled keys like `scope` if
  needed). Compute the flag from the workspace connection's `token_endpoint`.

**Schema** (`front`): require the field for newly-created connections so a missing stamp is caught
at validation (keep `core` lenient for old connections):

```ts
const MCPMetadataSchema = BaseMCPMetadataSchema.extend({
  code_challenge: z.string(),
  code_verifier: z.string(),
  token_endpoint_auth_method: z.string().optional(),
  use_static_ip_proxy: z.enum(["true", "false"]), // required string for new connections
});
```

### Part 2 — `core`: fail-closed proxy builders (no direct egress, no redirects)

**File:** `core/src/http/proxy_client.rs`. Add MCP-oriented helpers that (a) only return a client
when a proxy is actually attached, and (b) disable redirects. Do **not** change the existing
`create_untrusted_egress_client_builder` callers or the `connection.rs:195` default.

```rust
lazy_static! {
    static ref STATIC_IP_PROXY: Option<String> = {
        match (env::var("PROXY_HOST"), env::var("PROXY_PORT"),
               env::var("PROXY_USER_NAME"), env::var("PROXY_USER_PASSWORD")) {
            (Ok(h), Ok(p), Ok(u), Ok(pw)) => Some(format!("http://{}:{}@{}:{}", u, pw, h, p)),
            _ => None,
        }
    };
}

// Pure builder taking an explicit proxy URL — unit-testable without env (avoids lazy_static capture).
fn build_proxied_no_redirect(proxy_url: &str) -> Option<reqwest::Client> {
    let proxy = reqwest::Proxy::all(proxy_url).map_err(|e| error!(error=?e, "bad proxy url")).ok()?;
    reqwest::Client::builder()
        .proxy(proxy)
        .redirect(reqwest::redirect::Policy::none()) // token endpoints must not redirect egress
        .build()
        .map_err(|e| error!(error=?e, "client build failed")).ok()
}

/// Some(client) only if static IP is configured AND a proxied client was built.
pub fn try_build_static_ip_client() -> Option<reqwest::Client> {
    build_proxied_no_redirect(STATIC_IP_PROXY.as_ref()?)
}

/// Some(client) only if untrusted egress is configured AND a proxied client was built.
pub fn try_build_untrusted_egress_client() -> Option<reqwest::Client> {
    build_proxied_no_redirect(untrusted_egress_proxy_url()?) // expose the URL like STATIC_IP_PROXY
}
```

(Expose the untrusted-egress proxy URL the same way `STATIC_IP_PROXY` is exposed, so
`try_build_untrusted_egress_client` can reuse `build_proxied_no_redirect`.)

### Part 3 — `core`: read the flag and select the proxy for MCP (fail-closed)

**File:** `core/src/oauth/providers/mcp.rs`

1. Metadata field as `Option<String>` (string `"true"`/`"false"`; see Part 1):
   ```rust
   #[serde(default)]
   pub use_static_ip_proxy: Option<String>, // None when absent
   ```
   Derive the bool where metadata is parsed:
   ```rust
   let use_static_ip = metadata.use_static_ip_proxy.as_deref() == Some("true");
   ```
   > Do NOT type as `bool` — `serde` will not coerce the string `"true"`.

2. Fail-closed client selector returning a `Result`:
   ```rust
   fn client_for(&self, use_static_ip: bool) -> Result<reqwest::Client, ProviderError> {
       if use_static_ip {
           if let Some(c) = try_build_static_ip_client() {
               return Ok(c);
           }
           warn!("static IP requested but unavailable; falling back to untrusted egress");
       }
       if let Some(c) = try_build_untrusted_egress_client() {
           return Ok(c);
       }
       // Optional dev-only escape hatch behind an explicit env, off in prod.
       Err(ProviderError::from(anyhow!(
           "no egress proxy available for MCP OAuth token request"
       )))
   }
   ```

3. Use it in `finalize` and `refresh` (both return `Result<_, ProviderError>`, so propagate the
   error with `?`):
   - `finalize` (`mcp.rs:182`): metadata parsed at `mcp.rs:191`; replace
     `self.reqwest_client().post(...)` (`mcp.rs:222`) with `self.client_for(use_static_ip)?.post(...)`.
   - `refresh` (`mcp.rs:277`): metadata parsed at `mcp.rs:290`. Build the client once via
     `self.client_for(use_static_ip)?` and pass `&reqwest::Client` into `execute_refresh_request`
     (replacing `self.reqwest_client()` at `mcp.rs:145`), used for both the initial attempt and the
     retry.

4. Remove (or leave unused) MCP's `reqwest_client()` override — it must not be a back door to direct
   egress. All MCP token egress goes through `client_for`. If the trait requires an impl, have it
   delegate to `try_build_untrusted_egress_client()` and `expect`/error rather than
   `reqwest::Client::new()`.

### Part 4 — freshness: recompute and PATCH **before** the token fetch (TTL-gated)

Goal: the fresh decision must reach `core` **before** `Connection::access_token()` can refresh
(`core/src/oauth/connection.rs:829-857`). v1 corrected only after the refresh — fixed here.

**4a — `core`: narrow metadata PATCH endpoint.**
**File:** `core/src/oauth/app.rs` (route near `:539`, alongside the existing
`connections_update_credential` PATCH at `:543`).

`PATCH /connections/{connection_id}/metadata`, **narrow** payload (only the flag):

```rust
#[derive(Deserialize)]
struct ConnectionUpdateMetadataPayload { use_static_ip_proxy: bool }
// handler: retrieve connection; GUARD provider is Mcp | McpStatic (else 400);
// persist the STRING form so it matches creation-stamped connections + core's Option<String>:
let mut extra = serde_json::Map::new();
extra.insert("use_static_ip_proxy".into(),
    serde_json::Value::String(payload.use_static_ip_proxy.to_string()));
connection.update_metadata(store, extra).await?;
```

Response contract: **define it explicitly** — return the full updated metadata, i.e. the same shape
as `GET /connections/{id}/metadata` (`connections_metadata`, `app.rs:539`), NOT the
credential-PATCH shape (which returns only `connection_id`). Type `OAuthAPI.updateConnectionMetadata`
to that response.

Concurrency: `Connection::update_metadata` (`connection.rs:1012`) is a lockless full-blob RMW, and
it is **also** used by the credential PATCH (`connections_update_credential`). Writers touch disjoint
keys and our write is idempotent, so last-write-wins is acceptable; optionally `reload()` inside the
handler before merging.

**4b — `front`: OAuthAPI method.**
**File:** `front/types/oauth/oauth_api.ts`. Add
`updateConnectionMetadata({ connectionId, useStaticIpProxy }): Promise<Result<..., OAuthAPIError>>`
that `PATCH`es `/connections/{connectionId}/metadata` with `{ use_static_ip_proxy }`. Like the other
methods it returns `Err` (does not throw) on non-2xx.

**4c — `front`: per-connection check TTL.**
**File:** `front/lib/actions/mcp_authentication.ts` (or a small colocated module). A
module-level `Map<connectionId, lastCheckedMs>` with a ~5-min TTL, to bound how often the
verified-domain DB lookup + PATCH run. Export a reset for tests.

**4d — `front`: recompute + PATCH before the token fetch.**
In `getConnectionForMCPServer`, **before** `getOAuthConnectionAccessToken`:

```ts
const connectionId = connection.value.connectionId;
if (shouldCheckFreshness(connectionId)) { // TTL-gated (4c)
  // Refresh-free read of current metadata (does NOT trigger a core refresh).
  const metaRes = await new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger)
    .getConnectionMetadata({ connectionId });
  if (metaRes.isOk()) {
    const md = metaRes.value.connection.metadata; // Record<string,string>
    const desired = await computeUseStaticIpProxy(auth, md.token_endpoint);
    const stored = md.use_static_ip_proxy === "true";
    if (stored !== desired) {
      const upd = await new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger)
        .updateConnectionMetadata({ connectionId, useStaticIpProxy: desired });
      if (upd.isErr()) {
        localLogger.warn({ error: upd.error }, "Failed to sync use_static_ip_proxy");
      }
    }
    markChecked(connectionId);
  }
}

const tokenResult = await getOAuthConnectionAccessToken({ ... }); // refresh now reads fresh metadata
```

Notes:
- The recompute/PATCH runs **before** the token fetch, so any refresh inside `access_token` reads
  the corrected metadata.
- TTL-gated, so the extra `getConnectionMetadata` + DB lookup happen ≤ once per ~5 min per
  connection per pod — not on every tool call.
- **Check the `Result`** of `updateConnectionMetadata` (it returns `Err`, never throws — a v1 bug
  where `.catch()` would not fire on a 404).
- Backfill: pre-PR connections (no flag) get corrected on first check.

**4e — cover all MCP token paths.** The freshness logic must wrap **every** MCP access-token
fetch, not just `getConnectionForMCPServer`. Audit direct callers of `getOAuthConnectionAccessToken`
(e.g. `front/lib/api/mcp/servers.ts`) and either route them through a single MCP-aware token helper
that embeds 4d, or replicate the pre-fetch check. Prefer **one** shared MCP token helper.

### Consistency model (state this honestly; do not over-claim)

A domain un-verification takes effect on the next freshness check, i.e. within ~5 min (the check
TTL). Because the check runs **before** the token fetch, the corrected flag is in place before the
refresh that fetch may trigger. Residual window: if a domain is un-verified *inside* an
already-validated TTL window and a refresh fires in that same window, that one refresh may use the
prior value. This is bounded (~5 min) and low-severity (it is an egress-IP choice; both options are
proxies). If a hard "zero stale refreshes" guarantee is ever required, pass the decision as a hint
on the `access_token` call and apply it under the connection lock in `access_token_locked` before
refreshing — out of scope here.

---

## Testing

- **`core`:**
  - `MCPConnectionMetadata` deserializes with `use_static_ip_proxy` as the **string** `"true"` /
    `"false"` and when absent (⇒ `None` ⇒ false). Regression guard: the field is `Option<String>`,
    not `bool`.
  - `build_proxied_no_redirect` (pure, explicit URL): builds a proxied client; sets no-redirect
    policy; returns `None` on a malformed URL. Test the **pure** helpers, not env toggling —
    `lazy_static` reads env once per process, so set/unset-in-the-same-suite tests are unreliable.
  - `client_for(true)` with static unavailable ⇒ untrusted client; with neither ⇒ **`Err`** (never
    `reqwest::Client::new()`); `client_for(false)` ⇒ untrusted client.
  - `PATCH /connections/{id}/metadata` persists the **string**, updates for `mcp`/`mcp_static`,
    **rejects** other providers, and returns the full metadata shape. Note: `core`'s OAuth test
    util (`core/src/oauth/tests/utils.rs`) has no `PATCH` helper — add one (or use `TestServer`).
- **`front`:**
  - `computeUseStaticIpProxy`: `true` only for an HTTPS `token_endpoint` whose host is under a
    verified domain; `false` for unverified, IP-literal, or `http://` endpoints.
  - **Override defense:** caller passes `use_static_ip_proxy:"true"` (and/or a spoofed
    `token_endpoint`) for an unverified endpoint → stored value is `"false"`. Same for the personal
    branch attempting to override `token_endpoint`/`client_id`/`authorization_endpoint`.
  - Freshness runs **before** the token fetch, is TTL-gated (no DB lookup on cache-warm repeat
    calls), checks the PATCH `Result`, and covers the `front/lib/api/mcp/servers.ts` path. Reset the
    check-TTL map and the token cache (`invalidateOAuthConnectionAccessTokenCache`) between tests.
- Typecheck: `front` — `nvm use && NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit`;
  `core` — `cargo check` / `cargo clippy`. Format: `npm run format:changed`.
- Swagger: internal OAuthAPI→`core` plumbing, not a `front` public/private HTTP route, so
  `[BACK14]` does not apply. Confirm no `front/pages/api` route was added.

---

## Deployment / config

- **Deploy `core` first** (hard requirement): new `front` calls the new PATCH endpoint and expects
  the no-redirect/fail-closed `core` behavior. Old `core` would 404 the PATCH (handled as `Err` +
  warn) but would also still egress MCP token traffic via untrusted egress unconditionally.
- Static-IP `PROXY_*` env vars are already set on the `oauth`/`core` service (Salesforce/Snowflake
  use them). **Verify** they are present; if absent, `client_for(true)` falls back to untrusted
  egress + warns (the static IP silently never engages).
- No DB migration: the flag lives in the connection `metadata` JSON. Note: connection metadata is
  **plain JSONB** — only secrets/tokens are encrypted. (Do not describe the flag as "encrypted".)

---

## File reference

| File | Change |
| --- | --- |
| `front/lib/api/workspace_has_domains.ts` | **add/export `computeUseStaticIpProxy`** (HTTPS-only, verified-domain check) |
| `front/lib/api/oauth/providers/mcp.ts` | import helper; stamp `use_static_ip_proxy` authoritatively (strip inbound, compute from final `token_endpoint`, write last); require field in `MCPMetadataSchema` |
| `front/lib/api/oauth/providers/mcp_static.ts` | none (inherits) |
| `front/lib/api/oauth_access_token.ts` | reset/clear cache helper used in tests (no behavior change required) |
| `front/types/oauth/oauth_api.ts` | add `updateConnectionMetadata` (PATCH), `Result`-returning, typed to the metadata response |
| `front/lib/actions/mcp_authentication.ts` | per-connection check TTL + pre-fetch recompute/PATCH in `getConnectionForMCPServer`; check the `Result` |
| `front/lib/api/mcp/servers.ts` (+ any other direct callers) | route MCP token fetches through the shared MCP-aware helper so freshness applies everywhere (Part 4e) |
| `core/src/http/proxy_client.rs` | `STATIC_IP_PROXY`, pure `build_proxied_no_redirect`, `try_build_static_ip_client`, `try_build_untrusted_egress_client` (no-redirect; `Option`/fail-closed) |
| `core/src/oauth/providers/mcp.rs` | `use_static_ip_proxy: Option<String>`; fail-closed `client_for`; use in `finalize`/`refresh` (+ thread into `execute_refresh_request`); drop the direct-egress override |
| `core/src/oauth/providers/mcp_static.rs` | none (delegates) |
| `core/src/oauth/app.rs` | `PATCH /connections/{id}/metadata` (narrow, mcp/mcp_static only, returns full metadata) |
| `core/src/oauth/tests/utils.rs` | add a `PATCH` test helper |
| `core/src/oauth/connection.rs` | leave `:195` default trait impl unchanged |

## Sign-offs needed before merge

- **`@spolu`** on Decision 4 (token activity intentionally ignores the legacy
  `isWorkspaceUsingStaticIP` workspace; `front/lib/misc.ts:4-8`).
