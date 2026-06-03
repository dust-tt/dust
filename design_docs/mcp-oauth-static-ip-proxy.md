# Static IP proxy for MCP OAuth token activity in `core`

Research + proposal for issue [tasks#8294](https://github.com/dust-tt/tasks/issues/8294),
following from PR [dust#13304](https://github.com/dust-tt/dust/pull/13304) ("use untrusted
egress proxy for oauth token endpoints").

## The rule

We use the **static IP proxy** to reach a target **only when (a) Dust controls the target domain,
or (b) the user has proved they control it (a verified domain)**. For anything else — arbitrary,
user-provided URLs — we use the **untrusted egress proxy**. The static IP is an allowlisted,
documented egress; pointing it at arbitrary domains would dilute that guarantee.

## TL;DR

- `front` routes **regular MCP tool-call traffic** through the **static IP proxy** when the
  target host is a **verified domain** of the calling workspace, and through the **untrusted
  egress proxy** otherwise.
- `core` (the `oauth` service) **already has a static-IP proxy code path** — it is the *default*
  `Provider::reqwest_client()` trait impl (`core/src/oauth/connection.rs:195`, env
  `PROXY_HOST/PORT/USER_NAME/PASSWORD`) and is **live in production**: Salesforce and Snowflake
  OAuth use it because their target domains are controlled/statically validated (e.g.
  `*.salesforce.com`). PR #13304 added the **untrusted-egress builder as an opt-in override** for
  the three providers that hit arbitrary user URLs: **MCP, Databricks, UKG Ready**.
- The gap is narrow and specific to **MCP**: `MCPConnectionProvider::reqwest_client()`
  (`core/src/oauth/providers/mcp.rs:171`) **unconditionally** picks the untrusted-egress builder.
  It never branches to the (already-existing, already-configured) static-IP path when the token
  endpoint is on a workspace-verified domain. So the issue's claim is correct, but the fix is
  *not* "add static-IP support to core" — it is "let MCP choose between the two builders core
  already has, per connection."
- **Recommended**: stamp a persisted `use_static_ip_proxy` flag into the MCP connection metadata
  (`front` decides, `core` consumes), evaluated against the **`token_endpoint` host**, re-stamped
  on each finalize. In `core`, MCP picks the static-IP builder when the flag is set, untrusted
  egress otherwise.

---

## 1. How the verified-domain → static-IP mechanism works today (`front`)

This applies to **regular MCP tool-call activity**: when `front` opens a connection to a remote
MCP server to list or call tools.

**Decision point** — `front/lib/actions/mcp_metadata.ts`, `createMCPProxyConfig(auth, host)`:

```ts
const useStaticIP =
  isWorkspaceUsingStaticIP(workspace) ||              // legacy hardcoded hash check
  (await isHostUnderVerifiedDomain(auth, host));      // domain-verification check

if (useStaticIP) { /* static IP proxy */ }
else            { /* untrusted egress proxy, else direct */ }
```

Supporting pieces:

| Concern | Location |
| --- | --- |
| Proxy decision for MCP | `front/lib/actions/mcp_metadata.ts` — `createMCPProxyConfig()` |
| Verified-domain check | `front/lib/api/workspace_has_domains.ts:13` — `isHostUnderVerifiedDomain()` (rejects IP literals, loads `workspace.getVerifiedDomains()`, matches host) |
| Domain matching | `front/types/shared/utils/url_utils.ts` — `isHostUnderDomain()` (exact or subdomain) |
| Verified-domains table | `workspace_has_domains`, populated from WorkOS events in `front/temporal/workos_events_queue/activities.ts` (`organization_domain.verified`, …) |
| Static-IP proxy agent | `front/lib/egress/server.ts` — `getStaticIPProxyAgent()` (env: `PROXY_HOST/PROXY_PORT/PROXY_USER_NAME/PROXY_USER_PASSWORD`) |
| Proxy injection into MCP SDK | `front/lib/actions/mcp_metadata.ts` — `connectToMCPServer()` / `connectToRemoteMCPServer()` |
| Legacy hardcoded workspace check | `front/lib/misc.ts` — `isWorkspaceUsingStaticIP()` (blake3 hash) |

**Key subtlety:** the host evaluated is the **MCP server URL hostname** (`url.hostname` of the
remote MCP server), *not* the OAuth `token_endpoint` host.

**Security rationale** (fontanierh on the issue): the static IP is an allowlisted, trusted egress.
We only point it at domains the customer has verified — never arbitrary destinations — otherwise we
dilute the security guarantee associated with the static IP.

---

## 2. What `core` / `oauth` does today — and the actual gap

"oauth" = the `core` Rust OAuth service (`core/src/oauth/...`), responsible for the "token activity"
(finalize + refresh of access tokens).

`core` has **two** proxy strategies, selected per provider via the `Provider` trait:

**(a) Static-IP proxy — the DEFAULT `Provider::reqwest_client()` trait impl**
(`core/src/oauth/connection.rs:195`), using `PROXY_HOST/PORT/USER_NAME/PASSWORD`:

```rust
fn reqwest_client(&self) -> reqwest::Client {
    if let (Ok(proxy_host), Ok(proxy_port), Ok(proxy_user_name), Ok(proxy_user_password)) = (
        env::var("PROXY_HOST"), env::var("PROXY_PORT"),
        env::var("PROXY_USER_NAME"), env::var("PROXY_USER_PASSWORD"),
    ) { /* build reqwest::Client with this proxy */ }
    else { reqwest::Client::new() }
}
```

This is **already configured and live in production**. Providers whose target domain Dust
controls or statically validates use it by *not overriding* the default — e.g. **Salesforce**
(`core/src/oauth/providers/salesforce.rs:63`: "Salesforce OAuth requests must use the static-IP
proxy (default trait impl) — customers with IP-restricted Salesforce orgs allowlist Dust's
documented static egress IPs. Instance URLs are validated to `*.salesforce.com`…") and
**Snowflake** (`core/src/oauth/providers/snowflake.rs:128`).

**(b) Untrusted egress proxy — opt-in OVERRIDE** via
`create_untrusted_egress_client_builder()` (`core/src/http/proxy_client.rs:27`, env
`UNTRUSTED_EGRESS_PROXY_HOST/PORT`). Introduced by PR #13304 and used by exactly the three
providers that hit **arbitrary, user-provided URLs**: **MCP** (`mcp.rs:171`), **Databricks**
(`databricks.rs:57`), **UKG Ready** (`ukg_ready.rs:82`).

So the static-IP path is *not* missing from `core`. The gap is specific to MCP:

```rust
// core/src/oauth/providers/mcp.rs:171
fn reqwest_client(&self) -> reqwest::Client {
    // MCP provider makes requests to user-provided URLs, so we use the untrusted egress proxy.
    match create_untrusted_egress_client_builder().build() { /* ... */ }
}
```

MCP **unconditionally** chooses untrusted egress. Unlike Salesforce/Snowflake, an MCP target is not
a statically-known domain — it is whatever the customer configured. The missing logic is the
*dynamic* equivalent of the rule: when the token endpoint sits on a **workspace-verified domain**,
MCP should use the static-IP path (default trait impl); otherwise untrusted egress. That
per-connection signal is what `core` lacks.

**Resulting inconsistency:** a verified-domain MCP server's *tool calls* leave from the static IP
(decided in `front`), but its OAuth *token finalize/refresh* leave from the untrusted-egress IP. If a
customer IP-allowlists Dust's static IP for their server (including its token endpoint), token
refresh can be silently blocked; more fundamentally, the verified-domain trust model is not honored
for MCP token activity.

**Context `core` has today:**

- `Connection.metadata` JSON — for MCP this is `MCPConnectionMetadata` in
  `core/src/oauth/providers/mcp.rs:47`: `client_id`, `token_endpoint`, `authorization_endpoint`,
  `code_verifier`, `code_challenge`, `scope`, `resource`, `token_endpoint_auth_method`.
- the related `Credential`, which carries `workspace_id` + `user_id`
  (`core/src/oauth/credential.rs:85`).

**Context `core` does NOT have:**

- the workspace's verified-domain list (lives only in `front`'s Postgres `workspace_has_domains`).
- the MCP server URL (lives in `front`'s `RemoteMCPServerModel`, never sent to `core`).

---

## 3. Options

The static-IP proxy and the untrusted-egress proxy **both already exist and are configured in
`core`** (see §2). No new proxy infrastructure is needed. The work is (1) let the MCP provider
*choose* between the two builders per connection, and (2) get the per-connection decision to
`core`. The options below differ only in *where* the verified-domain decision is made and *how* it
reaches `core`.

A shared refactor common to all options: extract `core`'s default static-IP client logic
(`connection.rs:195`) into a `create_static_ip_client_builder()` helper alongside
`create_untrusted_egress_client_builder()` in `proxy_client.rs`, so MCP can pick either explicitly.

### Option A — Stamp the decision into connection metadata (front decides, core consumes) ✅ recommended

`front` already runs `isHostUnderVerifiedDomain` for tool calls. When it **creates/finalizes** the
MCP connection, have it compute the decision and persist a flag (e.g. `use_static_ip_proxy: true`)
into the connection metadata sent to `core`'s `/connections` payload.

- `core` adds the field to `MCPConnectionMetadata`. In `finalize`/`refresh`, MCP picks the
  static-IP builder when the flag is set and the untrusted-egress builder otherwise — instead of
  today's unconditional untrusted-egress choice. (Since the flag lives in `connection.metadata`,
  the selection happens where the connection is in scope; the no-arg `reqwest_client()` trait
  method is bypassed or threaded the flag.)
- **Pros:** matches the existing metadata-driven pattern (cf. `databricks_workspace_url` in
  `core/src/oauth/providers/databricks.rs`); reuses both already-live proxy paths; no new
  cross-service coupling; works for lazy refresh weeks later because the flag is persisted on the
  connection; `front` stays the single authority on verified domains; degrades safely (absent/false
  ⇒ untrusted egress).
- **Cons:** decision frozen at connection-creation time. If a workspace later *un*-verifies a
  domain, the flag goes stale and `core` keeps using the static IP — the exact security degradation
  we want to avoid. **Mitigations:** re-stamp on every `finalize` and on any front-driven re-auth;
  and/or push an updated flag (Option B). Verified domains change rarely, so staleness risk is low
  but non-zero.

### Option B — Push the decision on each access-token call (front decides per request)

Token refresh is **lazy inside `core`'s `access_token`**, and `front` is always in the loop (it
calls `/connections/{id}/access_token`, with a 5-min cache, `front/lib/api/oauth_access_token.ts`).
`front` can pass a fresh `use_static_ip` hint on that call (and on `finalize`); `core` uses it for
any refresh triggered by that request.

- **Pros:** always fresh; single source of truth in `front`; no replication.
- **Cons:** changes the access-token API contract (today a bodyless `GET` with only `provider`);
  per-request plumbing. Only safe because there is no `core`-internal background refresh today — if
  one is added, it wouldn't carry the hint. Best combined with Option A as the persisted fallback.

### Option C — Core calls back to front ("is host X verified for workspace W?")

`core` has `workspace_id` (via credential) + the `token_endpoint` host; it could query a new
internal `front` endpoint.

- **Pros:** always fresh; `front` remains authoritative.
- **Cons:** reverses the normal dependency (front→core), adds latency / a failure mode on a hot
  token path, requires a new authenticated internal endpoint. Not worth it for this narrow need.

### Option D — Replicate verified domains into core's store

Sync `workspace_has_domains` into the oauth DB so `core` checks locally.

- **Cons:** heavy infra (new table + sync pipeline from WorkOS/front) for a single boolean decision.
  Overkill; not recommended.

---

## 4. Cross-cutting decisions (apply to any option)

1. **Which host to evaluate.** `front`'s current check is on the *MCP server* hostname, but `core`
   actually egresses to the **`token_endpoint` (and `authorization_endpoint`) host**, which may be a
   *different* domain. The `token_endpoint` is **discovered from the (untrusted) remote server via
   RFC 8414** (`front/lib/resources/remote_mcp_servers_resource.ts` — `discoverOAuthMetadata`). So a
   verified-domain MCP server could advertise a `token_endpoint` pointing at an arbitrary
   third-party host. To preserve the static-IP trust guarantee, the static-IP decision for token
   traffic must be evaluated against the **actual `token_endpoint` host**, not merely "the server is
   verified." This is the most important security detail.

2. **Recommendation.** **Option A as the baseline** — a persisted `use_static_ip_proxy` flag stamped
   by `front` after running `isHostUnderVerifiedDomain` on the `token_endpoint` /
   `authorization_endpoint` host, **re-stamped on each finalize** — optionally **augmented with
   Option B's push** on `access_token` for freshness. No new proxy infra is needed in `core` (both
   the static-IP and untrusted-egress builders already exist and are configured); MCP just selects
   between them per connection. This keeps `front` authoritative, fits the existing
   metadata-driven pattern, and degrades safely (default = untrusted egress).

