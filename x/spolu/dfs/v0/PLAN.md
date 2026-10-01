# Implementation plan

[DESIGN.md](DESIGN.md) describes the architecture; [CONTRACTS](CONTRACTS) defines the invariants.
The server scaffold, object model, synchronous storage, workspace/session APIs, namespace reads,
directory creation, metadata updates, grant administration, moves/removal, root/shared views,
synchronous file I/O, and a Linux FUSE client are implemented today.

Work in small increments: each checkbox should produce a reviewable change with a focused test or
demo. Split a checkbox further when needed. Keep the server runnable, update API documentation and
contracts alongside behavior, and introduce abstractions when a concrete caller needs them.

The PoC uses **one server process serving one shard**. First build a synchronous end-to-end system:
read metadata from SlateDB and content from GCS; finish required GCS uploads and durable SlateDB
batches before acknowledging mutations. Metadata-only operations need no blob upload. Do not add a
dfs-managed content cache or metadata overlay until that baseline works through FUSE and survives
restart. Bounded request buffers, open handles, and ephemeral sessions can live in memory.
Temporary disk files may assemble uncommitted content; acknowledged mutations must recover without
them. Large-file transfers must not require whole-file buffering in RAM.

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
- [x] Define API errors and their HTTP mappings: missing, forbidden, conflict, invalid input,
  exhausted capacity, and unavailable server. Avoid leaking inaccessible object details.
- [x] Define the initial supported filesystem semantics: names, timestamps, modes, xattr encoding,
  and explicit errors for unsupported operations. Add wire types as their endpoints arrive.

Workspace IDs are opaque caller-provided strings. Metadata revisions are per-object counters;
content revisions are immutable content-version UUIDs. Session recreation discards cached state.

**Done when:** identity survives renames in model tests, URI behavior matches the design, and wire
errors can later map consistently to FUSE errors.

## 2. Synchronous GCS and SlateDB storage

- [x] Configure GCS credentials, bucket/prefix separation, and SlateDB lifecycle. Add a real-GCS
  integration fixture alongside fast local tests.
- [x] Run the opt-in GCS fixture against a development bucket; GCS and local memory/filesystem
  backends exercise durable writes, close/reopen, immutable blob creation, and scoped cleanup.
- [x] Define versioned metadata encodings and unambiguous workspace/key prefixes, including
  arbitrary grant strings. Verify workspace isolation and prefix scans at the byte-encoding
  boundary.
- [x] Implement immutable blob upload and download by workspace/object/content version.
- [x] Implement metadata get, prefix scan, and atomic batch operations directly against SlateDB. Use
  consistent read views when an operation spans several keys.
- [x] Verify SlateDB batch, WAL, and durability guarantees. Wait for the required durability
  boundary before acknowledging a synchronous mutation.
- [x] Implement the commit ordering: upload any new blobs, then atomically commit metadata, indexes,
  and replayable indexing events. Handle upload or database failure without dangling references.
- [x] Reopen persisted state on startup without relying on a surviving local cache or disk.

**Done when:** storage fixtures survive a fresh process, and failed uploads cannot publish metadata
that references missing bytes.

Validated on 2026-09-30 against `dust-dev-dfs-poc-spolu-20260930` in `dust-dev`, under
`dfs-dev/spolu/tests/<uuid>/`, with local ADC. Local and GCS subprocess tests kill an acknowledged
writer and recover metadata, indexes, events, and blobs in a fresh process. Upload failures and
withheld/failed WAL persistence are covered locally; the broader failure matrix remains in group 8.
See [server/STORAGE.md](server/STORAGE.md) for formats and commit guarantees.
Uploads and reads now stream with bounded buffers (group 6); whole-file read helpers are test-only.

## 3. Workspace creation and sessions

- [x] Protect `POST /workspaces` with the server API key. Return a fresh workspace key once; persist
  only its hash. Use explicit test credentials with the real authentication path in tests.
- [x] Let workspace keys mint sessions with any supplied grant set in their own workspace.
  Reserve future grant administration for workspace keys; session keys cannot change grants.
- [x] Persist workspace authority, root, initial root grants, and event through one synchronous batch.
- [x] Implement session creation with opaque keys, expiry, fixed workspace/grants, and the limit
  of 512 distinct grants. Treat grant strings as opaque values.
