# Implementation plan

[DESIGN.md](DESIGN.md) describes the architecture; [CONTRACTS](CONTRACTS) defines the invariants.
The server scaffold and initial model types are implemented today.

Work in small increments: each checkbox should produce a reviewable change with a focused test or
demo. Split a checkbox further when needed. Keep the server runnable, update API documentation and
contracts alongside behavior, and introduce abstractions when a concrete caller needs them.

The PoC uses **one server process serving one shard**. First build a synchronous end-to-end system:
read metadata from SlateDB and content from GCS; finish required GCS uploads and durable SlateDB
batches before acknowledging mutations. Metadata-only operations need no blob upload. Do not add a
dfs-managed content cache or metadata overlay until that baseline works through FUSE and survives
restart. Request buffers, open handles, and ephemeral sessions can still live in memory.

Then add server caching, local write staging, and asynchronous persistence. This later phase changes
fsync from the stronger synchronous baseline to the visibility-only semantics in the target design.

## 0. Server foundation

- [x] Rust 2024 workspace with an Axum/Tokio server.
- [x] CLI/environment configuration, JSON logging, health endpoint, and graceful shutdown handling.
- [x] Development instructions, OpenAPI document, and top-level code contracts.
- [x] Exercise HTTP health and SIGINT/SIGTERM shutdown outside the restricted development sandbox.

**Done when:** the same server starts and stops cleanly on macOS and Linux.

Validated with `tests/server_smoke.py` on native macOS and Linux in Docker using Rust 1.98.1.

## 1. Object model and API foundations

- [x] Introduce distinct workspace, object, and content-version ID types; generate UUIDv4 IDs.
- [x] Parse and format both URI forms, ignoring decorative names. Reject malformed UUIDs and paths.
- [x] Define file/directory metadata, MIME types, xattrs, parent links, and directory entries.
- [x] Define metadata/content revisions, scoped to a workspace and object within a live session.
- [ ] Define API errors and their HTTP mappings: missing, forbidden, conflict, invalid input,
  exhausted capacity, and unavailable server. Avoid leaking inaccessible object details.
- [ ] Define the initial supported filesystem semantics: names, timestamps, modes, xattr encoding,
  and explicit errors for unsupported operations. Add wire types as their endpoints arrive.

Workspace IDs are opaque caller-provided strings. Metadata revisions are per-object counters;
content revisions are immutable content-version UUIDs. Session recreation discards cached state.

**Done when:** identity survives renames in model tests, URI behavior matches the design, and wire
errors can later map consistently to FUSE errors.

## 2. Synchronous GCS and SlateDB storage

- [ ] Configure GCS credentials, bucket/prefix separation, and SlateDB lifecycle. Add a real-GCS
  integration fixture alongside fast local tests.
- [ ] Define versioned metadata encodings and unambiguous workspace/key prefixes, including
  arbitrary grant strings. Verify workspace isolation and prefix scans at the byte-encoding
  boundary.
- [ ] Implement immutable blob upload and download by workspace/object/content version.
- [ ] Implement metadata get, prefix scan, and atomic batch operations directly against SlateDB. Use
  consistent read views when an operation spans several keys.
- [ ] Verify SlateDB batch, WAL, and durability guarantees. Wait for the required durability
  boundary before acknowledging a synchronous mutation.
- [ ] Implement the commit ordering: upload any new blobs, then atomically commit metadata, indexes,
  and replayable indexing events. Handle upload or database failure without dangling references.
- [ ] Reopen persisted state on startup without relying on a surviving local cache or disk.

**Done when:** storage fixtures survive a fresh process, and failed uploads cannot publish metadata
that references missing bytes.

## 3. Workspace bootstrap and sessions

- [ ] Define how the trusted caller proves its workspace and allowed grant set; never treat
  arbitrary client-supplied grants as proof of authority. Provide a deterministic authenticator for
  tests.
- [ ] Define who can provision workspace roots and attach/revoke grants; record these decisions in
  contracts before exposing the corresponding mutation APIs.
- [ ] Persist workspace roots through the synchronous storage path.
- [ ] Implement session creation with opaque tokens, expiry, fixed workspace/grants, and the limit
  of 512 distinct grants. Treat grant strings as opaque values.
- [ ] Add bearer-session lookup, explicit closure, expiry cleanup, and rejection after server
  restart. Recreated sessions discard previous namespace state and subscriptions.
- [ ] Reject unsupported mount requests until mount validation exists in group 5.

**Done when:** two sessions can connect to one workspace, while expired tokens, unauthorized grant
sets, and cross-workspace requests fail.

## 4. Persistent namespace and grant enforcement

