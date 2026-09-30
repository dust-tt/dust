# dfs://

Rust 2024 workspace. Architecture: [DESIGN.md](DESIGN.md). Implementation invariants:
[CONTRACTS](CONTRACTS).

## Current increment

`dfs-server` provides an Axum/Tokio HTTP server, Clap configuration, JSON tracing to stderr, and
graceful shutdown on SIGINT/SIGTERM. Only `GET /health` is implemented; it returns `{"status":"ok"}`
for process liveness. Sessions, storage, search, and the FUSE client follow in separate increments.
The scaffold needs no GCP credentials or external services and runs natively on macOS and Linux.

## Develop

Use current stable Rust with `rustfmt` and `clippy`. From this directory:

```sh
cargo run -p dfs-server
curl --fail http://127.0.0.1:8080/health

cargo fmt --all -- --check
cargo check --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
```

The server defaults to `127.0.0.1:8080`. Override with `--listen` or `DFS_LISTEN`; configure logging
with `RUST_LOG` (default `info`). `cargo run -p dfs-server -- --help` lists options.
The API is documented in [server/openapi.yaml](server/openapi.yaml).

The FUSE client will start in a Linux sandbox with `/dev/fuse` and mount permissions, following
`cli/dust-sandbox`. macOS mounting is possible through [macFUSE](https://macfuse.github.io/), but
client compatibility and mounting will be validated in that increment.