---

## Appendix — key files

- `front/lib/actions/mcp_metadata.ts` — `createMCPProxyConfig`, `connectToMCPServer`,
  `connectToRemoteMCPServer`
- `front/lib/api/workspace_has_domains.ts` — `isHostUnderVerifiedDomain`
- `front/lib/egress/server.ts` — static IP + untrusted egress agents/fetch
- `front/lib/api/oauth/providers/mcp.ts` — front-side MCP OAuth flow / metadata sent to core
- `front/lib/resources/remote_mcp_servers_resource.ts` — `discoverOAuthMetadata` (RFC 8414)
- `front/lib/api/oauth_access_token.ts` — `getOAuthConnectionAccessToken` (5-min cache)
- `core/src/oauth/connection.rs:195` — **default `Provider::reqwest_client()` = static-IP proxy**
  (`PROXY_HOST/PORT/USER_NAME/PASSWORD`)
- `core/src/oauth/providers/salesforce.rs:63`, `core/src/oauth/providers/snowflake.rs:128` —
  providers that use the default static-IP path (target domain controlled/validated)
- `core/src/oauth/providers/mcp.rs` — `MCPConnectionMetadata`, `reqwest_client` (overrides to
  untrusted egress unconditionally — the gap), `finalize`, `refresh`
- `core/src/oauth/providers/databricks.rs:57`, `core/src/oauth/providers/ukg_ready.rs:82` — other
  providers that override to untrusted egress (arbitrary user URLs)
- `core/src/http/proxy_client.rs` — `create_untrusted_egress_client_builder` (a
  `create_static_ip_client_builder` helper would be extracted here)
- `core/src/oauth/credential.rs:85` — `CredentialMetadata` (`workspace_id`, `user_id`)
- `core/src/oauth/app.rs` — oauth HTTP handlers (`connections_finalize`, `connections_access_token`)
