# Implementation plan

[DESIGN.md](DESIGN.md) describes the architecture; [CONTRACTS](CONTRACTS) defines the invariants.
Only the server scaffold is implemented today.

Work in small increments: each checkbox should produce a reviewable change with a focused test or
demo. Split a checkbox further when needed. Keep the server runnable, update API documentation and
contracts alongside behavior, and introduce abstractions when a concrete caller needs them.

Start with one shard and a local owner. Get an authenticated filesystem working in memory, mount it
in Linux, then add asynchronous persistence and recovery. Run the search feasibility work early;
integrate indexing once persisted filesystem state is available. Do not expose the service to real
tenants before authorization, recovery, and owner fencing are validated.

## 0. Server foundation

- [x] Rust 2024 workspace with an Axum/Tokio server.
- [x] CLI/environment configuration, JSON logging, health endpoint, and graceful shutdown handling.
- [x] Development instructions, OpenAPI document, and top-level code contracts.
- [x] Exercise HTTP health and SIGINT/SIGTERM shutdown outside the restricted development sandbox.

**Done when:** the same server starts and stops cleanly on macOS and Linux.

Validated with `tests/server_smoke.py` on native macOS and Linux in Docker using Rust 1.98.1.
Rust unit tests will be added with the first domain behavior.

## 1. Object model and API foundations

- [ ] Introduce distinct workspace, object, and content-version ID types; generate UUIDv4 IDs.
- [ ] Parse and format both URI forms, ignoring decorative names. Reject malformed UUIDs and paths.
- [ ] Define file/directory metadata, MIME types, xattrs, parent links, and directory entries.
- [ ] Define metadata/content revisions and an owner epoch for detecting stale client state.
- [ ] Define API errors and their HTTP mappings: missing, forbidden, conflict, invalid input,
  exhausted capacity, and unavailable owner. Avoid leaking inaccessible object details.
- [ ] Define the initial supported filesystem semantics: names, timestamps, modes, xattr encoding,
  and explicit errors for unsupported operations. Add wire types as their endpoints arrive.

**Done when:** identity survives renames in model tests, URI behavior matches the design, and wire
errors can later map consistently to FUSE errors.

## 2. Workspace bootstrap and sessions

- [ ] Define how the trusted caller proves its workspace and allowed grant set; never treat
  arbitrary
  client-supplied grants as proof of authority. Provide a deterministic authenticator for tests.
- [ ] Define who can provision workspace roots and attach/revoke grants; record these decisions in
  contracts before exposing the corresponding mutation APIs.
- [ ] Add workspace bootstrap and an isolated owner state per workspace, using fixtures initially.
- [ ] Implement session creation with opaque tokens, expiry, fixed workspace/grants, and the limit
  of 512 distinct grants. Treat grant strings as opaque values.
- [ ] Add bearer-session lookup, explicit closure, expiry cleanup, and rejection after owner
  restart.
- [ ] Reject unsupported mount requests until mount validation exists in group 4.

**Done when:** two sessions can connect to one workspace, while expired tokens, unauthorized grant
sets, and cross-workspace requests fail.

## 3. Live namespace and grant enforcement

- [ ] Build the owner's metadata overlay with atomic mutation batches and ordered mutation IDs.
  Keep it independent of SlateDB so pending content references cannot reach its WAL.
- [ ] Implement object lookup, stat, and paginated directory listing with entry attributes.
- [ ] Implement directory/file creation and MIME type/xattr updates; begin with empty files.
- [ ] Maintain explicit object-to-grant and grant-to-object indexes in each atomic mutation.
- [ ] Resolve effective grants through current ancestors and apply authorization to every operation.
- [ ] Implement rename/move, unlink, and directory removal, including collision checks, cycle
  prevention, and nonempty-directory errors. Specify replacement behavior explicitly.
- [ ] Add per-object concurrency control without holding a file's write lock across unrelated files.

**Done when:** sessions can create and traverse authorized trees; grant changes and moves
immediately
affect server authorization, and failed mutations leave namespace and indexes unchanged.

## 4. Session roots, shared entries, and virtual mounts

- [ ] Discover accessible roots through the grant indexes, with deduplication and pagination.
- [ ] Render authorized workspace-root entries and reserve the synthetic `/shared` folder.
- [ ] Populate `/shared`, omit entries reachable through authorized ancestors, and disambiguate
  basename collisions using object IDs.
- [ ] Validate mount paths, overlaps, namespace collisions, target directory type, workspace, and
  current access when creating sessions.
- [ ] Resolve mount targets by ID and synthesize virtual parents such as `/current`.
- [ ] Implement alias traversal and virtual `..`; reject mutations of synthetic parents and mount
  entries. Recheck access when a target is moved, deleted, or has its grants revoked.

