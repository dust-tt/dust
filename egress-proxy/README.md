# Egress Proxy

`egress-proxy` is the first Rust service for enforcing Dust sandbox outbound network policy.

Current functionality:

- `/healthz` process health endpoint.
- minimal process startup/shutdown wiring.
- Docker build and GitHub workflow coverage.

Not implemented yet:

- proxy listener
- TLS loading
- handshake parsing
- JWT validation
- allowlist enforcement
- DNS resolution
- SSRF blocking
- upstream connection
- forwarding
- GCS policy reads
- production lifecycle hardening

## Configuration

```text
EGRESS_PROXY_HEALTH_ADDR=0.0.0.0:8080
```

## Local Checks

```bash
cd egress-proxy
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build
cargo test --all
```
