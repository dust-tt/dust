# Egress Proxy

`egress-proxy` is the first Rust service for enforcing Dust sandbox outbound network policy.

PR 1 intentionally implements only the deployable skeleton:

- TLS configuration loading and listener binding for the future sandbox forwarder protocol.
- v1 binary handshake parsing.
- HS256 JWT validation.
- temporary process-wide domain allowlist.
- `/healthz` process health endpoint.

It does not accept forwarder connections, resolve DNS, apply SSRF checks, connect upstream, relay
traffic, or read GCS policy files yet. Until the GCS policy provider lands, every sandbox uses
`EGRESS_PROXY_ALLOWED_DOMAINS`.

Missing behavior is intentionally left as explicit TODOs in the crate so the next PRs stay
reviewable:

- PR 2: protocol-compliant proxying, including DNS, SSRF checks, upstream connection, and byte
  forwarding.
- PR 3: production lifecycle hardening, including listener supervision and graceful connection
  draining.
- Nice-to-have: replace the OpenSSL-based test certificate helper with `rcgen`, add explicit JWT
  clock-skew leeway, and add configurable idle timeout policy for established tunnels.

## Configuration

```text
EGRESS_PROXY_LISTEN_ADDR=0.0.0.0:4443
EGRESS_PROXY_HEALTH_ADDR=0.0.0.0:8080
EGRESS_PROXY_TLS_CERT=/etc/certs/tls.crt
EGRESS_PROXY_TLS_KEY=/etc/certs/tls.key
EGRESS_PROXY_JWT_SECRET=<shared with front>
EGRESS_PROXY_ALLOWED_DOMAINS=example.com,*.example.com
EGRESS_PROXY_ENV=production
EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK=
```

`EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK=1` is test-only and startup rejects it unless
`EGRESS_PROXY_ENV=test`.

## Local Checks

```bash
cd egress-proxy
cargo fmt --all -- --check
cargo build
cargo test --all
```