**Done when:** sharing `/spolu/C` exposes `/shared/C` without exposing `/spolu`; conversation/pod
aliases survive target renames and cannot reveal hidden ancestors.

## 5. Local content staging and file I/O

- [ ] Define open-handle lifetime, writer serialization, append/truncate behavior, and visibility
  before `fsync`. Define what happens to open files after unlink and grant revocation.
- [ ] Implement file reads and staged writes in RAM, with fresh content-version IDs on publication.
- [ ] Spill staged content to local disk with explicit memory/disk limits and capacity errors.
- [ ] Implement atomic publication of content references, metadata, and indexes. Acknowledge `fsync`
  only once another session can read the published bytes through the server.
- [ ] Keep all file bytes outside metadata storage; retain unuploaded versions and apply
  backpressure
  when staging is full. Clean up abandoned handles and unpublished staging data.
- [ ] Add request IDs/revision checks where retries could otherwise duplicate or overwrite
  mutations.

**Done when:** one session writes and fsyncs a file, another reads it immediately, and the entire
operation succeeds with no GCS access. A competing writer waits without blocking unrelated files.

## 6. First Rust FUSE client

- [ ] Add a Rust API client and share protocol types where needed. Configure endpoint, session
  credentials, and mount location without logging tokens or placing them in URLs.
- [ ] Set up a Linux sandbox with `/dev/fuse` and mount permissions; use existing `dust-sandbox`
  conventions. Keep the server runnable natively on macOS.
- [ ] Map object IDs and virtual namespace positions to mount-local inodes, with correct parent
  traversal and inode/handle lifetimes.
- [ ] Implement lookup, getattr, readdir, open, and read; mount an authorized tree read-only first.
- [ ] Add create, mkdir, write, truncate, rename, unlink, rmdir, and supported xattr operations.
- [ ] Implement flush/fsync/release and propagate server errors. Never acknowledge fsync while
  writes exist only in the client; return explicit errors for unsupported filesystem operations.
- [ ] Begin with conservative cache behavior and validate two simultaneous mounts against the owner.

**Done when:** `ls`, `find`, `cat`, edits, and `untar` work through FUSE; a second mount sees
fsynced
changes after revalidation. This is the first end-to-end filesystem milestone.

## 7. GCS blobs and SlateDB persistence

- [ ] Configure GCS credentials, bucket/prefix separation, local cache directories, and SlateDB
  lifecycle. Add a small real-GCS integration fixture alongside fast local tests.
- [ ] Define versioned metadata encodings and unambiguous workspace/key prefixes, including
  arbitrary
  grant strings. Verify isolation and prefix scans at the byte-encoding boundary.
- [ ] Upload immutable content versions concurrently, with bounded workers, retry handling, and
  confirmation that uploads completed before metadata can reference them.
- [ ] Persist ordered atomic mutation batches to SlateDB only when their blob dependencies exist.
  Include grant indexes and replayable search events in the same batches.
- [ ] Merge overlay and SlateDB reads, scans, and tombstones. Retire overlay mutations after
  applying
  them to SlateDB without erasing newer changes to the same keys.
- [ ] Distinguish server-visible, applied, and durable progress; verify the chosen SlateDB version's
  batch, WAL, durability, and recovery guarantees against the required consistent prefix.
- [ ] Add cache misses that fetch persisted blobs from GCS, and eviction of clean content only.

**Done when:** writes remain visible while persistence is paused; after persistence and a clean
restart, the tree and file bytes can be reconstructed entirely from GCS-backed state.

## 8. Crash recovery and owner fencing

- [ ] Recover the durable metadata prefix and discard pending local state, including obsolete
  sessions, handles, and staging data. Generate fresh IDs and a new owner epoch.
- [ ] Inject crashes before/after uploads, metadata application, WAL durability, and overlay
  retirement.
  Include multi-object namespace and grant changes in the failure cases.
- [ ] Verify every recovered state is consistent: acknowledged data may disappear, but no surviving
  metadata references missing content and no mutation leaves half-updated indexes.
- [ ] Select and implement owner fencing for both foreground serving and background persistence.
  Do not assume database writer fencing alone stops an old owner from acknowledging local writes.
- [ ] Reject stale-owner requests and make clients recreate sessions and invalidate old namespace
  state after recovery or ownership changes.
- [ ] Add conservative orphan cleanup that preserves live, open-handle, in-flight, and recoverable
  references. Validate deletion races before enabling automatic reclamation.

**Done when:** forced crashes and overlapping owner attempts cannot expose inconsistent state or
allow a stale owner to continue serving as authoritative.

