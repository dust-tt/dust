# DFS implementation snapshot — handover

[Current clean benchmark](../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

The default `dfs-mount` now uses [one-second metadata/revision validation and optimistic publication](design/ONE_SECOND_VIEW.md), direct data I/O and durable explicit fsync. Watch/kernel-cache implementation details below describe `dfs-mount-legacy`; historical benchmark binary names remain unchanged.

- **As of 2026-10-05:** this describes the RocksDB filesystem prototype and its embedded Tantivy search. Behavior below is implemented unless explicitly labelled as a gap. Source links name the responsible types/functions; proposal documents are not evidence of implementation.
- **Build inputs:** preserve [Cargo.toml](Cargo.toml) and [Cargo.lock](Cargo.lock) together.
- **Reading order:** runtime map → identities/storage → publication/recovery → client → search → operational limits. [CONTRACTS](CONTRACTS) records invariants; [server implementation design](design/SERVER_IMPLEMENTATION_DESIGN.md) and [HA design](design/HA_DESIGN.md) describe further work.

## 1. Runtime and code map

| Part | Current responsibility | Entry points |
| --- | --- | --- |
| `dfsd` | One engine, one source store, all configured tenants; authenticated RPC; background persistence; optional embedded search | [dfsd.rs](src/bin/dfsd.rs), [engine.rs](src/engine.rs), [rpc.rs](src/rpc.rs) |
| `dfs-mount` | Linux FUSE daemon; one credential/session and authorized namespace; private caches, handles, reconciliation | [dfs-mount.rs](src/bin/dfs-mount.rs), [mount.rs](src/mount.rs), [driver.rs](src/driver.rs) |
| Rust client | Login, framing, bounded transport retries, snapshots, publication receipts | [client.rs](src/client.rs) |
| Local source store | RocksDB metadata/content/journal, snapshots, atomic batches, WAL sync | [store.rs](src/store.rs), [store_common.rs](src/store_common.rs) |
| Embedded Tantivy search | In-process indexer, immutable query generations, loopback HTTP | [lexical module](src/lexical/mod.rs) |
| Administration and experiments | Credentials/import/access operations, recovery checks, load and race probes | [dfsctl](src/bin/dfsctl.rs), [dfs-recovery](src/bin/dfs-recovery.rs), [dfs-load](src/bin/dfs-load.rs), [dfs-race-bench](src/bin/dfs-race-bench.rs) |

- Root crate: Rust edition 2024; RocksDB is the source backend. The optional `lexical-search` feature enables embedded Tantivy/Roaring/Axum search. [Feature definitions](Cargo.toml).
- `--search-index` enables one embedded Tantivy instance for the tenant selected by its administrator token. Omitting it runs only the filesystem service.
- The source engine has one publication mutex across tenants. There is no shard router, follower-serving engine, replication sidecar, or distributed namespace transaction in this crate.

## 2. Identities and data structures

[Types and wire operations](src/model.rs), [key encoding](src/store_common.rs).

| Identity | Meaning / lifetime |
| --- | --- |
| Tenant ID | Prefix for stored records and authorization boundary |
| Node ID | Random UUID string; stable through rename; replacement creates a different identity |
| Content version | Immutable manifest identity; write, truncate and setattr issue a new version |
| Entry token | Identity of a parent/name binding; rename changes it; content writes preserve it |
| Tenant head | Monotonic successful mutation sequence for that tenant |
| Authorization generation | Advances on reset-causing mutations, including rename, grants and group membership |
| Engine incarnation | Fresh random ID on every `Engine::open`; invalidates sessions, handles and source cursors |
| Engine publication prefix | Process-wide publication/persistence accounting; distinct from a tenant head |
| Request ID / retry epoch | Principal-bound idempotency identity with expiry and originating incarnation |
| Writer generation | In-memory exclusive content-writer fence, bound to session and node |
| Search slot | Tantivy's `u32` numeric node slot; unrelated to FUSE inode numbers |
| FUSE inode | Mount-local numeric identity; reference counted and never recycled within the mount |

The central stored shapes are small; file bytes live elsewhere:

```rust
pub struct Entry {
    pub node: Id,
    pub token: Id,
}
pub struct Manifest {
    pub size: u64,
    pub chunks: BTreeMap<u64, Id>,
}
```

- `Node`: ID, parent ID, name, file/directory kind, content version, entry token, size, mode, mtime and unlink flag. No hard-link count or symlink payload.
- `Chunk`: bytes plus SHA-256 checksum. Chunks are 64 KiB; changed chunks get new random IDs. Unchanged chunks are shared by successive manifests; this is not content-addressed deduplication.
- Sparse file ranges are absent manifest entries and read as zeroes. Reads verify stored chunk checksums. Maximum individual read/write payload is 1 MiB; maximum RPC frame is 4 MiB.
- File versions, unlinked nodes, retry records and journal records remain stored. There is no application-level history GC or quota refund on unlink. `retained_bytes` is cumulative batch accounting, not an exact measurement of live disk usage.

### Source storage layout

- Three RocksDB column families: `metadata`, `content`, `changes`; LZ4 compression. Values use bincode.
- Keys encode `(tenant, "1", family, ...)`: each UTF-8 component ends in `00 00`; embedded NUL is escaped as `00 ff`. Sequence numbers are zero-padded decimal strings for ordered scans.
- Schema 1 is checked during recovery. There is no general schema migration framework. Bincode struct/enum changes need explicit compatibility review.

| Column family | Logical key suffix | Value |
| --- | --- | --- |
| metadata | `state` | Schema, root, head, auth generation, journal floor, retained bytes, node count |
| metadata | `node / ID` | Current `Node`, including tombstones |
| metadata | `entry / parent / name` | `Entry { node, token }` |
| metadata | `version / node / version` | Immutable `Manifest` |
| metadata | `principal / issuer / subject` | Stable principal mapping |
| metadata | `grant_by_node / node / subject`, `grant_by_subject / subject / node` | Forward/reverse grants |
| metadata | `member / group / principal`, `groups / principal / group` | Forward/reverse membership |
| metadata | `request / principal / epoch / request` | Payload hash, original outcome, expiry, authorization targets |
| metadata | `publication / principal / epoch / request` | Verifiable publication identity |
| metadata | `search_grant`, `search_namespace_head`, `search_namespace_change / head` | Search grant labels and ancestry-change exclusion chain |
| content | `chunk / ID` | Immutable bytes and checksum |
| changes | `sequence / head` | Mutation notification/reconciliation record |

## 3. Authority, RPC and views

[Engine authorization](src/engine.rs), [search authorization](src/search.rs), [RPC framing and admission](src/rpc.rs).

- Credentials are loaded from a JSON file at startup. Login hashes the supplied bearer token with SHA-256 and matches its configured tenant/principal/admin/scope/expiry. There is no live identity-provider integration or credential reload.
- Permissions are additive over node ancestry and direct/group subjects: `READ`, `WRITE`, `LIST`, `TRAVERSE`, `CREATE`, `DELETE`, `RENAME`, `GRANT`. Scoped administrators still stay inside their scope. Groups contain provisioned principals, not nested groups.
- Reads and mutations check current source authority. An open handle, immutable version, cached grant or idempotency record does not independently grant access. Replaying a known result also checks current visibility of its recorded targets.
- `Engine::view` scans the tenant's live nodes, resolves inherited permissions, then produces the authorized projection. The scope root is named `files`; independently visible nodes with hidden ancestry get a `name~ID` projection. Canonical hidden parents are removed from returned nodes.
- View construction is bounded by node count and charged working bytes, but still materializes the tenant's live metadata before filtering. A narrowly scoped client does not make that server scan lazy. Export and startup validation have additional full scans outside this view budget.
- Session view pins allow `view:ID` read references to previously exposed identities, including an unlinked file. They remain session-bound and require current READ permission.
- Protocol: protobuf exposes `Call`, streamed `Snapshot`, and streamed `Watch`, each carrying an opaque bincode `Frame`. Domain errors are encoded errno/message values; transport errors use gRPC status. There is no wire-version negotiation. [proto/dfs.proto](proto/dfs.proto), [build.rs](build.rs).
- Server defaults: 64 global unary calls, 8 per tenant, 16 per connection; 10-second transport timeout. Snapshot admission is separate: 8 global / 2 per tenant. Watch admission: 64 / 8. Snapshot frames are policy-checked while streaming and slow consumers time out.
- Client: up to three attempts, each with a five-second complete RPC timeout; retries retain the same encoded request. Admission-only exhaustion returns `EAGAIN`; transport uncertainty on a mutation remains an unknown outcome (`ETIMEDOUT`), even if a later attempt returns a domain error.
- RPC work runs in blocking workers. A client/transport deadline does not roll back a source publication already executing.
- Non-loopback DFS RPC requires TLS certificate/key arguments. Search HTTP listeners require loopback. TLS terminators, service identity and Kubernetes ingress are external to these implementations.

## 4. Publication, conflicts and persistence

[Engine mutation and barriers](src/engine.rs), [client receipt API](src/client.rs), [writer fences](src/writer_leases.rs).

- **Publication:** hold the engine writer mutex → authenticate → check retry identity → validate current permissions and preconditions → construct one batch → publish → advance counters → notify. Metadata, chunks, version, retry outcome, publication identity and journal entry are in the same batch.
- **Content conflict:** write/truncate/setattr carry the expected whole-file version. A competing content change yields `ESTALE`, including disjoint writes and append. Append chooses current EOF only after validating the supplied base. No automatic merge or refreshed-base overwrite.
- **Namespace conflict:** unlink/rename carry source parent, name and entry token. Rename also carries the expected destination token or expected absence. Missing source is `ENOENT`; changed binding/destination is `ESTALE`.
- **Rename:** preserves node/content identity; changes parent/name/entry token. Checks source-parent `RENAME|DELETE`, destination-parent `RENAME|CREATE` (both also require `TRAVERSE`), source `GRANT`, and replacement target `DELETE`. Cross-parent cycle detection walks destination ancestry; it does not traverse every source descendant. Replacement tombstones the old destination atomically.
- **Unlink:** removes the entry and marks the node unlinked. Existing authorized handles retain the old identity; path-based access without a handle fails. Nonempty directory removal/replacement fails with `ENOTEMPTY`.
- **Idempotency:** the same principal/request/payload returns the original outcome without advancing the head. A mismatched payload is `EINVAL`. An expired retry or an unknown request from an old incarnation is `ESTALE`; it is not silently issued again as a new mutation.

### Local RocksDB mode

- `Store::publish` enables the WAL and uses `sync=false`. Success establishes visibility; it does not establish machine-loss durability.
- `dfsd` runs a WAL-sync task every 100 ms by default. This interval is scheduling policy, not a maximum loss window. Storage stalls/failures can extend the pending suffix.
- Persistence uses a separate mutex. Under the publication mutex it captures the engine prefix and pending-byte count; releases that mutex during `flush_wal(true)`; then confirms only the captured prefix and subtracts only those bytes. Concurrent newer publications remain pending.
- `PersistThrough` verifies the exact publication receipt against recovered source records and current authority before confirming persistence. `DurabilityLevel::Quorum` returns `EOPNOTSUPP`.
- A publish or WAL-sync error records a sticky storage failure and fences subsequent new mutations. The background task stops after sync failure; there is no automatic storage repair. Pending-byte pressure rejects new mutations with `EAGAIN`; retained-byte/node quotas use `EDQUOT`.
- SIGTERM/SIGINT initiates drain and persistence; draining rejects sessions/work. Abrupt termination can retain or lose an unsynced suffix. Grant/revocation changes in that suffix have the same durability limitation as file changes.

## 5. What concurrent clients observe

These are source publication outcomes with initially valid permissions and captured preconditions. [Complete matrix, modes and benchmark oracle](design/CONCURRENT_OPERATIONS.md), [executable scenarios](tests/support/namespace_races.rs).

| Race | Implemented outcome |
| --- | --- |
| Move `src → dest` vs write original file ID | Both can succeed; the bytes follow the original file to `dest` |
| Move vs fresh lookup of `src` | Lookup after the move gets `ENOENT`, unless `src` was recreated as a different node |
| Move vs rename/delete of captured `src` entry | First succeeds; second sees missing source (`ENOENT`) |
| Unlink vs write without handle | Write after unlink gets `ENOENT`; write before unlink succeeds |
| Unlink/replacement vs already-open writer | Handle keeps the old, possibly unlinked file; it never writes the replacement |
| Write/truncate/setattr vs another write on version V | First succeeds; second gets `ESTALE` |
| Create vs create of same name | One succeeds; other gets `EEXIST` |
| Move into expected-absent destination vs create | Create first makes rename `ESTALE`; rename first makes create `EEXIST` |
| Replace destination vs delete/move its captured binding | Later operation gets `ESTALE` |
| Remove empty directory vs create its child | Remove first: create `ENOENT`; create first: remove `ENOTEMPTY` |
| Move A into B vs move B into A | First succeeds; second gets `EINVAL` for a cycle |
| Move parent vs create child by parent ID | Both can succeed; child remains under the moved parent |
| Move out of inherited grant vs write through handle | Write after the move gets `EACCES`; handle does not preserve the old grant |
| Fenced writer vs ordinary content writer | Ordinary writer gets `EBUSY`; stale fenced generation gets `ESTALE` |

- Delete/recreate and rename-away/back invalidate captured entry tokens. Expected absence checks current absence, not whether the name was ever occupied.
- Namespace operations do not take exclusive content-writer ownership. They can move/unlink a fenced writer's file.
- Serialization applies to one mutation RPC, not an application's multi-RPC workflow. Cached mounted reads and asynchronous search visibility can lag successful publication.

## 6. Client namespace, handles and FUSE behavior

[Mount](src/mount.rs), [namespace cache](src/cache.rs), [inode ownership](src/inodes.rs), [FUSE dispatch](src/driver.rs).

- Mount preparation logs in, downloads the complete authorized view and optionally preloads bodies. Default preload is zero. Metadata lookup/readdir/getattr normally use local maps.
- `Namespace` owns `HashMap<ID, ViewNode>` plus `BTreeMap<(visible_parent, name), ID>`, source incarnation/head/auth generation, and charged bytes. Default admission: 100,000 nodes / 128 MiB. It is a retained namespace, not an LRU. An oversized view fails rather than loading only a partial namespace.
- FUSE exposes synthetic roots and the `files` / `shared` projection. UID/GID are mount configuration; source grant checks remain independent of local Unix mode checks. Names must be UTF-8.
- Ordinary read-only open is local and retains node identity plus fallback metadata; it is not a lifetime snapshot of the file. Reads use the current cached version while the node remains visible, or retained handle metadata after unlink, with a session view pin for source reads. Writable open obtains a server handle and current base version. Ordinary writes publish synchronously through direct I/O; read-only opens use kernel caching unless `--direct-io` or `O_DIRECT` applies.
- `Inodes` tracks lookup references, opens, in-flight work, notifications and directory snapshots. Retirement removes the active identity mapping; storage is reclaimed after references disappear. Default capacity: 200,000 records; exhaustion is `ENFILE`.
- Open directory handles retain an ordered entry snapshot for stable offsets; default aggregate budget is 32 MiB. They pin referenced inodes. Permission checks still apply when reading directories.
- A bounded mutation worker serializes queued FUSE work with reconciliation. Ordinary queue: 128 jobs and 4 MiB write-payload permits. Writeback has a separate five-slot queue/byte allowance, served by the same worker. Reads run asynchronously with separate admission.
- Attributes/dentries use a one-hour TTL, relying on explicit invalidation. This is not a one-hour remote visibility guarantee.
- Implemented operations include create/mkdir/read/write/truncate/setattr/unlink/rmdir/rename, readdir/readdirplus, access and synchronization. Rename supports `RENAME_NOREPLACE`; other flags are rejected. Advisory locking and statfs return `EOPNOTSUPP`; ioctl returns `ENOTTY`. Hardlinks, symlinks and xattrs are not implemented as filesystem features.

### Content cache and reads

[ContentCache](src/content_cache.rs), [Reader](src/reader.rs), [kernel prefetch](src/kernel_cache.rs).

- Kernel content pages are the main reclaimable cache for ordinary read-only access. Multiple applications using one mount share that mount's pages. Independent mounts have independent identity, authority, invalidation and daemon-cache state.
- Daemon fallback: 4 MiB by default; `(node ID, content version, chunk index) → Arc<[u8]>`. A hash map locates blocks; ordered access stamps implement LRU eviction. Zero budget disables retention.
- Demand and speculative blocks have separate LRU queues. Speculation is capped at one quarter of the daemon cache; it cannot evict demand blocks. A speculative hit becomes demand data. Read-ahead defaults to 256 KiB; `--daemon-prefetch` selects daemon retention instead of kernel-store prefetch.
- Missing adjacent 64 KiB blocks are coalesced into reads up to 1 MiB. In-flight fetches are deduplicated. Authority/version checks happen before cache use, network admission and reply delivery; stale asynchronous work cannot populate a newer generation.
- Default read bounds: four RPCs, 8 MiB in-flight response accounting with a 2× payload charge, 8 MiB retained replies, 1 MiB speculative range, 128 pending requests. Reply reservations survive until FUSE reply completion.
- Cache byte counters cover retained payloads, not all allocator/hash-map overhead or external `Arc` references. Kernel pages are outside daemon `--cache-bytes` and RSS accounting.

### Reconciliation and disconnection

[Reconciliation loop](src/bin/dfs-mount.rs), `Engine::changes` in [engine.rs](src/engine.rs).

- Watch notifications are hints. The mount also polls every 1,000 ms by default; the server watch checks heads periodically. A dropped event is repaired by comparing cursors.
- Changes within 128 positions can produce upserts/removals. Rename/policy resets, an old journal floor or a larger gap require a new full view. A different incarnation/invalid cursor is `ESTALE`.
- Reconciliation serializes namespace replacement with mutations, invalidates kernel names/attributes/pages, and gates reply delivery while invalidation is outstanding. Failed invalidation or a crashed worker stops the mount. Oversized refreshed metadata is fatal.
- Incarnation change triggers login and full view replacement; old handles remain stale. `EACCES` clears the accessible view, invalidates cached state and stops the mount. Other connection failures are logged/retried; already cached reads can continue while disconnected. Revocation visibility therefore depends on observing source state.
- Cache generations and experimental writeback inode retirement prevent old work from being reinterpreted against a replacement. A kernel-served cached read is not a fresh server authorization round trip.

### Synchronization and experimental writeback

[Receipt tracking](src/mount.rs), [client writer states](src/writeback.rs), [server leases](src/writer_leases.rs).

- **Default:** publication-only file/directory `fsync`; it reports publication/conflict errors but does not request a WAL durability barrier. `--publication-only-sync` explicitly selects this default.
- **`--durable-sync`:** retains publication receipts for affected files/parents; `fsync`/`fsyncdir` resolve unknown outcomes and use `PersistThrough`. Flush checks publication state without requesting durability. Release best-effort closes the server handle and returns success; it is not a durability guarantee.
- Receipt/unknown-outcome tracking is bounded: default publication capacity 100,000 and a separate 128-target unresolved bound. Unknown publication blocks dependent work. Resolution requires the original identity/digest; absence after recovery is `ESTALE`. Some failed inode states require a fresh mount.
- **`--experimental-kernel-writeback`:** requires cached I/O; writable opens with READ+WRITE authority acquire an exclusive server writer generation. WRITE-only access stays on the direct path. Default lease is 30 seconds; expiry is capped by session expiry; renewal cannot revive an expired generation.
- Same-session opens share writer state/base/error; competing sessions cannot publish content while it owns the lease. Phases include clean, dirty, publishing, conflicted, revoked and outcome unknown. Failed state is sticky; subsequent dirty pages cannot silently rebase.
- Default writeback capacity: 128 inodes; FUSE background write requests: four. Dirty kernel pages are volatile and are not a server commit. Remote changes can retire the inode and make old descriptors fail with `ESTALE`/kernel-surfaced errors.

## 7. Server memory and datasets larger than RAM

[Native cache configuration](src/store.rs), [reservation primitive](src/memory.rs).

| Owner | Current policy | Consequence under pressure |
| --- | --- | --- |
| RocksDB blocks, index/filter blocks | Shared native LRU across source column families; default 128 MiB | Evict blocks and read SSTs on demand |
| RocksDB memtables | WriteBufferManager attached to that cache; default 64 MiB, stalls allowed | Flush/stall; memtable charges are included in cache accounting |
| Server sessions/handles | Count limits: 256 / 100,000 | Admission errors; not evicted live handles |
| Server authorized view | Default 256 MiB working charge plus node limit | Reject over-budget construction |
| Client namespace | 128 MiB / 100,000 nodes | Reject or terminate refresh; no lazy metadata fallback |
| Client bodies | Kernel reclaim plus bounded daemon LRU | Re-fetch evicted content |
| Tantivy segments | Memory-mapped files; writer configured for two threads / 64 MiB | File-backed residency can be reclaimed; writer remains separate memory |
| Tantivy metadata/lookups | Full heap maps/bitmaps, old generations retained by readers | No global byte cap or disk paging for these structures |
| Tantivy ingestion | 32 MiB reservation budget; document retains its charge through indexing | Bounded wait/rejection before extraction allocation |
| Permission bitmaps | Per-generation map, cleared at 128 entries | Count bound only; not byte-bounded LRU |

- Environment controls: `DFS_ROCKSDB_MEMORY_BYTES`, `DFS_ROCKSDB_WRITE_BUFFER_BYTES`; write-buffer minimum 1 MiB and no larger than cache capacity. Native memtable/arena sizes scale with the configured budget.
- The cache is not configured as a strict whole-process cap. Pinned blocks, native allocations, snapshots, query work, old generations, mmap/kernel pages and serialization can exceed the configured cache size. Do not sum memtable usage with cache usage as if they were disjoint.
- Body data can exceed RAM on both source and client. Full namespace/search metadata remains a scaling boundary. LRU configuration alone does not solve a million-node mount or a large Tantivy namespace rebuild.
- `StoreMemory` can be shared with the separate projection foundation. Current embedded Tantivy serving does not open that projection, so it does not yet gain its disk-backed memberships.

## 8. Search export and freshness

[Export leases](src/export.rs), [source query context](src/search.rs).

- Export requires an unscoped tenant administrator. A persistence barrier captures a source snapshot; node/version metadata is retained in the lease and bodies are read through immutable manifests.
- At most four leases; 60-second expiry capped by session expiry; renewal preserves the captured boundary. Pages contain at most 256 nodes/grants; body reads at most 1 MiB. More than 4,096 change positions forces full reconciliation.
- RPC `BeginIndexSnapshot` materializes the full live-node list. Embedded Tantivy uses `begin_index_delta` to export changed IDs when eligible. Pagination does not make full export storage lazy; node count is checked after materialization.
- Search context obtains current direct/group grants, scope and a chain of namespace exclusions. Grant definitions are capped at 4,096; traversing more than 256 namespace-change events produces an incomplete context.
- Queries filter candidates by current grants and excluded ancestry, then validate candidate IDs against source versions/entry tokens/permissions. Stale candidates are removed and `incomplete` is set; missing rows are not necessarily refilled to `k`.
- Results report `indexed_through = { tenant, incarnation, head }`. Publication success does not imply search visibility, and offset pagination is not a stable query snapshot across requests.

## 9. Embedded Tantivy: current bitmap storage and rebuild

[Index and commit path](src/lexical/index.rs), [query/ranking](src/lexical/query.rs), [literal ranking](src/lexical/ranking.rs), [HTTP](src/lexical/http.rs).

- `Metadata` holds a complete `BTreeMap<ID, Record { node, slot, status }>` and next slot. `Lookups` holds slot→ID, all/body/file bitmaps, and subtree/name/trigram→`RoaringBitmap` maps. Subtrees include the root's own slot. Bitmaps contain integers, not file bytes.
- `Published` owns `Arc<Metadata>`, `Arc<Lookups>`, a Tantivy searcher, slot→document-address map and permission cache. Swapping the published `Arc` gives new queries the new generation; running queries retain the old one.
- Refresh clones the complete metadata map. Unchanged content versions reuse indexed bodies. Body-only updates can reuse the lookup `Arc`; create/remove/name/parent/kind/indexability changes rebuild `Lookups` across all records. Body changes can also rebuild the document-address map.
- **The small-namespace-change bottleneck remains:** this serving path does not incrementally patch ancestor/name/trigram memberships. Putting the existing whole maps behind `Arc` has not removed rebuild cost.
- Supported bodies: nonempty UTF-8 up to 8 MiB without binary control characters; statuses are `indexed`, `empty`, `unsupported`, `too_large`, or `directory`. One complete body document per file. Extraction reservations retain text once for text/trigram indexing.
- **Durable artifacts:** write the full metadata JSON to a UUID-named file, flush/sync it and the directory; commit Tantivy with a payload naming that artifact and source cursor; reload the reader; build coverage/address maps; publish the generation. The Roaring lookup maps themselves are not persisted.
- **Restart:** validate Tantivy schema/commit payload and referenced metadata. Matching-incarnation restore rebuilds Roaring lookups from metadata. A normal `dfsd` restart has a new incarnation, so the old generation is not published; the indexer performs a new full source reconciliation/body build. Corrupt/incompatible checkpoint handling can fail startup; this is not a general automatic repair pipeline.
- Refresh failure rolls back uncommitted Tantivy work. A failure after commit or failed rollback fences the index writer until restart. Old query generations may remain available with live-source filtering. There is no metadata-artifact GC.
- HTTP: `/v1/workspaces/{workspace}/lexical/{nodes|documents}/query`, `/lexical/status`, `/lexical/openapi.json`; default port 7447, poll 250 ms, eight query permits, 16 KiB request limit. `k=1..100`, offset ≤10,000, text ≤4,096 bytes, ≤64 query terms, 10-second query deadline and bounded response text.
- Nodes support all/ID/exact-name/prefix/substring; documents support all/ID/literal-substring/word match/phrase. Trigram candidates are exact-verified. Word matching lowercases tokens; names/literal substrings remain case-sensitive.

### Implemented foundation that is not in the serving path

[Projection](src/lexical/projection.rs), [membership encoding](src/lexical/membership.rs), [delivery status](design/SERVER_IMPLEMENTATION_PROGRESS.md).

- Separate RocksDB `Projection` supports format/epoch/generation/next-slot state, owned snapshots, origin-bound batches and serialized durable application. Keys ≤16 KiB, values ≤64 KiB, batches ≤16 MiB; values and edits carry memory reservations.
- Membership keys identify family (`n` name, `g` trigram, `s` subtree), text and a block of 4,096 slots. Empty membership is absent; singleton is a compact `u16` offset; larger sets use a validated Roaring encoding. Edits coalesce each touched chunk once.
- These components have tests, but `LexicalIndex::refresh/search` still use the full heap structures above. Source-journal integration, complete projection row schema, paired Tantivy/projection recovery, durable redo, incremental serving and GC are not wired in.

## 10. Shutdown, restart and failure handover

[Recovery validation](src/engine.rs), [recovery tests](tests/recovery.rs), [persistence tests](src/persistence_tests.rs), [mounted failures](scripts/failure-scenarios.py).

| Failure / transition | Current behavior and recovery boundary |
| --- | --- |
| Clean local server shutdown | Drain, WAL sync, stop serving; restart validates the store and creates a new incarnation |
| SIGKILL / machine loss in local mode | Recover RocksDB WAL with point-in-time recovery; unsynced suffix is not guaranteed; startup validates namespace/manifests/chunks/journal/retry indexes |
| Lost local source disk | No built-in remote restore or replica promotion; local search artifacts are not authoritative source backups |
| Lost mutation reply | Retain original request; resolve/replay that identity; stop dependent writes while outcome is unknown |
| Storage error / full disk | Sticky engine write fence; inspect metrics/logs, repair storage and restart; no in-process repair/unfencing |
| Server restart | All sessions/handles/writer leases disappear; mounts relogin/reconcile; old descriptors may fail; searches must match the new source incarnation |
| Client daemon/pod loss | Private namespace, receipts and caches disappear; unsubmitted dirty kernel writes have no server guarantee; new mount starts from a fresh view |
| Dropped watch / network outage | Poll/reconnect repairs metadata when reachable; cached reads may lag; writes require source publication |
| Permission loss | Source rejects later work; mount invalidates once observed; search rechecks source authority |
| Expired exclusive writer | Old generation cannot publish/renew; failed local inode state remains sticky |
| Search build failure | Do not publish partial coverage; retain prior generation where possible; report indexing failure/incomplete results or unavailable |
| Namespace beyond admission budget | Fail mount/view construction or refresh; no automatic spill-to-disk namespace |
| Pod OOM / termination grace expiry | Abrupt process-loss boundary; graceful drain and cache retention cannot be assumed |

- Startup validation is substantial work: it scans stored nodes/entries/grants/memberships/manifests/chunks/journal/retries. Long histories affect recovery even when the live dataset is small.
- `journal_floor` and cursor reset logic exist, but this source does not implement journal/history reclamation. Quotas bound admitted growth, not recovery latency.
- Default cached reads, source publication, local persistence and search indexed head are distinct observability boundaries. Record which one an incident or benchmark concerns.

## 11. Deployment and Kubernetes status

[Server arguments](src/bin/dfsd.rs), [mount arguments](src/bin/dfs-mount.rs), [deployment instructions](DEPLOYMENT.md), [existing service template](deploy/dfsd.service).

| Configuration | Default / effect |
| --- | --- |
| `dfsd --db`, `--credentials` | Required source path and startup credential file |
| `--listen`, `--sync-ms` | `127.0.0.1:7443`, 100 ms |
| `--tenant-bytes`, `--pending-bytes` | 8 GiB cumulative retained quota, 256 MiB persistence backlog |
| `--max-nodes`, `--snapshot-bytes` | 100,000 source nodes, 256 MiB authorized-view working budget |
| Session/retry duration | One hour, capped by credential expiry; `Limits` fields rather than CLI flags |
| `--writer-lease-ms` | 30,000; accepted range 1..60,000 |
| `--search-index`, `--search-token-file` | Enable embedded Tantivy for token's tenant |
| `dfs-mount --token-file`, `--mountpoint` | Required client identity and mount destination |
| `--cache-bytes`, `--prefetch-bytes`, `--read-ahead-bytes` | 4 MiB, zero, 256 KiB |
| `--durable-sync`, `--experimental-kernel-writeback` | Both opt-in; independent persistence/buffering choices |
| `--metrics-file` | Optional periodically replaced JSON client metrics file |

- Supplied deployment artifacts are systemd templates, cloud experiment scripts and a Rust/FUSE build Dockerfile. There are no Kubernetes manifests, operator, CSI driver or implemented rollout protocol here.
- Kubernetes is the deployment target in the proposal. Current code still needs exactly one source owner per local database. Multiple replicas behind a load-balanced Service would not share sessions or create a coherent engine.
- The authoritative RocksDB database volume must survive replacement. Search readiness is separate from source readiness; a listening RPC socket does not prove an index is caught up.
- A supervisor must be outside the DFS process to survive its death. The embedded indexer shares the server failure domain. No independent in-process supervisor or HA failover exists.
- Linux FUSE requires `/dev/fuse` and mount lifecycle management. Required pod privileges, mount propagation and application remount/reopen behavior are not packaged by this repo.
- Resource accounting must include daemon/native memory, kernel/mmap pages, old query generations, recovery scratch and any external/sidecar processes. Two mounts or separate replica processes do not share Rust heap caches merely because they use the same backend.

## 12. Verification, observability and remaining work

- **Execution rule:** builds, tests and benchmarks run on GCP `dust-dev`, not locally. [Reproduction policy](README.md#build-and-test). Rust 1.96/Linux/FUSE/Clang are used by the existing campaign tooling.
- **Core suites:** [core](tests/core.rs), [store](tests/store.rs), [RPC](tests/rpc.rs), [reader](tests/reader.rs), [publication](tests/publication.rs), [recovery](tests/recovery.rs), [native cache pressure](tests/rocksdb_memory.rs), [lexical](tests/lexical.rs), [namespace races](tests/namespace_races.rs).
- **Campaign:** [server-implementation-check.py](scripts/server-implementation-check.py) and [server-implementation-campaign.py](scripts/server-implementation-campaign.py) preserve source/binary fingerprints and evidence. [Clean benchmark](../dfs-bench/scripts/run.py) includes the ordinary filesystem corpus and both race harnesses despite its historical name.
- **Source metrics:** published/persisted prefixes, pending bytes, persistence age, sticky storage error, retained accounting, SST bytes and pending compaction. Native `StoreMemory::usage` exposes cache/pins/memtables; not every native metric is included in RPC `Metrics`.
- **Client metrics:** RPC categories/bytes, cached namespace charge, inode references, FUSE operations, read admission, prefetch usefulness/eviction and writeback state. Search exposes authenticated status plus indexing logs; Tantivy successful queries include stage timing.
- **Fault injection:** `dfsd --fault-phase` supports before/after publish and before/after persist, with `--fault-after`; tests separately inject WAL-sync failure. Preserve original source and binary hashes when reproducing a failure.
- **Known unfinished implementation:** incremental disk-backed Tantivy metadata/memberships; paired projection recovery and source lineage; bounded full export/startup scans; history/abandoned-artifact GC; complete process memory governance; lazy client namespaces; Kubernetes lifecycle/readiness; routing, replication and distributed fencing. Details belong in [server delivery gates](design/SERVER_IMPLEMENTATION_PROGRESS.md) and [HA proposal](design/HA_DESIGN.md), not in claims about current behavior.