- [ ] Implement object lookup, stat, and paginated directory listing with entry attributes.
- [ ] Implement directory creation and MIME type/xattr updates through synchronous metadata batches.
- [ ] Maintain explicit object-to-grant and grant-to-object indexes atomically in SlateDB.
- [ ] Resolve effective grants through current ancestors and authorize every operation against a
  consistent view. Do not cache dfs metadata or authorization decisions yet.
- [ ] Implement rename/move, unlink, and directory removal, including collision checks, cycle
  prevention, and nonempty-directory errors. Specify replacement behavior explicitly.
- [ ] Add per-object concurrency control without holding a file's write lock across unrelated files.

**Done when:** sessions can traverse authorized persisted trees; moves and grant changes immediately
affect access, and failed mutations leave namespace and indexes unchanged.

## 5. Session roots, shared entries, and virtual mounts

- [ ] Discover accessible roots through SlateDB's grant indexes, with deduplication and pagination.
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

## 6. Synchronous file I/O

- [ ] Define open-handle lifetime, writer serialization, append/truncate behavior, and visibility
  before fsync. Define what happens to open files after unlink and grant revocation.
- [ ] Implement file creation and reads using GCS content and SlateDB metadata, including empty
  files.
- [ ] Implement writes and truncation with fresh immutable content versions. Use request-scoped
  buffers to assemble uploads; no acknowledged content may exist only in server RAM/local disk.
- [ ] Upload the complete content version before publishing its metadata/index batch. Wait for both
  steps before acknowledging the mutation; metadata-only mutations wait only for their SlateDB
  batch.
- [ ] Implement fsync as a barrier for preceding writes. Another session must then see the persisted
  metadata and bytes through the server.
- [ ] Add request IDs/revision checks where retries could duplicate or overwrite mutations. Resolve
  ambiguous commit outcomes without assuming that a timed-out request failed to commit.

**Done when:** one session writes and fsyncs a file, another reads it from persisted state, and a
server restart preserves acknowledged changes. A competing writer waits without blocking others.

## 7. First Rust FUSE client and end-to-end baseline

- [ ] Add a Rust API client and share protocol types where needed. Configure endpoint, session
  credentials, and mount location without logging tokens or placing them in URLs.
- [ ] Set up a Linux sandbox with `/dev/fuse` and mount permissions; use existing `dust-sandbox`
  conventions. Keep the server runnable natively on macOS.
- [ ] Map object IDs and virtual namespace positions to mount-local inodes, with correct parent
  traversal and inode/handle lifetimes.
- [ ] Implement lookup, getattr, readdir, open, and read; mount an authorized tree read-only first.
- [ ] Add create, mkdir, write, truncate, rename, unlink, rmdir, and supported xattr operations.
- [ ] Implement flush/fsync/release and propagate failures. Never acknowledge fsync while writes
  remain only in the client; return explicit errors for unsupported filesystem operations.
- [ ] Use conservative client/kernel cache settings and validate two simultaneous mounts.
- [ ] Record baseline timings for `ls`, `find`, `cat`, edits, and small-file `untar`; repeat reads
  after restarting the server with no surviving local disk.

**Done when:** FUSE → server → GCS/SlateDB works end to end with sharing and two clients. This is
the gate before adding dfs server caching; slow synchronous performance is expected at this stage.

## 8. Synchronous recovery and failure handling

- [ ] Inject failures before/after upload, metadata commit, durability confirmation, and response.
  Include directory, grant, and multi-object mutations.
- [ ] Verify acknowledged mutations survive restart, interrupted mutations are atomic, and every
  recovered content reference exists in GCS.
- [ ] Reject old sessions after restart; clients recreate sessions and discard cached namespace
  state.
- [ ] Add conservative orphan cleanup that preserves live, open-handle, in-flight, and recoverable
  references. Validate deletion races before enabling automatic reclamation.
- [ ] Exercise read/write failures and retries with two clients while preserving tenant isolation.

**Done when:** the synchronous baseline recovers consistently from crashes and failures without
requiring local server state. There is still exactly one server process.

## 9. Change subscriptions and Product integration

- [ ] Publish ordered mutation notifications with workspace scope and session-valid sequence
  numbers.
- [ ] Authorize subscriptions and filter event details without leaking inaccessible names or paths.
  Handle revocations by invalidating previously visible state without exposing new private state.
- [ ] Add bounded replay and explicit gap/reset responses so slow or disconnected clients resync.
  Server restart invalidates old sessions and subscription cursors.
- [ ] Invalidate object attributes, directory views, aliases, and content views on relevant events.
- [ ] Connect Product reads/edits to the same filesystem API and session authority as sandbox
  clients.
- [ ] Exercise Product-to-sandbox and sandbox-to-Product changes, including sharing changes,
  reconnection, and server restart.

**Done when:** edits propagate automatically in both directions and missed notifications never leave
clients assuming stale namespace state is current.