## 9. Change subscriptions and Product integration

- [ ] Publish ordered live mutation notifications with workspace scope, owner epoch, and sequence.
- [ ] Authorize subscriptions and filter event details without leaking inaccessible names or paths.
  Handle revocations by invalidating previously visible state without exposing new private state.
- [ ] Add bounded replay and explicit gap/reset responses so slow or disconnected clients resync.
- [ ] Invalidate object attributes, directory views, aliases, and cached content on relevant events.
- [ ] Connect Product reads/edits to the same filesystem API and session authority as sandbox
  clients.
- [ ] Exercise Product-to-sandbox and sandbox-to-Product updates, including rename, move, delete,
  sharing changes, reconnection, and owner restart.

**Done when:** edits propagate automatically in both directions and missed notifications never leave
clients assuming stale namespace state is current.

## 10. Caching, batching, and workload performance

- [ ] Establish repeatable baselines for small-file untar, recursive stat/list, nearby-folder reads,
  and mostly uncontended writes from hundreds of clients. Record latency and resource use.
- [ ] Add bounded owner caches keyed by workspace/object/version, preserving live authorization and
  the distinction between dirty staging data and evictable persisted content.
- [ ] Add client metadata/content caches and kernel cache settings, with subscription invalidation,
  bounded staleness, and session recreation rules.
- [ ] Add directory attribute prefetch and folder-local read-ahead where measurements justify them.
- [ ] Batch/pipeline small-file operations while keeping publication boundaries, retry behavior, and
  per-file serialization explicit.
- [ ] Measure cache misses, lock contention, staging pressure, upload backlog, and persistence lag;
  tune limits and concurrency without adding GCS waits to normal fsync.

**Done when:** warm traversal and untar improve measurably against the baseline, with bounded memory
and disk usage and passing isolation, revocation, concurrency, and recovery checks.

## 11. Search feasibility and indexing

Run the first two tasks early with synthetic data; the remaining tasks depend on groups 7–9.

- [ ] Build a focused LanceDB OSS/GCS spike with text, MIME type, typed xattrs, effective grant
  lists,
  file IDs, and content-version IDs; open workspace tables lazily.
- [ ] Validate BM25 plus scalar/LabelList filtering with up to 512 grants, large matching sets, cold
  tables, many workspaces, and unindexed tails. Set latency/resource targets before accepting it.
- [ ] Define supported text extraction and typed xattrs, with file size limits and explicit handling
  for binary, unsupported, or failed extraction. Start with plain text.
- [ ] Consume durable indexing events in order, load immutable content, and batch idempotent
  upserts/deletes. Checkpoint only after index commits and test interruption/replay.
- [ ] Refresh inherited grant lists after sharing changes and moves, including descendants.
- [ ] Add search API filters and pagination; recheck existence, content version, and live grants
  before returning hits/snippets. Return stable URIs and session-visible paths.
- [ ] Schedule indexing, index maintenance, and compaction with bounded resources; support a
  complete
  rebuild from persisted state and expose indexing lag/failures.

**Done when:** newly persisted content becomes searchable within the accepted delay, while live
revocations hide results immediately and index replay/rebuild preserves isolation.

## 12. Tenant scale and deployment

- [ ] Bound per-workspace/session resources: handles, requests, caches, staging, subscriptions,
  uploads, and indexing. Prevent one busy workspace from monopolizing shared workers.
- [ ] Load-test tens of thousands of mostly idle workspaces alongside active ones; bound lazy-open
  table/cache residency and verify cleanup when workspaces become idle.
- [ ] Add service metrics for API latency, authorization failures, dirty bytes, visible/durable lag,
  worker failures, notification gaps, and search freshness without logging user content or secrets.
- [ ] Package and deploy one shard with GCS access, local scratch storage, authenticated transport,
  health/readiness, restart behavior, and bounded shutdown.
- [ ] Exercise a fresh server with only GCS-backed state and no surviving local disk; document the
  expected loss window and recovery procedure.
- [ ] Add a Linux FUSE acceptance suite and a small repeatable multi-session workload for rollout.

**Done when:** one shard can serve isolated tenants predictably under load and recover on a fresh
machine with the documented durability tradeoff.

## Deferred beyond the first PoC

- Multi-shard routing, shard movement, and automated failover orchestration.
- macOS FUSE mounting and compatibility testing; native macOS server development continues
  throughout.
- Additional POSIX features such as hard links, symlinks, and advisory locks, after deciding
  their semantics and authorization implications. Do not silently emulate unsupported operations.
- Search formats and query features beyond the first validated text/metadata/grant pipeline.
