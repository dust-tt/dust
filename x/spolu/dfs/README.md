# dfs://

Rust 2024 workspace. Architecture: [DESIGN.md](DESIGN.md). Implementation invariants:
[CONTRACTS](CONTRACTS). Implementation steps: [PLAN.md](PLAN.md).

## Current increment

`dfs-server` provides an Axum/Tokio HTTP server, Clap configuration, JSON tracing to stderr, and
graceful shutdown on SIGINT/SIGTERM. The health route supports `GET` (returning `{"status":"ok"}`)
and `HEAD` for process liveness. The server library defines typed IDs, object URIs, relative paths,
metadata, directory entries, revision tokens, and shared API errors with focused tests. Unknown routes and
unsupported HTTP methods return JSON errors with stable codes. Initial filesystem semantics are
defined in [DESIGN.md](DESIGN.md); their operations, sessions, storage, search, and the FUSE client
follow in separate increments. The scaffold needs no GCP credentials or external services and runs
natively on macOS and Linux.

Start with synchronous GCS/SlateDB operations through a single server, then add local server caching
and asynchronous persistence after the end-to-end filesystem works. See [PLAN.md](PLAN.md).

## Develop

Use current stable Rust with `rustfmt` and `clippy`. From this directory:

```sh
cargo run -p dfs-server
curl --fail http://127.0.0.1:8080/health

cargo fmt --all -- --check
cargo check --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo build --locked -p dfs-server
python3 tests/server_smoke.py
```

The server defaults to `127.0.0.1:8080`. Override with `--listen` or `DFS_LISTEN`; configure logging
with `RUST_LOG` (default `info`). `cargo run -p dfs-server -- --help` lists options.
The API is documented in [server/openapi.yaml](server/openapi.yaml).

The smoke test uses Python 3's standard library to start the compiled server on an OS-assigned
loopback port, check HTTP health, and verify clean shutdown on both SIGINT and SIGTERM. It enforces
timeouts and cleans up its child processes. Pass `--binary` when using a custom Cargo target
directory.

The FUSE client will start in a Linux sandbox with `/dev/fuse` and mount permissions, following
`cli/dust-sandbox`. macOS mounting is possible through [macFUSE](https://macfuse.github.io/), but
client compatibility and mounting will be validated in that increment.