## 10. Local server caching and asynchronous writes

Begin only after the synchronous end-to-end baseline and recovery checks pass.

- [ ] Add bounded caches for persisted metadata and content; key content by workspace/object/version
  and keep authorization current. Compare behavior with the uncached baseline.
- [ ] Add RAM staging with local-disk spill, capacity limits, dirty/clean tracking, and
  backpressure. Never evict unuploaded content.
- [ ] Add an atomic metadata overlay and ordered mutation IDs. Keep pending references outside
  SlateDB until their blobs exist in GCS.
- [ ] Serve reads, directory/grant scans, and tombstones through the combined overlay and SlateDB.
- [ ] Publish staged bytes and metadata together. Change fsync to acknowledge server-side visibility
  without waiting for GCS, SlateDB durability, or local-disk fsync.
- [ ] Upload immutable blobs concurrently with bounded workers and retries; apply dependent
  metadata, grant indexes, and indexing events to SlateDB in an ordered, consistent prefix.
- [ ] Retire overlay mutations after applying them to SlateDB without erasing newer changes.
  Distinguish visible, applied, and durable progress.
- [ ] On restart, recover the durable prefix and discard pending staging/overlay state. Recreate
  sessions and invalidate client caches; losing recent acknowledged changes is now allowed.
- [ ] Repeat crash tests at upload, WAL, batch, and overlay-retirement boundaries. Ensure surviving
  metadata never references local-only bytes and related indexes are never partially updated.

**Done when:** fsync and untar remain responsive with GCS persistence paused, other clients see
published bytes immediately, and crashes lose at most a consistent suffix of recent mutations.

## 11. Client caching, batching, and workload performance

- [ ] Compare the synchronous and cached paths on small-file untar, recursive stat/list,
  nearby-folder reads, and mostly uncontended writes from hundreds of clients.
- [ ] Add client metadata/content caches and kernel cache settings with subscription invalidation,
  bounded staleness, and session recreation rules.
- [ ] Add directory attribute prefetch and folder-local read-ahead where measurements justify them.
- [ ] Batch/pipeline small-file operations while keeping publication boundaries, retry behavior, and
  per-file serialization explicit.
- [ ] Measure cache misses, lock contention, staging pressure, upload backlog, and persistence lag;
  tune limits and concurrency without adding persistence waits to normal fsync.

**Done when:** warm traversal and untar improve measurably over the baseline with bounded
memory/disk usage and passing isolation, revocation, concurrency, and recovery checks.

## 12. Search feasibility and indexing

Run the first two tasks early with synthetic data. Full integration needs persisted filesystem state
and mutation events; it does not depend on implementing server caching.

- [ ] Build a focused LanceDB OSS/GCS spike with text, MIME type, typed xattrs, effective grant
  lists, file IDs, and content-version IDs; open workspace tables lazily.
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
  complete rebuild from persisted state and expose indexing lag/failures.

**Done when:** newly persisted content becomes searchable within the accepted delay, while live
revocations hide results immediately and index replay/rebuild preserves isolation.

## 13. Tenant scale and deployment

- [ ] Bound per-workspace/session resources: handles, requests, caches, staging, subscriptions,
  uploads, and indexing. Prevent one busy workspace from monopolizing shared workers.
- [ ] Load-test tens of thousands of mostly idle workspaces alongside active ones; bound lazy-open
  table/cache residency and verify cleanup when workspaces become idle.
- [ ] Add metrics for API latency, authorization failures, dirty bytes, visible/durable lag, worker
  failures, notification gaps, and search freshness without logging user content or secrets.
- [ ] Package one server with GCS access, local scratch storage, authenticated transport,
  health/readiness, restart behavior, and bounded shutdown.
- [ ] Exercise a fresh server using only GCS-backed state; document the expected loss window and
  recovery procedure for the cached path.
- [ ] Add a Linux FUSE acceptance suite and a repeatable multi-session workload for rollout.

**Done when:** one server can serve isolated tenants predictably under load and recover on a fresh
machine with the documented durability tradeoff.

## Future work

- [ ] Add owner epochs identifying each server's ownership tenure so stale revisions and cursors
  can be rejected across ownership transfers, beyond the PoC's session-reset behavior.
- [ ] Implement writer fencing for foreground serving and background persistence; an epoch alone
  is not a fence. Test overlapping owners before supporting multiple server instances.
- [ ] Add multi-shard routing, shard movement, ownership transfer, and automated failover.
- [ ] Validate macOS FUSE mounting and compatibility; native macOS server development continues
  throughout the PoC.
- [ ] Add POSIX features such as hard links, symlinks, and advisory locks after deciding their
  semantics and authorization implications. Do not silently emulate unsupported operations.
- [ ] Extend search formats and query features beyond the first text/metadata/grant pipeline.