- [x] Add bearer-session lookup, explicit closure, expiry cleanup, and rejection after server
  restart. Recreated sessions discard previous namespace state and subscriptions.
- [x] Keep session creation limited to workspace and grants; reject unknown fields.

**Done when:** two sessions can connect to one workspace, while expired keys, invalid credentials,
and cross-workspace requests fail. Session-supplied grants never attach to objects.

Local tests cover concurrent creation, key separation, grant limits, expiry/closure, and interrupted
workspace persistence. The GCS fixture verifies durable roots/grants and workspace-key reuse after
restart while old session keys fail.

## 4. Persistent namespace and grant enforcement

- [x] Implement object lookup, stat, and paginated directory listing with entry attributes.
- [x] Implement directory creation and metadata updates (MIME type, xattrs, timestamps, and modes)
  through synchronous metadata batches.
- [x] Maintain explicit object-to-grant and grant-to-object indexes atomically in SlateDB, with
  workspace-key-authenticated listing and attachment/revocation APIs.
- [x] Resolve effective grants through current ancestors and authorize every operation against a
  consistent view. Do not cache dfs metadata or authorization decisions yet.
- [x] Implement rename/move, unlink, and directory removal, including collision checks, cycle
  prevention, and nonempty-directory errors. Specify replacement behavior explicitly.
- [x] Add per-object concurrency control without holding a file's write lock across unrelated files.

Reads enforce current inherited grants within one snapshot per request. Listing uses exclusive name
cursors and fresh authorization per page; concurrent edits can require restarting the listing.
Namespace and grant mutations prepare from a snapshot, acquire workspace/object locks in ID order,
then validate the workspace change sequence under the shared publication lock before submitting.
Stale attempts release locks and redo authorization and lock discovery; 16 stale attempts return
`conflict`. Errors/no-ops validate too, idle locks are reclaimed, and namespace locks release before
the WAL wait. Content/request gates introduced in group 6 span each file mutation through durability.
Workspace-wide validation can retry after unrelated writes; narrower checks are deferred.
Metadata and grant updates require the expected revision. Authorization tests cover grant unions,
subtree moves without descendant rewrites, and queued mutations observing revocations before
publication; denied operations leave no changes or events. Future endpoints must reuse these
boundaries. Rename requires both parents; replacement is opt-in for files or empty directories.
Unlink/rmdir remove both grant indexes; blobs remain for recovery.
Local interruption tests verify atomic recovery; the GCS fixture verifies mkdir, metadata updates,
renames, removals, and both grant indexes after reopening. Grant patches update explicit attachments
only; revocation cannot override inherited access.

**Done when:** sessions can traverse authorized persisted trees; moves and grant changes immediately
affect access, and failed mutations leave namespace and indexes unchanged.

## 5. Session roots, shared entries, and virtual mounts

- [x] Discover accessible roots through SlateDB's grant indexes, with deduplication and pagination.
- [x] Render authorized workspace-root entries and reserve the synthetic `/shared` folder.
- [x] Populate `/shared`, omit entries reachable through authorized ancestors, and append
  `--<object ID>` to every direct shared entry.
- [ ] Reintroduce the session-creation `mounts` argument when implementing virtual mounts.
- [ ] Validate mount paths, overlaps, namespace collisions, target directory type, workspace, and
  current access when creating sessions.
- [ ] Resolve mount targets by ID and synthesize virtual parents such as `/current`.
- [ ] Implement alias traversal and virtual `..`; reject mutations of synthetic parents and mount
  entries. Recheck access when a target is moved, deleted, or has its grants revoked.

The first three tasks are implemented. Read APIs accept well-known `root` and `shared` IDs.
Shared discovery merges grant prefixes in object-ID order with bounded candidate pages; filtering
can produce empty pages with a continuation. Root/canonical listings use name order. Shared lookup
extracts the ID from its mandatory suffix and rechecks access and the current rendered name; no
extra index is needed. Synthetic directories are read-only. FUSE follows visible parents inside
`/shared`; custom virtual mounts and the unchecked tasks above remain deferred.

**Done when:** sharing `/spolu/C` exposes `/shared/C--<uuid>` without exposing `/spolu`; conversation/pod
aliases survive target renames and cannot reveal hidden ancestors.

