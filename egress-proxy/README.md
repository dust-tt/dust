# Egress Proxy

`egress-proxy` is the first Rust service for enforcing Dust sandbox outbound network policy.

Current functionality:

- `/healthz` process health endpoint.
- minimal process startup/shutdown wiring.
- startup validation for proxy config, TLS assets, and the temporary allowlist.
- TLS certificate and private-key loading.
- foundational modules for handshake parsing and JWT validation, covered by unit tests.
- Docker build and GitHub workflow coverage.

Not implemented yet:

- proxy listener
- DNS resolution
- SSRF blocking
- upstream connection
- forwarding
- GCS policy reads
- production lifecycle hardening

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
