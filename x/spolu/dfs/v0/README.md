# dfs://

Rust 2024 workspace. Architecture: [DESIGN.md](DESIGN.md). Implementation invariants:
[CONTRACTS](CONTRACTS). Implementation steps: [PLAN.md](PLAN.md).

## Current increment

`dfs-server` provides an Axum/Tokio HTTP server, Clap configuration, JSON tracing to stderr, and
graceful shutdown on SIGINT/SIGTERM. The health route supports `GET` (returning `{"status":"ok"}`)
and `HEAD` for process liveness. The server library defines typed IDs, object URIs, relative paths,
metadata, directory entries, revision tokens, and shared API errors with focused tests. Its storage
API provides workspace-scoped snapshots, immutable blobs, and atomic metadata/index/event
batches. Workspace creation issues a workspace key; that key issues sessions with fixed grants and
authorizes explicit grant listing/updates.
Session-authenticated reads, mkdir, metadata updates, moves/removal, and root/shared projections
are available. File APIs provide streamed uploads/publication, range reads, session handles, random
writes, append, truncate, fsync, and retry receipts that persist with their mutations. `dfs-client`
provides streamed HTTP access; `dfs-fuse` mounts on Linux with live grant checks and server-backed
fsync. Shared wire and model types live in `dfs-protocol`; the server reexports the model. Custom
virtual mounts and search remain later increments.
Optional GCS configuration opens SlateDB before serving HTTP and
closes it after requests and admitted file jobs drain. Without it, the HTTP scaffold still runs without
external services.
The server runs natively on macOS and Linux.

Both synchronous GCS/SlateDB writes and server-local caching with asynchronous persistence are
available through one server. Performance evaluation takes priority over sections 8–9; see [PLAN.md](PLAN.md).

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
under `<prefix>/blobs/`. The default synchronous mode has no dfs content staging or metadata overlay;
enable them with `--write-mode cached`. Both modes use a bounded SlateDB block cache. Cached GCS
mode keeps disposable read caches under `--cache-dir`, scoped by bucket and prefix: a 256 MiB
SlateDB SST-cache target (`--metadata-cache-disk-bytes`) and a 512 MiB immutable-content disk cache
(`--read-cache-disk-bytes`). Zero disables either cache; enabled content caching requires at least
64 MiB. These budgets are separate from staging. Every server start clears both disk caches and
recovers only from GCS; no previous local data is reused. Small files prefill the content cache
after durable publication, while large files populate it on reads. See
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
never attaches grants to objects. The `mounts` argument is absent; unknown fields are rejected. Existing
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
They include modes and `atime`/`mtime`/`ctime` as `{ "seconds": i64, "nanoseconds": u32 }`, and omit
canonical parents, paths, and grants.
Stat can access a directly shared object without exposing its private ancestors; lookup/list require
access to the containing directory for canonical object IDs. Missing and inaccessible objects both
return `not_found`. Synthetic projections authorize each exposed target independently.

Listing sorts exact UTF-8 name bytes, with a limit of 1–1000 (default 100). Omit `after` on the first
page; pass `next_after` verbatim for the next, stopping when it is null. Each page uses a fresh snapshot
and rechecks grants. Concurrent edits can cause skips/repeats across pages; restart traversal when
a consistent full listing is required. Revocations and moves apply to subsequent requests; an
already-started read may finish against its snapshot. Responses use `Cache-Control: no-store`.
The synchronous path keeps no dfs metadata or authorization cache across requests. A matching grant
on the object or any current ancestor authorizes access; nearer grants never restrict it.

## Session root and shared folder

The same read endpoints accept `root` and `shared` as well-known IDs. For example:

```json
{"directory_id": "root", "limit": 100}
{"parent_id": "root", "name": "shared"}
{"directory_id": "shared", "limit": 100}
{"parent_id": "shared", "name": "C--550e8400e29b41d4a716446655440000"}
```

The root exposes authorized immediate workspace-root children plus synthetic `/shared`. Sharing
`/spolu/C` exposes `/shared/C--<uuid>` without revealing `/spolu`. Shared entries return real object
IDs; use those for ordinary stat/list/mutations, with the usual live grant and parent checks. Entries
already reachable through authorized ancestors or ordinary root entries are omitted.

