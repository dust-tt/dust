# Egress Proxy

`egress-proxy` is the first Rust service for enforcing Dust sandbox outbound network policy.

This pre-PR intentionally implements only the no-brainer service shell:

- `/healthz` process health endpoint.
- minimal process startup/shutdown wiring.
- Docker build and GitHub workflow coverage.

It does not expose the proxy listener yet. There is no TLS loading, handshake parsing, JWT
validation, allowlist enforcement, DNS resolution, SSRF blocking, upstream connection, forwarding,
or GCS policy reading in this branch.

Missing behavior is intentionally left as explicit TODOs in the crate so the next PRs stay
reviewable:

- PR 1: config, TLS loading, handshake parsing, JWT validation, and temporary allowlist parsing.
- PR 2: protocol-compliant proxying, including DNS, SSRF checks, upstream connection, and byte
  forwarding.
- PR 3: production lifecycle hardening.

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