## 6. Synchronous file I/O

- [x] Define open-handle lifetime, writer serialization, append/truncate behavior, and visibility
  before fsync. Define what happens to open files after unlink and grant revocation.
- [x] Separate content transfer from metadata commit. A completed upload produces an internal
  workspace/object/version/size descriptor; metadata batches reference it instead of carrying bytes.
- [x] Stream sequential creation/replacement from HTTP to GCS in bounded chunks, including empty
  files and streams whose size is initially unknown. Preserve create-only immutable blob semantics
  and determine the actual size before publication.
- [x] Bound chunk sizes, queued bytes, and upload concurrency with backpressure and a shared server
  memory budget. Apply limits across concurrent transfers, not just individually.
- [x] Stream reads from GCS through HTTP and support offset/length ranges against a fixed content
  version. Avoid collecting full files in memory on either the server or client.
- [x] Implement random writes, append, and truncation using temporary disk files to assemble fresh
  immutable versions; stream existing bytes into scratch storage when needed. Bound disk usage,
  handle exhaustion, and clean up abandoned transfers. A version initially remains one whole blob.
- [x] Finish each content upload, then recheck authorization and expected revisions before atomically
  publishing metadata, indexes, and events. Wait for SlateDB durability before acknowledging the
  mutation; upload completion alone does not publish the file. Metadata-only mutations need no upload.
- [x] Implement fsync as a barrier for preceding writes. Another session must then see the persisted
  metadata and bytes through the server.
- [x] Add request IDs/revision checks where retries could duplicate or overwrite mutations. Resolve
  ambiguous commit outcomes without assuming that a timed-out request failed to commit.
- [x] Test files larger than the memory budget, concurrent transfers, range reads, slow consumers,
  interrupted uploads, and disk exhaustion. Verify bounded memory and no partial publication.

Implemented upload publication, bounded versioned reads, session handles, serialized edits/append,
truncate, fsync sequences, and durable request receipts. Random edits rewrite one whole immutable
blob using quota-reserved anonymous disk. HTTP disconnect cannot cancel admitted publication;
shutdown drains jobs. The initial PoC invalidates handles after unlink; POSIX retention is deferred.

Local tests cover 80 MiB files, shared read/write backpressure, scratch quota/ENOSPC handling,
interrupted bodies, concurrent appends, stale versions, revocations, fsync ordering, and recovery.
Withheld WAL tests discard an unacknowledged batch or recover one atomic mutation/receipt despite a
lost response. The GCS fixture also exercises file API creation, edits, reads, and retries after restart.

**Done when:** one session writes and fsyncs a file, another reads it from persisted state, and a
server restart preserves acknowledged changes. A competing writer waits without blocking others.
Large-file transfers stay within the configured memory budget and recovery needs no scratch files.

## 7. First Rust FUSE client and end-to-end baseline

- [x] Add a Rust API client and share protocol types where needed. Configure endpoint, session
  credentials, and mount location without logging tokens or placing them in URLs. Preserve streaming,
  range reads, and backpressure through the client.
- [x] Set up a Linux sandbox with `/dev/fuse` and mount permissions; use existing `dust-sandbox`
  conventions. Keep the server runnable natively on macOS.
- [x] Map object IDs and virtual namespace positions to mount-local inodes, with correct parent
  traversal and inode/handle lifetimes.
- [x] Implement lookup, getattr, readdir, open, and read; mount an authorized tree read-only first.
- [x] Add create, mkdir, write, truncate, rename, unlink, rmdir, and supported xattr operations.
- [x] Implement flush/fsync/release and propagate failures. Never acknowledge fsync while writes
  remain only in the client; return explicit errors for unsupported filesystem operations.
- [x] Use conservative client/kernel cache settings and validate two simultaneous mounts.
- [x] Record baseline timings for `ls`, `find`, `cat`, edits, and small-file `untar`; repeat reads
  after restarting the server with no surviving local disk.

**Done when:** FUSE → server → GCS/SlateDB works end to end with sharing and two clients. This is
the gate before adding dfs server caching; slow synchronous performance is expected at this stage.