Every direct shared entry appends `--<object-id>`. Long basenames are truncated at UTF-8 boundaries
to fit 255 bytes, including the full suffix. Names inside shared directories remain ordinary names.
Lookup extracts the ID and verifies access, shared eligibility, and the current rendered name; bare
or stale aliases return `not_found`. A canonical root child called `shared` is accessible as
`/shared/shared--<uuid>`. No basename index or collision scan is needed.

Shared listings use object-ID order and cursors, scanning at most `max(limit, 64)` candidates per
request. A filtered page can be empty with non-null `next_after`; keep paging until null. Root and
canonical listings use name order/cursors. All requests recheck grants, ancestry, and current names.
Synthetic stat returns directory mode `0555`, empty xattrs, revision zero, and epoch timestamps;
these fixed attributes are not change tokens. Synthetic mutations return `forbidden`.
FUSE follows visible parents inside `/shared`. Custom virtual mounts remain deferred; session
creation has no `mounts` field.

## Directory creation and metadata updates

Both endpoints require a session key and acknowledge atomic publication according to the server write mode.

| Request | JSON body | Result |
| --- | --- | --- |
| `POST /objects/mkdir` | `{ "parent_id": "<uuid>", "name": "folder" }` | New directory attributes; 201 |
| `POST /objects/update` | `{ "object_id": "<uuid>", "expected_metadata_revision": 0, "mode": 493 }` | Updated attributes; 200 |

Mkdir accepts optional `mime_type`, `xattrs` (base64 values), and `mode` (decimal `493` = octal `0755`).
The caller applies umask. It creates a fresh ID, inherits parent access without attaching grants, and
updates the parent's revision/mtime/ctime. A duplicate name returns `already_exists` (409).

Update accepts `mime_type`, `mode`, `atime`, `mtime`, and an xattr patch. Omitted fields remain unchanged;
`{"xattrs":{"user.note":"aGk=","user.old":null}}` stores bytes for `user.note` and removes `user.old`.
Empty strings store empty byte values. Xattrs are limited to 32 KiB total key/value bytes per object.
A stale expected revision returns `conflict` (409); an empty patch is invalid. Every accepted update
advances the revision and sets server ctime. Content, parent, ID, and grants remain unchanged.
Modes retain only permission bits and do not authorize server access; additional bits are unsupported.

Mkdir checks the parent; metadata updates check the target. Mutations prepare against one snapshot,
then acquire workspace/object locks in ID order for every touched object and parent. The shared
publication lock only validates the workspace's memory-visible change sequence and submits the batch.
If that sequence changed, release the locks and retry with fresh metadata, grants, and lock targets.
Errors and no-ops also validate their snapshot, so queued requests observe revocations and moves.
Denial publishes nothing and returns `not_found` before name collisions or revision conflicts.
All locks release before the WAL wait. Canceled requests release acquired locks, and unused lock
entries are reclaimed. Unrelated changes in the same workspace can trigger retries; after 16 stale
attempts, return `conflict` without publication. Changes in other workspaces do not trigger retries.
A failed/disconnected request can have committed: inspect the name or attributes before retrying.
File content mutations use the request-ID protocol below.

## Rename and removal

These session endpoints require access to the object and its current containing directory. Rename
also requires access to the destination directory. A directly shared child cannot mutate its hidden
parent's entries. All require the source's `expected_metadata_revision`; stale values return `conflict`.

| Request | JSON body | Result |
| --- | --- | --- |
| `POST /objects/rename` | `{ "object_id": "<uuid>", "expected_metadata_revision": 0, "parent_id": "<destination uuid>", "name": "new name", "replace": false }` | Source attributes; 200 |
| `POST /objects/unlink` | `{ "object_id": "<uuid>", "expected_metadata_revision": 0 }` | Remove file; 204 |
| `POST /objects/rmdir` | `{ "object_id": "<uuid>", "expected_metadata_revision": 0 }` | Remove empty directory; 204 |

