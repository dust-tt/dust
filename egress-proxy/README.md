# Egress Proxy

`egress-proxy` is the first Rust service for enforcing Dust sandbox outbound network policy.

Current functionality:

- `/healthz` process health endpoint.
- TLS certificate and private-key loading.
- startup validation for proxy config, TLS assets, JWT secret, and GCS policy bucket.
- TLS-terminated proxy listener for sandbox forwarder connections.
- handshake parsing, JWT validation, GCS-backed per-sandbox/workspace policy enforcement, and
  global DoH blocklist enforcement.
- server-side DNS resolution, SSRF checks on resolved addresses, upstream TCP connection, and
  bidirectional byte forwarding.
- Docker build and GitHub workflow coverage.

Not implemented yet:

- configurable idle or max-lifetime policy for established tunnels

## Configuration

```text
EGRESS_PROXY_LISTEN_ADDR=0.0.0.0:4443
EGRESS_PROXY_HEALTH_ADDR=0.0.0.0:8080
EGRESS_PROXY_TLS_CERT=/etc/certs/tls.crt
EGRESS_PROXY_TLS_KEY=/etc/certs/tls.key
EGRESS_PROXY_JWT_SECRET=<shared with front>
EGRESS_PROXY_POLICY_BUCKET=<gcs bucket name>
EGRESS_PROXY_POLICY_CACHE_TTL_SECS=60
EGRESS_PROXY_ENV=production
EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK=
```

`EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK` only accepts `1`, `0`, or unset. `1` is test-only and
startup rejects it unless `EGRESS_PROXY_ENV=test`.

## Local Checks

```bash
cd egress-proxy
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build
cargo test --all
```