Implemented `dfs-protocol`, the portable blocking `dfs-client`, and Linux-only `dfs-fuse` using
`fuser` 0.18. Native macOS builds/tests need no FUSE driver; macFUSE is excluded. The baseline mount
takes a session-key file, uses zero metadata/name TTLs, and direct I/O without kernel writeback.
Section 11 adds client caching and bounded kernel metadata TTLs.
Inodes retain visible parents; directory paging uses bounded cursors. Writes/retries, sticky errors,
and flush/fsync use the server protocol. Synthetic root/shared entries remain read-only.

Validated real Linux mounts from macOS through Docker, including two grant scopes, revocation on
open handles, session closure, quota/flush failures, multi-page directories, and unsupported locks.
The GCS fixture kills the server, removes scratch, recreates sessions, and remounts acknowledged
files. An 80 MiB real-HTTP client test exercises streamed upload/read and ranges without whole-file
buffers. Commands are in [fuse/README.md](fuse/README.md); timings are in
[bench/FUSE.md](bench/FUSE.md). No CI job is added.

## 8. Synchronous recovery and failure handling

Deferred to prioritize section 10 and performance evaluation. Keep focused cached-path recovery
checks in section 10; broader failure coverage and reclamation remain pending here.

- [ ] Inject failures before/after upload, metadata commit, durability confirmation, and response.
  Include directory, grant, and multi-object mutations.
- [ ] Verify acknowledged mutations survive restart, interrupted mutations are atomic, and every
  recovered content reference exists in GCS.
- [ ] Reject old sessions after restart; clients recreate sessions and discard cached namespace
  state.
- [ ] Add conservative orphan cleanup that preserves live, open-handle, in-flight, and recoverable
  references. Validate deletion races before enabling automatic reclamation.
- [ ] Define request receipt retention and retry expiry before reclaiming durable receipts; never
  let an expired receipt silently turn an old retry into a second append or overwrite.
- [ ] Exercise read/write failures and retries with two clients while preserving tenant isolation.

**Done when:** the synchronous baseline recovers consistently from crashes and failures without
requiring local server state. There is still exactly one server process.

## 9. Change subscriptions and Product integration

Deferred until after section 10's performance evaluation.

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

Build on section 7's synchronous end-to-end baseline. Prioritize performance evaluation before
sections 8 and 9; include focused consistency and recovery checks for the new cached path.

- [x] Add bounded caches for persisted metadata and content; key content by workspace/object/version
  and keep authorization current. Compare behavior with the uncached baseline.
- [x] Add RAM staging with local-disk spill, capacity limits, dirty/clean tracking, and
  backpressure. Never evict unuploaded content.
- [x] Add an atomic metadata overlay and ordered mutation IDs. Keep pending references outside
  SlateDB until their blobs exist in GCS.
- [x] Serve reads, directory/grant scans, and tombstones through the combined overlay and SlateDB.
- [x] Publish staged bytes and metadata together. Change fsync to acknowledge server-side visibility
  without waiting for GCS, SlateDB durability, or local-disk fsync.
- [x] Coalesce superseded content versions within a contiguous persistence batch. Upload only its
  final referenced blobs concurrently with bounded workers and retries; apply dependent
  metadata, grant indexes, and indexing events to SlateDB in an ordered, consistent prefix.
- [x] Retire overlay mutations after applying them to SlateDB without erasing newer changes.
  Distinguish visible, applied, and durable progress.
- [x] On restart, recover the durable prefix and discard pending staging/overlay state. Recreate
  sessions and invalidate client caches; losing recent acknowledged changes is now allowed.
- [x] Repeat crash tests at upload, WAL, batch, and overlay-retirement boundaries. Ensure surviving
  metadata never references local-only bytes and related indexes are never partially updated.

**Done when:** fsync and untar remain responsive with GCS persistence paused, other clients see
published bytes immediately, and crashes lose at most a consistent suffix of recent mutations.

Implemented selectable `--write-mode cached` with shared immutable local pages, disk spill, bounded
staging, consistent overlay/base snapshots and paging, pinned reads, and ordered background persistence.
The worker coalesces up to 4096 queued mutations after a 100 ms interval and uploads with 16-way
concurrency by default. All receipts/events persist, while superseded content versions need not upload.
Workspace provisioning remains durable; graceful shutdown drains with a configurable timeout.