Rename preserves IDs, content, explicit grants, and descendants. Existing destinations return
`already_exists` unless `replace: true`: files may replace files, directories may replace empty
directories. Replacement targets the entry current at publication. Same parent/name is a no-op after
revision validation. Roots return `forbidden`; moves into the source subtree return `invalid_input`.
Wrong kinds return `is_directory`/`not_directory`; nonempty removal/replacement returns `not_empty`.

Each change atomically updates child entries, object/parent revisions and times, and events, deleting
both grant indexes for removed/replaced objects, with acknowledgement per server write mode. Their blobs remain for
snapshots/recovery; handles to deleted objects return `not_found`. Repeated removal returns `not_found`.

## File I/O

All endpoints use the session key. JSON control bodies stay under 64 KiB; binary content streams
separately. See [OpenAPI](server/openapi.yaml) for exact fields and headers.

| Request | Purpose |
| --- | --- |
| `POST /uploads/start` | Reserve a create (`parent_id`, `name`) or replace (`object_id`, `expected_content_version`). |
| `PUT /uploads/content` | Stream binary bytes with `Dfs-Upload-Id`; size may initially be unknown. |
| `POST /uploads/commit` | Publish `upload_id`; creation accepts optional MIME, base64 xattrs, and mode. |
| `POST /uploads/status` | Recover completion/publication state for `upload_id`. |
| `POST /files/open` | Open `object_id` with read/write/append flags; return handle, sequence, and attributes. |
| `POST /files/read` | Stream `{handle_id, offset, length}`; optional `content_version` rejects stale versions. |
| `PUT /files/write` | Stream bytes with `Dfs-Handle-Id`, `Dfs-Request-Id`, `Dfs-Write-Sequence`, `Dfs-Write-Offset`, `Dfs-Write-Length`. |
| `POST /files/truncate` | Set `{handle_id, request_id, sequence, size_bytes}`; growth supplies zeros. |
| `POST /files/fsync` | Wait for `{handle_id, through_sequence}`; report unresolved failures. |
| `POST /objects/read` | Read an authorized current range by object ID without a server handle. |
| `POST /sessions/cache` | Long-poll workspace revision; cached authorization is fresh for at most one second. |
| `POST /files/close` | Release `{handle_id}`. |
| `POST /files/status` | Recover the published receipt for `{object_id, request_id}`; null may mean still in flight. |

Use `application/octet-stream` for binary bodies. Upload completion alone does not publish a file.
In synchronous mode, successful publication/edits finish GCS first, then one durable
metadata/index/event/receipt batch. Cached mode stages locally and acknowledges atomic visibility;
background persistence coalesces intermediate versions before uploading and committing metadata.
Reads pin the selected version for the response and clamp ranges to EOF. Rename preserves handles;
unlink/replacement invalidates handles to the deleted object. Every content operation checks grants.

Generate a fresh UUID (32 lowercase hex characters) for each edit; retry identical arguments/bytes
with the same ID after an ambiguous response. Upload commits use their upload ID as request ID.
Receipts survive restart; recreate sessions and handles before recovery. Handle sequences start at
zero; send edits in order starting at one. `truncate: true` during open requires write access and a
request ID, and consumes sequence one. A failed handle must retry its last request/sequence or be
closed/reopened. Fsync cannot acknowledge writes the server has not received; close is not fsync.

Random edits assemble a full version on anonymous disk, then upload it. Defaults: 1 GiB total scratch
logical size (`DFS_SCRATCH_BYTES`), system temporary directory (`DFS_SCRATCH_DIR`), and 16 active
file jobs (`DFS_FILE_MUTATIONS`) plus 256 waiting jobs. Waiting jobs do not poll streaming bodies or
reserve scratch/transfer resources; they reauthorize on execution. Handles cap at 4096/server and
256/session. Transfers share a 64 MiB
buffer budget (`DFS_UPLOAD_MEMORY_MIB`). Uploads/write bodies reserve 12 MiB each with four active
slots (`DFS_UPLOAD_CONCURRENCY`); reads reserve 2 MiB each with 16 active slots
(`DFS_READ_CONCURRENCY`). Each pool admits at most 16 additional waiters. These bounds exclude
SlateDB, transport, and allocator overhead.
Resource exhaustion returns `capacity_exhausted`. Scratch files are not recovery state; acknowledged
changes recover entirely from GCS. This synchronous baseline rewrites the whole blob on each edit.

