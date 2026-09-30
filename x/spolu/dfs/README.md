# dfs://

Rust 2024 workspace. Architecture: [DESIGN.md](DESIGN.md). Implementation invariants:
[CONTRACTS](CONTRACTS). Implementation steps: [PLAN.md](PLAN.md).

## Current increment

`dfs-server` provides an Axum/Tokio HTTP server, Clap configuration, JSON tracing to stderr, and
graceful shutdown on SIGINT/SIGTERM. The health route supports `GET` (returning `{"status":"ok"}`)
and `HEAD` for process liveness. The server library defines typed IDs, object URIs, relative paths,
metadata, directory entries, revision tokens, and shared API errors with focused tests. Its storage
API provides workspace-scoped snapshots, immutable blobs, and synchronous metadata/index/event
batches. Workspace creation issues a workspace key; that key issues sessions with fixed grants.
Session-authenticated stat, child lookup, and directory listing are available. Namespace mutations,
file I/O, search, and FUSE follow in separate increments.
Optional GCS configuration opens SlateDB before serving HTTP and
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

SlateDB 0.17 stores WAL/SST/manifest objects under `<prefix>/metadata/`; immutable file blobs live
under `<prefix>/blobs/`. No dfs content cache or metadata overlay is enabled. See
[server/STORAGE.md](server/STORAGE.md) for the internal API, versioned format, and durability rules.

## Workspaces and sessions

Configure `DFS_SERVER_KEY` with an operator-generated secret (32–512 ASCII letters, digits, `-`,
or `_`; for example, generate 32 random bytes as hex). This environment-only key enables
`POST /workspaces`; without it, workspace creation is disabled. GCS must also be configured.
Use TLS termination beyond local development. All credentials use `Authorization: Bearer <key>`.

| Request | Credential | Body / result |
| --- | --- | --- |
| `POST /workspaces` | Server key | `{ "workspace_id": "w", "root_grants": ["g:admins"] }` → workspace key and root ID |
| `POST /sessions` | Workspace key | `{ "workspace_id": "w", "grants": ["g:admins"] }` → session key, ID, scope, expiry |
| `GET /sessions/current` | Session key | Current workspace, grants, and expiry; never the key |
| `DELETE /sessions/{session_id}` | That session's key | Close the session; 204 |

Save creation keys from their responses; they are returned once. Workspace keys survive restart and
can mint any grant set in their workspace. Keep them with trusted callers; give sandboxes session keys.
Sessions expire after one hour or restart and cannot mint sessions or administer grants. The limit
is 512 distinct grants per session and 10,000 live sessions per process; expired entries are removed
on session access/creation/closure. Grants are opaque strings, including empty strings; duplicates
are deduplicated. Bodies are limited to 64 KiB and reject unknown fields.

Root grants default to empty; sharing the root grants access through inheritance. Session creation
never attaches grants to objects. Nonempty virtual mounts return `unsupported` until group 5. Existing
workspace IDs return `conflict` without changing their key or root. Key rotation/recovery is future
work: a lost creation response may leave a workspace whose key cannot be recovered yet.

## Object reads

Use a session key for these read-only JSON endpoints. Names and cursors stay in request bodies.

| Request | JSON body | Result |
| --- | --- | --- |
| `POST /objects/stat` | `{ "object_id": "<uuid>" }` | Object attributes |
| `POST /objects/lookup` | `{ "parent_id": "<uuid>", "name": "file.txt" }` | Child attributes |
| `POST /objects/list` | `{ "directory_id": "<uuid>", "limit": 100, "after": "file.txt" }` | Entries with attributes and `next_after` |

Attributes include ID, kind, MIME type, base64 xattrs, metadata revision, and file content version/size.
They omit canonical parents, paths, and grants. POSIX timestamps/modes arrive with metadata mutations.
Stat can access a directly shared object without exposing its private ancestors; lookup/list require
access to the containing directory. Missing and inaccessible objects both return `not_found`.

Listing sorts exact UTF-8 name bytes, with a limit of 1–1000 (default 100). Omit `after` on the first
page; pass `next_after` verbatim for the next, stopping when it is null. Each page uses a fresh snapshot
and rechecks grants. Concurrent edits can cause skips/repeats across pages; restart traversal when
a consistent full listing is required. Revocations and moves apply to subsequent requests; an
already-started read may finish against its snapshot. Responses use `Cache-Control: no-store`.

## Storage and server checks

Normal `cargo test --locked --workspace` runs real SlateDB against memory and temporary filesystem
object stores, without GCS or database mocks. The opt-in cloud fixture uses the same exercise:
create immutable blobs, commit scoped metadata/index/event batches, and verify reads after reopening.
Local tests also withhold WAL flushing and inject upload failures. A subprocess test kills the
writer after acknowledgement and verifies the full batch from a fresh process, locally and on GCS.
The same cloud fixture exercises workspace/session HTTP handlers against GCS, including restart:
workspace keys remain valid and old session keys fail. The cloud fixture creates a fresh
`<test-prefix>/tests/<uuid>/` for every run and deletes only that
run's objects after success; failures leave the isolated prefix for inspection. The ignored `worker`
test is an internal subprocess helper, not a standalone test command.

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