Focused tests cover paused persistence, two-session visibility/revocation, retries, spill/capacity,
coalesced versions and deletion, pinned old reads, upload/WAL crash boundaries, and overlay retirement.
Performance results and remaining full-file snapshot amplification are in [bench/CACHE.md](bench/CACHE.md).
Sections 8–9 remain deferred; no client cache or subscription changes are included.

## 11. Client caching, batching, and workload performance

- [x] Fix clean-cache admission/eviction for corpora larger than 8,192 files; retain bounded LRU
  entries, expose the entry budget, and verify hot reads and dirty pins under pressure.
- [x] Memoize metadata/ancestor authorization by exact workspace sequence and grant set; verify
  moves, revocation, snapshot isolation, and workspace separation with warm caches.
- [x] Give reads separate concurrency and smaller reservations within the shared transfer budget;
  add route timing/request counters and read-cache hit/miss metrics.
- [ ] Compare the synchronous and cached paths on small-file untar, recursive stat/list,
  nearby-folder reads, and mostly uncontended writes from hundreds of clients.
- [x] Measure 1/16/100 independent sessions through the real metadata API and SlateDB in-process;
  reduce false conflicts from simultaneous workspace-sequence retries with bounded jittered backoff.
  Keep mounted mixed-content workloads and network/persistence costs in the comparison above.
- [x] Extend the local diagnostic to stat/lookup/list/content reads and 4 KiB writes/fsync in both
  write modes. Admit bursts through a bounded 256-job queue while retaining 16 active jobs; verify
  cancellation, overflow, and authorization changes while waiting. HTTP/FUSE/GCS remain unmeasured.
- [x] Add client metadata/content caches and kernel cache settings with revision-check invalidation,
  bounded staleness, and session recreation rules.
- [x] Cap each client's revision-check starts to ten per second during write bursts, preserving
  the original freshness deadline and immediate local mutation invalidation.
- [ ] Rerun the mounted corpus benchmark and two-mount checks after contention backoff and
  revision-check pacing/file-job queuing; current sandbox restrictions prevent Docker and listening
  sockets.
- [x] Prefill child lookup/stat caches from directory listing attributes.
- [x] Run jd's unchanged correctness-checked corpus benchmark; compare server/client caches and
  kernel metadata reuse against the NFS reference, recording persistence drain and cache conditions.
- [x] Start with empty SST and immutable-content disk caches on every server startup; recover only
  from GCS and verify old local data is never reused, including after grant changes.
- [ ] Rerun jd's benchmark with a cold server and fresh mount after the latest cache/concurrency
  changes. Record one current results table; prior retained-disk measurements are not applicable.
- [ ] Measure a cold-start server near GCS;
  investigate metadata locality or folder prefetch if remote misses still dominate.
- [x] Cache negative kernel lookups within the same freshness deadline; let flush acknowledge
  completed server writes while preserving sticky errors. Explicit fsync still checks the server.
- [ ] Further reduce close overhead if it matters in end-to-end workloads. Missing-path checks now
  beat the reference; writable close still pays a FUSE round trip and server-handle cleanup.
- [ ] Add folder-local content read-ahead where measurements justify it.
- [ ] Replace whole-workspace metadata invalidation with targeted updates if measurements justify it;
  measure concurrent writers before enabling kernel content caching.
- [ ] Batch/pipeline small-file operations while keeping publication boundaries, retry behavior, and
  per-file serialization explicit.
- [ ] Evaluate persistent chunking or deltas if repeated full-file snapshots across persistence
  batches still amplify large-file random edits; current coalescing eliminates intermediate versions
  only within each selected batch.
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

- [ ] Handle ownership preservation during cross-filesystem `mv` into dfs. Define supported
  UID/GID and `chown` semantics while keeping grants authoritative; cover moves that copy content
  successfully but currently report `failed to preserve ownership: Operation not supported`.
- [ ] Preserve open files after unlink/replacement, with detached metadata, explicit grant semantics,
  retained content, and last-handle reclamation, before claiming POSIX open-after-unlink support.
- [ ] Add workspace-key rotation/recovery and revocation, including lost creation responses and
  explicit decisions about invalidating already-issued sessions.
- [ ] Evaluate chunked immutable content and manifests if small edits to large files make whole-version
  uploads too expensive. Define atomic publication, range reads, and reclamation for shared chunks.
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