## Grant administration

Use the **workspace key**, with `workspace_id` and `object_id` in the JSON body. Session keys cannot
list or change grants, even when they authorize the object. Workspace authority can administer any
object in its workspace, including a root with no remaining grants.

| Request | Additional JSON fields | Result |
| --- | --- | --- |
| `POST /objects/grants/list` | Optional `limit` (default 100, max 1000) and `after` | Explicit `grants`, `metadata_revision`, `next_after` |
| `POST /objects/grants/update` | `"expected_metadata_revision": 0, "grants": {"g:engineering": true, "u:former": false}` | Object ID and new metadata revision |

Patches contain 1–512 entries: true attaches, false removes an explicit attachment, and omitted grants
remain unchanged. An object can have more than 512 attachments across patches. Grants are opaque,
including empty strings and NUL. Listing uses exact byte ordering and exclusive cursors; only null
means the end. Each page has a fresh snapshot, so concurrent changes may require restarting the scan.

Every accepted patch advances the object's revision and ctime, even when the requested states already
hold. It persists both index directions, metadata, and an indexing event atomically. Stale revisions
return `conflict`; re-list before retrying an ambiguous failure or after a server restart.
Grant removal never denies inherited access: an ancestor or another matching grant may still grant
access. Otherwise, subsequent session reads and mutations lose access immediately; existing read
snapshots may finish. Parent/content, modes, xattrs, atime, and mtime remain unchanged.

## Storage and server checks

Normal `cargo test --locked --workspace` runs real SlateDB against memory and temporary filesystem
object stores, without GCS or database mocks. The opt-in cloud fixture uses the same exercise:
create immutable blobs, commit scoped metadata/index/event batches, and verify reads after reopening.
Local tests also withhold WAL flushing and inject upload failures. A subprocess test kills the
writer after acknowledgement and verifies the full batch from a fresh process, locally and on GCS.
The same cloud fixture exercises workspace/session HTTP handlers against GCS, including restart:
workspace keys remain valid, old session keys fail, and directories, attributes, grant indexes,
file contents, and mutation receipts recover. Local tests cover concurrent appends, 80 MiB files,
scratch exhaustion, fsync ordering, revoked access, and disconnected publication with withheld WAL.
The cloud fixture creates a fresh `<test-prefix>/tests/<uuid>/` for every run and deletes only that
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

## Linux FUSE client

See [fuse/README.md](fuse/README.md) for native Linux mounts, Docker development from macOS, and
end-to-end test commands. macFUSE is excluded. A mount takes only a session-key file, uses direct I/O
and zero metadata TTLs, and supports namespace edits, streamed file I/O, xattrs, and server-backed
flush/fsync. Remount with a new session after expiry or server restart. The initial synchronous
baseline and its measured limits are recorded in [bench/FUSE.md](bench/FUSE.md).

## Cached server mode

Pass `--write-mode cached` to enable server-local content staging and the metadata overlay. Writes
and fsync acknowledge visibility to other clients; recent acknowledgements can be lost on a crash.
The default `--write-mode sync` retains the durable baseline. Workspace creation remains durable.
See [DESIGN.md](DESIGN.md#cached-mode-implementation) for configurable limits and persistence behavior.

```sh
RUSTC_WRAPPER= cargo build --locked -p dfs-server --bin dfs-server --example local_server
python3 tests/fuse_e2e.py --write-mode cached
python3 tests/fuse_e2e.py --write-mode cached --bucket dust-dev-dfs-poc-spolu-20260930
python3 bench/cache.py --write-mode cached
```

The corpus benchmark uses a fresh GCS prefix and separate Linux mounts, verifies every extracted
file through another session, and reports foreground timings and remaining persistence drain time.
It does not touch a running development server or its storage prefix.
