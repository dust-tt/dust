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
follow in separate increments. Optional GCS configuration now opens SlateDB before serving HTTP and
closes it after requests drain. Without it, the HTTP scaffold still runs without external services.
The server runs natively on macOS and Linux.

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

## GCS development storage

The PoC development bucket is `dust-dev-dfs-poc-spolu-20260930` in project `dust-dev`; use
`dfs-dev/spolu` as its development prefix.

Use an existing development bucket and a dedicated prefix. Grant the local ADC identity
[`roles/storage.objectUser`](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
on that bucket: SlateDB and the fixture need object create/read/list/update/delete access.
Bucket creation and IAM administration are not needed by dfs. The prefix must allow object deletion
and must not have lifecycle rules that delete live database files.

Configure [local Application Default Credentials](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
if needed, then start the server:

```sh
gcloud auth application-default login
cargo run -p dfs-server -- --gcs-bucket YOUR_BUCKET --gcs-prefix dfs-dev/spolu
```

Alternatively set `DFS_GCS_BUCKET` and `DFS_GCS_PREFIX`. Both are required together. Prefixes use
letters, digits, `-`, `_`, `.`, and `/` separators; empty/dot/traversal components are rejected.
Credentials come from ADC (`GOOGLE_APPLICATION_CREDENTIALS`, local ADC, or attached service
credentials), never from dfs command-line flags. The inherited Dust `SERVICE_ACCOUNT` variable is
ignored so it cannot override the ADC identity. Authentication or storage failures abort
startup. SlateDB adds no retries over the GCS client's bounded retry policy, so expired credentials
do not cause an endless startup retry loop. Run only one server against a given prefix.

SlateDB 0.17 stores WAL/SST/manifest objects under `<prefix>/metadata/`; file blobs are reserved under
`<prefix>/blobs/`. This increment adds lifecycle and storage fixtures; workspace encodings and the
filesystem storage API come next. No dfs content cache or metadata overlay is enabled.

## Storage and server checks

Normal `cargo test --locked --workspace` runs real SlateDB against memory and temporary filesystem
object stores, without GCS or database mocks. The opt-in cloud fixture uses the same exercise:
create an immutable blob, write a metadata batch, wait on SlateDB's `await_durable()`, close/reopen,
verify data, and clean up. It creates a fresh `<test-prefix>/tests/<uuid>/` for every run and deletes
only that run's objects after success; failures leave the isolated prefix for inspection.
This checks clean reopening; abrupt crash/recovery checks remain separate work.

```sh
DFS_TEST_GCS_BUCKET=YOUR_BUCKET DFS_TEST_GCS_PREFIX=dfs-dev/spolu \
  cargo test --locked -p dfs-server storage::tests::gcs_storage_round_trip -- --ignored --exact
```

The smoke test uses Python 3's standard library to start the compiled server on an OS-assigned
loopback port, check HTTP health, and verify clean shutdown on both SIGINT and SIGTERM. It enforces
timeouts and cleans up its child processes. It clears dfs GCS configuration in its child processes,
so it never opens a configured development database. Pass `--binary` when using a custom Cargo
target directory.

The FUSE client will start in a Linux sandbox with `/dev/fuse` and mount permissions, following
`cli/dust-sandbox`. macOS mounting is possible through [macFUSE](https://macfuse.github.io/), but
client compatibility and mounting will be validated in that increment.
