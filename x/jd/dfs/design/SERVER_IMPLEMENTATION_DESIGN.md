# DFS server implementation design

- **Target:** incremental search maintenance and recoverable Kubernetes storage pods, hosting multiple shard replicas with RocksDB and Tantivy in one DFS process plus a separate replication sidecar. Tenant partitioning and online splitting follow [HA_DESIGN.md](HA_DESIGN.md#tenant-partitioning); atomic namespace boundaries remain a design decision.
- **Core change:** a persistent search projection; update records and bitmap chunks, pin snapshots for readers, recover matching projection/Tantivy commits.
- **Status:** proposed, 2026-10-04. Rust snippets describe proposed interfaces, not existing APIs or tested patches.
- **Implementation:** [progress and validation gates](SERVER_IMPLEMENTATION_PROGRESS.md); partial code changes are not measured guarantees.
- **Companions:** [PostgreSQL evidence](POSTGRES_LESSONS.md), [HA protocol](HA_DESIGN.md), [FUSE behavior](CLIENT_CACHE_DESIGN.md). PostgreSQL supplies design principles; DFS must establish its own guarantees.
- **Already implemented:** `CheckSession`, `ResolvePublication`, local `PersistThrough`, bounded views, per-tenant snapshot/watch admission, and `Reader::scan_each`. Build on these. Quorum persistence remains unsupported.

## 1. Replica memory ownership

- **Problems:** extraction allocates before admission; component budgets omit overlapping work and native allocations; request cancellation does not stop native calls.
- **Code:** extend `Budget`/`Admission` in [ingest.rs](../src/lexical/ingest.rs) into proposed `src/memory.rs`; wire through [store.rs](../src/store.rs), [http.rs](../src/lexical/http.rs), [rpc.rs](../src/rpc.rs), and [dfsd.rs](../src/bin/dfsd.rs).
- **PG principle:** allocations follow operation lifetime; pinned objects cannot be reclaimed. [Memory contexts](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/utils/mmgr/README), [buffer pins](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/storage/buffer/freelist.c).
- **Solution:** one governor per DFS process, with per-shard caches/admission budgets, decoded-object capacity, foreground scratch, and a maintenance reserve. Budget the replication sidecar separately.
- Acquire bytes before allocation; grow reservations before growing buffers. Bound per-tenant bytes/counts, queue length, and wait time; reject saturation explicitly.
- Move reservations with buffers. One reservation per shared `Arc`; release only after the last owner exits, including timed-out blocking workers.
- Within each shard, share a RocksDB cache/write-buffer manager across source and projection instances; use separate managers across shards. Configure index/filter caching; do not double-count cache-backed memtables. [Write-buffer manager](https://github.com/facebook/rocksdb/wiki/Write-Buffer-Manager).
- Start experiments at 50% managed memory within the container limit. Measure native/Tantivy workspaces, allocator retention, file cache, and kernel headroom separately.
- Under pressure: evict decoded caches, reduce concurrency, stop new exports. Preserve capacity for sync, flush, apply completion, and recovery; check cancellation between work batches.

```rust
struct Charged<T> {
    value: T,
    reservation: Reservation,
}

struct WorkScope {
    reservation: Reservation,
    deadline: Instant,
    cancellation: CancellationToken,
}
```

- **Acceptance:** writes + eight searches + export + merge reach steady state at a fixed cgroup limit. Report throughput/rejections, reservations, live/retained bytes, queue waits, oldest pins, and cgroup anon/file/kernel. Extend [ingestion admission tests](../src/lexical/ingest.rs) and [pressure harnesses](ONE_SECOND_VIEW.md). Freed allocations need not immediately reduce RSS.

### When the dataset exceeds RAM

- **Current gap:** `Metadata.records` and `Lookups` remain fully resident outside RocksDB's block cache. Their memory is not reclaimed by eviction. The permission cache clears at 128 entries; it is not an LRU or a byte limit. Explicit shared RocksDB cache ownership is now in the implementation worktree but awaits cloud validation; see [progress](SERVER_IMPLEMENTATION_PROGRESS.md).
- **Storage:** source records and proposed projection records/bitmap chunks stay on disk. RAM holds bounded hot blocks, decoded objects, and admitted work; the complete dataset need not fit.
- **RocksDB policy:** explicitly configure a sharded LRU block cache per DFS shard, shared across its source/projection databases. Charge index/filter blocks to it. Internal cache shards are unrelated to DFS shards. [Block-cache behavior](https://github.com/facebook/rocksdb/wiki/Block-Cache).
- **Decoded-object policy:** byte-bounded clock eviction for metadata, bitmap chunks, and derived masks. Eviction drops decoded copies; reconstruct them from the captured persistent projection on demand. The OS separately manages cached file pages, including Tantivy mappings.
- **Read path:** decoded-cache miss → RocksDB block-cache lookup → filesystem read, possibly served by the OS cache → decode under reservation. Evict unpinned cold entries; never load the full namespace to satisfy a miss.
- **Pins:** snapshots retain visible storage versions, not the whole dataset in RAM. Active block/object handles still pin memory. RocksDB's default non-strict cache capacity can overshoot under pins; bound iterators/readers and account pinned usage/headroom. Cache capacity alone is not a process limit.
- **Pressure:** if no capacity is reclaimable, wait within a deadline or reject work; never evict active objects or grow without admission. If the hot working set exceeds RAM, expect more I/O and lower throughput, then reduce concurrency or repartition.
- **Acceptance:** dataset several times larger than the container limit; test both a fitting hot set and random access beyond cache capacity. Require bounded memory/exact results; report hit rates, pinned bytes, disk I/O, latency, and rejected work.

## 2. Persistent metadata and publication snapshots

- **Problems:** every small update deep-clones `Metadata.records` and serializes all records to JSON. `Arc` does not prevent that clone.
- **Code:** replace `Metadata` and heap-owned `Published` state in [index.rs](../src/lexical/index.rs); add proposed `src/lexical/projection.rs` using [store.rs](../src/store.rs) conventions.
- **PG principle:** stable identifiers and snapshot readers permit local updates without whole-table copies. [MVCC](https://www.postgresql.org/docs/18/mvcc.html), [page layout](https://www.postgresql.org/docs/18/storage-page-layout.html).
- **Solution:** separate projection RocksDB on the replica PVC; initially one instance per lexical tenant index, sharing replica engine-memory resources. Use a fixed small set of column families.

| Logical key | Value |
| --- | --- |
| `meta/current` | Generation, format, lineage, source boundary, slot epoch, next slot, Tantivy transaction identity |
| `node/<slot>` | Parent slot, kind, size, timestamps, status enum, name, source-validation fields |
| `id/<external-id>`, `identity/<slot>` | Bidirectional identity mapping |
| `label/<opaque-label>` | Grant/exclusion root slot |
| `child/<parent-slot>/<child-slot>` | Ordered child traversal |
| `name/<encoded-name>/<block>` | Exact name-membership chunk |
| `gram/<encoded-trigram>/<block>` | Trigram-membership chunk; still requires exact verification |
| `set/<all-or-files-or-bodies>/<block>` | Live/kind/body-membership chunk |
| `subtree-revision/<root-slot>` | Descendant-membership revision for cached subtree sets |
| `intent/<transaction-id>/...` | Staged redo and commit descriptor; section 7 |

- Version binary values; length-delimit fields. Use big-endian numeric keys and order-preserving escaped/terminated string keys for prefix scans.
- Preserve opaque IDs, case-sensitive UTF-8 names, `grams()` behavior, and external status strings. Store parent slots; do not repeat a row's slot inside its value.
- Capture a [RocksDB snapshot](https://github.com/facebook/rocksdb/wiki/Snapshot) under the projection writer gate after apply; pair it with the matching searcher. Queries never implicitly read the latest database.
- Keep the database owner alive beyond every snapshot; implement `ProjectionSnapshot` with safe ownership/scoped lifetimes, never fabricated `'static` borrows.
- Key decoded caches by epoch, generation, and record key. Subtree caches use section 3's revision key.
- Keep `u32` slots; never reuse within an epoch. Exhaustion requires a new epoch/full rebuild, invalidating caches.

```rust
struct Published {
    generation: ProjectionGeneration,
    source: SourceBoundary,
    projection: ProjectionSnapshot,
    searcher: Searcher,
}
```

- **Acceptance:** one-record updates neither clone nor serialize other records; old/new readers retain their matching pairs. Measure cold local-read latency and added database/WAL cost. RocksDB manages old versions/compaction; DFS bounds decoded caches and reader retention.

## 3. Bitmap storage and incremental namespace maintenance

- **Problems:** `Lookups::build` allocates leaf/filename bitmaps and walks every node's ancestors. One new file caused a 58.5-second build at 1M files. Whole-bitmap `Arc` sharing still allows whole-set copies.
- **Code:** replace steady-state `Lookups::build` in [index.rs](../src/lexical/index.rs); add proposed `src/lexical/membership.rs`.
- **PG principle:** update indexes only when their indexed values change. [HOT](https://www.postgresql.org/docs/18/storage-hot.html).
- **Solution:** persistent chunks covering 4,096 slots: absent key for empty, direct offset for singleton, serialized exact Roaring bitmap otherwise. Validate offsets; charge actual encoded/decoded capacity. Benchmark chunk size before freezing the format.

```rust
enum MembershipChunk {
    Singleton(u16),
    Bitmap(RoaringBitmap),
}

fn split_slot(slot: u32) -> (u32, u16) {
    (slot / 4096, (slot % 4096) as u16)
}
```

- Decode/write only touched chunks; coalesce changes before serialization. Snapshot readers retain earlier versions. No unbounded chain of application overlays.

| Change | Required work |
| --- | --- |
| Create | Allocate slot; add record, identity/label, child keys and name/trigram/live/kind chunks; add body membership after indexing; advance ancestor revisions |
| Body edit | Update validation fields/status and document; change body membership only when eligibility changes; preserve names/parents |
| Same-directory rename | Replace that slot's name/trigram memberships; preserve body postings and subtree membership |
| Move | Change parent/child keys and moved-node name indexes; advance old/new ancestor revisions; no descendant enumeration for inherited labels |
| Unlink/overwrite | Remove affected memberships, identity mappings, and document; handle overwritten destination; never reuse its slot |
| Grant/group edit | Advance covered source/policy boundary and permission-cache keys; no extraction or namespace-index rewrite |

- Persist exact parent/child relationships, not a bitmap for every subtree. A leaf's subtree is its slot.
- Cache larger subtree sets on demand by `(slot_epoch, root_slot, subtree_revision)`, under a byte budget. Create/delete changes ancestor revisions; moves change both ancestor paths; membership inside the moved subtree stays unchanged. Coalesce shared ancestors; check cycles/deadlines.
- Build subtree caches in bounded workers. Cold queries use exact parent traversal or fail on budget/deadline; publication never waits for cache warming. Broad cold grants may remain expensive.
- Persist name/trigram/live/body chunks; subtree and effective-permission caches start cold. No mandatory subtree-mask rebuild at restart.
- **Acceptance:** at fixed name length/depth, one-file changes touch bounded records/chunks as corpus size grows. Full build remains O(N); ancestry and subtree-cache work scale with depth/subtree size. Test duplicate names, Unicode, moved grant roots, overwrite, and sparse slots in [lexical.rs](../tests/lexical.rs).

## 4. Exact authorization and candidate execution

- **Problems:** queries clone allowed sets, prefix queries allocate unions, cache misses duplicate work, and cache capacity clears everything. Unauthorized hits must never raise pruning thresholds.
- **Code:** change `LexicalIndex::search` in [query.rs](../src/lexical/query.rs) and `top_docs` in [ranking.rs](../src/lexical/ranking.rs); retain current context/final validation in [search.rs](../src/search.rs).
- **PG principle:** choose an access path; verify candidates before accepting results. [Bitmap rechecks](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/nodes/tidbitmap.c).
- **Solution:** fallible exact predicates; three plans: singleton/empty, streaming exact chunks, or native postings followed by exact checks. Defer lossy masks.

```rust
trait CandidateFilter {
    fn accepts(&mut self, slot: u32) -> Result<bool>;
}

if !alive(doc) || !filter.accepts(slot)? || !literal_matches(address)? {
    continue;
}
heap.offer(score, address);
```

- Preserve ascending-slot metadata pagination. Merge/deduplicate prefix streams in slot order; cap open streams/bytes. On overflow, use a bounded slot-ordered projection scan with exact name checks, never truncate matching names.
- Retain case-sensitive substring verification after trigram filtering.
- Capture grants, body READ, scope, exclusions, live/body sets, and publication. Resolve roots through `label`/`id`; use local parent walks with bounded memoization, cycle checks, and read/work deadlines. Missing ancestry/read failures fail closed; no source RPC or `validate_search()` per posting.
- Key effective masks by principal, scope, policy, namespace, and publication. Bound cache bytes; coalesce builds; use clock eviction. Failed builders release reservations and wake waiters; held `Arc`s remain valid.
- Preserve final source/version validation and page suppression on policy change or deadline.
- **Acceptance:** exact-reference/native-score parity, ties, offsets, denied high-score hits, read failures, changed grants, moved exclusions, sparse slots, and cold caches in [ranking.rs](../src/lexical/ranking.rs). Any future lossy plan must still authorize before heap/threshold updates.

## 5. Streaming export and early ingestion admission

- **Problems:** export retains all nodes, then indexing collects another map; node limits run after allocation; extraction allocates before admission.
- **Code:** `IndexLease`/`begin_index_export` in [export.rs](../src/export.rs), `Reader::scan_each` in [store.rs](../src/store.rs), `apply`/`extract` in [index.rs](../src/lexical/index.rs), existing [RPC admission](../src/rpc.rs).
- **PG principle:** consistent scans with bounded workspaces and limited foreground-cache pollution. [Scan strategies](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/storage/buffer/freelist.c).
- **Solution:** blocking worker owns one source snapshot; lease retains boundary, cursor, expiry, and reservation. Serve byte-bounded pages through a bounded channel using seek-after keys.
- Check encoded record size before decoding; reject oversized records. Release the lease-map lock before I/O; preserve safe snapshot/engine lifetimes.

```rust
struct ExportPage {
    boundary: SourceBoundary,
    next_key: Option<Vec<u8>>,
    nodes: Charged<Vec<Node>>,
}
```

- Renewal extends lifetime, never changes the snapshot. Preserve [independent renewal](../src/lexical/lease.rs); session expiry, cancellation, or failed final lease validation aborts publication.
- Deltas collect bounded changed-ID sets; history gaps select full snapshots. Consume pages incrementally.
- Full reset: build a fresh epoch; first pass assigns identities/records, second resolves parents/memberships. Stage contributions ordered by lookup/block/slot and reduce one block at a time; charge temporary disk. Failed builds leave the old epoch serving; delete abandoned staging after pins release.
- Reserve body/conversion capacity before `Vec::with_capacity`; transfer it into `IngestDocument`. Keep eight-MiB extraction cap; account for overlapping UTF-8 conversion buffers. Postings/tokenization/merge allocations remain separate native allowances.
- Preserve existing client `snapshot_bytes`, tenant quotas, separate snapshot/watch pools, and RPC framing. Large-scope lazy mount APIs remain [separate work](CLIENT_CACHE_DESIGN.md); external protocol additions stay additive.
- **Acceptance:** stalled/canceled exports stay bounded; parent ordering cannot break builds; expiry never mixes pages. Extend [lexical](../tests/lexical.rs)/[RPC tests](../tests/rpc.rs), including token-heavy extraction pressure.

## 6. Remove whole-index address reconstruction

- **Problem:** `addresses()` scans all live documents after body/segment changes, although `top_docs` already returns result addresses. Its remaining role is coverage validation.
- **Code:** remove `Published.addresses` and restore/apply calls in [index.rs](../src/lexical/index.rs); keep collector addresses and slot fast fields in [query.rs](../src/lexical/query.rs).
- **PG principle:** maintain invariants at changed records, following the [index-update dependency principle](https://www.postgresql.org/docs/18/storage-hot.html).
- **Solution:** record expected body state for touched slots in the publication intent. Validate committed live documents by indexed slot: exactly one if indexed, zero otherwise. Raw term frequency can include deletions and is insufficient.
- Keep a full streaming coverage audit for initial build/repair; spill/sort slot evidence or use a separately admitted bitmap.
- Bind addresses to their captured searcher. Never persist segment ordinals as file identities. Verify merge commits preserve the application descriptor/recovery binding.
- **Acceptance:** body edits validate touched slots without full scans; forced merges preserve deletion, literal, score, and tie behavior. Failed coverage prevents publication and enters recovery.

## 7. Commit projection and Tantivy together, then recover

- **Problems:** RAM maps disappear; restart rejects the old incarnation; RocksDB cannot atomically commit Tantivy files.
- **Code:** replace `Commit`, `apply`, and `restore` in [index.rs](../src/lexical/index.rs); add proposed `src/lexical/publication.rs`; separate lineage from `Engine.incarnation` in [engine.rs](../src/engine.rs). Revise the [incarnation-rebuild contract](../src/lexical/CONTRACTS) only with recovery proof/tests; preserve client-session invalidation.
- **PG principle:** durable redo precedes the decision that depends on it. [WAL](https://www.postgresql.org/docs/18/wal-intro.html).
- **Solution:** one writer and one pending publication per tenant. Projection state holds generation `g` and staged redo for `g+1`; Tantivy's commit payload selects the transaction. Readers never see staging.

```rust
struct ProjectionCommit {
    format: u32,
    epoch: ProjectionEpoch,
    base: ProjectionGeneration,
    next: ProjectionGeneration,
    source: SourceBoundary,
    intent_digest: Digest,
}
```

**Commit order:**

1. Capture a durable source snapshot: the local export persistence barrier and a history/position that can be checked after recovery; asynchronous replication does not make the snapshot durable elsewhere.
2. Stage deterministic redo, touched-slot expectations, and descriptor. Bound writes/total bytes; digest canonical ordered changes and descriptor; sync.
3. Durably commit Tantivy with that descriptor, including metadata-only changes without re-tokenizing bodies.
4. Validate coverage; atomically apply redo, advance `meta/current`, and remove intent in one synced RocksDB batch. Capture the matching snapshot/searcher.
5. Swap `Published`; old readers retain `g`, new readers capture `g+1`.

- Bound the final apply batch too. Publish the entire captured source boundary or nothing.
- The journal contains changed IDs, not historical after-images: oversized deltas cannot be split into arbitrary earlier boundaries. Use a fresh epoch/full snapshot or explicit indexing-capacity error; source service continues.

| Crash point | Recovery |
| --- | --- |
| Before intent durability | Keep `g`; discard incomplete staging |
| Intent durable; Tantivy names `g` | Discard uncommitted intent; retry |
| Tantivy names `g+1`; projection at `g` | Verify source proof, descriptor/digest/base and coverage; replay intent; sync; publish |
| Projection at `g+1`; pointer not swapped | Reopen committed pair |
| Missing intent, mismatched epoch, corruption, incompatible format | Keep source service; rebuild a fresh projection epoch |

- Uncertain commit result: stop writer and recover; do not delete staging or continue based solely on an error. Replay is deterministic/idempotent; `meta/current` identifies applied state. Failed coverage requires rebuild.
- Verify [Tantivy commit](https://docs.rs/tantivy/0.26.2/tantivy/indexer/struct.PreparedCommit.html) durability of payload/segments and descriptor preservation through merges. Recovery uses the selected committed searcher, not obsolete segment ordinals.
- **Intact PVC:** reopen projection WAL/state and Tantivy, reconcile intent, verify lineage/history, then serve/catch up. Decode bitmap chunks on demand; no full lookup reconstruction.
- **Source proof, HA:** bind tenant head to shard lineage, writer epoch, safe origin position; retain checkpoint evidence when WAL expires.
- **Source proof, standalone:** write a unique projection transaction witness plus captured tenant head under the source writer gate; sync before search commit. Retain current/pending witnesses; reject reuse when absent. A witness is an internal marker, not replicated durability. Forked source history gets a new lineage.
- Update `search_context` and export-boundary checks alongside restore; accept verified durable boundaries while rejecting old sessions and ahead/divergent projections.
- **Backup/transfer:** quiesce at a completed generation; create a [RocksDB checkpoint](https://github.com/facebook/rocksdb/wiki/Checkpoints), pin/copy matching Tantivy files, and record manifest/checksums. Keep dependencies through transfer. No full checkpoint per ordinary publication.
- Bound source history by bytes/age. Missing history/versions require a later consistent full snapshot. Lost PVCs install source state plus a verified projection or rebuild; never copy replica identity/ownership with a projection.
- **Acceptance:** crash at every durable boundary, including metadata-only commits/merges; test corrupt/missing intent, format changes, source truncation, cold same-PVC restart in [recovery.rs](../tests/recovery.rs)/[lexical.rs](../tests/lexical.rs). Report reopen/catch-up separately from rebuild.

## 8. Generation reclamation and maintenance

- **Problems:** slow readers pin heap state, RocksDB versions, and Tantivy files; checkpoints/staging/abandoned epochs can fill disk.
- **Code:** generation tracker beside `Published`/projection owner; integrate [HTTP lifetimes](../src/lexical/http.rs), [leases](../src/lexical/lease.rs), and publication. Retire legacy JSON only after it ceases to be a recovery candidate.
- **PG principle:** retain versions for readers; reclaim continuously afterward. [Vacuum](https://www.postgresql.org/docs/18/routine-vacuuming.html).
- **Solution:** track generation count, oldest pin, decoded bytes, and snapshot/storage pressure. Bound overlap; refuse optional work without capacity. Cancellation does not release still-running native work's pins.
- RocksDB compacts released versions; Tantivy reclaims unpinned segments. DFS collects epoch directories, backup pins, and staging only after resolving intents and live ownership; never by filename age alone.
- Reserve disk/memory/I/O for WAL, compaction, snapshots, and rebuilds. Bound concurrent recovery; protect sync and ownership-lease renewal. Avoid force-compaction per publication.
- **Acceptance:** churn settles after readers release, allowing compaction lag. Crash during cleanup must preserve a committed pair or authoritative rebuild path; immediate RSS/disk shrink is not required.

## 9. Source integrity validation

- **Problems:** `Engine::open` validates complete tables, retry heads, and every retained manifest's chunks. Fast projection restore does not remove that source-startup cost.
- **Code:** refactor `Engine::validate` in [engine.rs](../src/engine.rs) onto bounded scans in [store.rs](../src/store.rs); preserve chunk/manifest/ancestry/grant checks.
- **PG principle:** bounded recovery workspaces; checkpoints alone do not justify skipping integrity checks. [Scan strategies](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/storage/buffer/freelist.c).
- **Solution:** stream/count nodes against `state.node_count`; validate relationships through snapshot point reads with bounded memoization; check journal continuity with one expected head.
- Spill bounded sorted retry-head runs; merge to detect duplicates/missing coverage. Admit one manifest/chunk at a time, including decode/ancestry memory; fail startup explicitly if capacity is insufficient.
- Throttle recovery separately; report records/bytes. Keep source-ready false until validation and apply catch-up finish. Followers may transport durable logs meanwhile, but cannot serve or lead application traffic.
- Retain the O(retained data) integrity scan initially. Replacing it requires a separate checkpoint/incremental-integrity design covering changed records and latent corruption. Size shards and surviving warm replicas accordingly.
- **Acceptance:** [recovery tests](../tests/recovery.rs) reject the same corrupt namespace/chunk/grant/retry states; memory stays bounded as history grows. Measure validation separately from WAL/search recovery.

## 10. Mutation receipts, persistence, and shard replication

- **Contract:** preserve atomic local publication, publication-only defaults, and opt-in local `--durable-sync`. The writer never waits for follower progress; failover can lose a complete suffix, including locally persisted writes absent from the promoted replica.
- **Code:** preserve `resolve_publication`, `persist_through`, and local persistence ordering in [engine.rs](../src/engine.rs). Keep the client mutation path in `Store::publish`; add a separate `dfs-replicator` process and private replication RPC.
- **Export:** investigate a secondary opening each leader database, calling `try_catch_up_with_primary` and `get_updates_since`. Track complete source batch boundaries; gaps require checkpoint replacement. [Kvrocks](HA_DESIGN.md#how-apache-kvrocks-replicates-rocksdb) demonstrates serialized batch replay and checkpoint recovery, but uses server threads rather than a secondary sidecar. The pinned binding/API details and fallbacks are in [HA_DESIGN.md](HA_DESIGN.md#preparing-and-applying-a-mutation).
- **Apply:** follower `dfsd` owns its writable RocksDB. Validate epoch/history/predecessor, map column families, then atomically write resolved operations and the receiver cursor. Share the post-publication counters/invalidation/index-notification hook; do not rerun public client mutations.
- **Startup:** split initial provisioning from opening an existing replica. A follower must copy source identities instead of generating new roots. Promotion establishes a new history anchored to the selected recovered prefix.
- **Reads:** leader publication is immediately visible. A current follower read obtains a leader barrier, waits for local coverage, and authorizes against the captured snapshot. Search additionally checks projection compatibility. Follower count remains open; read capability is required.
- **Routing:** every peer exposes a versioned `GetTopology` view maintained from etcd. Clients select peers directly; handlers reject obsolete shard/leader assignments and return topology hints. Discovery timeouts and ownership expiry are separate.
- **Coordination:** etcd owns membership, epochs, routing, and recoverable promotion state. Its Raft is not in the file-write path. Fence the old writer before activation of a replacement; do not infer fencing from lease expiry.
- **Persistence:** reserve encoded bytes before publication and measure unsynced age; local pressure remains separate from follower lag. Receipts distinguish published/local-durable state and unknown recovered outcomes. `PersistThrough(Quorum)` remains unsupported by this design.
- **Acceptance:** preserve existing publication/persistence behavior; run the sidecar/replay/fencing and prefix-recovery cases in [HA experiments](HA_DESIGN.md#experiments-before-calling-it-ha) on GCP. A local sync or a process-kill test cannot establish failover durability.

## 11. Kubernetes lifecycle and client boundaries

- **Problems:** process health differs from source/search readiness; quorum/lag-based liveness can cause restart loops; concurrent recovery defeats isolation; client caches/dirty pages are not durable server state.
- **Code:** status/drain in [dfsd.rs](../src/bin/dfsd.rs), request gates in [rpc.rs](../src/rpc.rs)/[http.rs](../src/lexical/http.rs), new `deploy/kubernetes/` manifests. Existing [Dockerfile](../deploy/Dockerfile)/systemd units are starting points. Client sites: [dfs-mount.rs](../src/bin/dfs-mount.rs), [mount.rs](../src/mount.rs), [client.rs](../src/client.rs).
- **PG principle:** supervision survives engine failure; Kubernetes handles lifecycle, etcd/fencing establish authority. [Process boundary](POSTGRES_LESSONS.md#choose-the-process-boundary-around-a-shard).
- **Solution:** a storage-pod pool hosting multiple shard replicas per DFS process and one replication sidecar. Investigate one retained PVC per hosted replica versus directories on a shared pod PVC. Place each shard's configured replicas on distinct nodes; enforce pod-wide and per-shard budgets. Drain every affected shard before maintenance; readiness is per shard. [Deployment details](HA_DESIGN.md#kubernetes-deployment-and-operator-scope).

```rust
struct ReplicaStatus {
    local_recovery_complete: bool,
    peer_ready: bool,
    source_ready: bool,
    search_ready: bool,
    draining: bool,
}
```

- Startup allows measured recovery; liveness checks local progress; pod readiness reflects recovered peer participation. Handlers separately gate authoritative source/search requests. Readiness does not establish ownership; index lag never triggers restart. [Probe semantics](https://kubernetes.io/docs/concepts/workloads/pods/probes/).
- **Rolling deployment:** propose StatefulSet `OnDelete` with the DFS controller replacing one pod at a time. Before deletion, transfer every leader role: drain admitted writes, capture final `q`, wait for destination application/persistence through `q`, acknowledge durable demotion, then conditionally switch etcd ownership. Restart with PVCs and verify recovery before advancing. Ordinary writes still do not wait for replication. [Worked rollout](HA_DESIGN.md#rolling-a-new-deployment-all-pods-must-eventually-restart).
- **Unexpected termination:** cleanup within the termination grace period is best effort; safety cannot depend on a hook running. Establish old-writer fencing and etcd ownership before activating a recovered copy. Intact PVC uses section 7; lost PVC uses follower checkpoint/replay. Missing replicated suffixes may be lost. [Pod/node failure cases](HA_DESIGN.md#a-pod-or-node-goes-down-unexpectedly).
- Couple client mounts to workloads; preserve request identities across server reconnect. Relocation recreates mount/session/inodes. Stop writers and synchronize before unmount; unsent dirty pages and memory-only retry IDs can disappear on node loss. Durable IDs require a separate client journal.
- Preserve publication-only defaults and disconnected cached reads. Budget sidecars/kernel pages; assume no cache sharing across replica PVCs or independent mounts. [Client lifecycle](CLIENT_CACHE_DESIGN.md#kubernetes-client-lifecycle).
- **Acceptance:** SIGTERM timeout, publication OOM, full restart with PVCs, lost-volume follower bootstrap, mixed-role/mixed-version rolling updates, failures during handoff, and remount waves. Measure source/search readiness separately.

## Concurrent operations

- **Problem:** move/write, rename/delete, destination replacement, path reuse, and permission changes can race across clients.
- **Solution:** preserve stable file IDs, validate entry tokens/content versions/current authority inside the source transaction, retain exact retry identities, and never rebase rejected writes automatically. Open handles retain identity, not permissions.
- **Required behavior:** [operation matrix](CONCURRENT_OPERATIONS.md) defines both execution orders, ordinary/fenced handles, inherited-authority loss, mounted-client behavior, and recovery boundaries.
- **Benchmark:** [shared RPC harness](../tests/support/namespace_races.rs) runs forced orders plus repeated concurrent trials; [runner](../src/bin/dfs-race-bench.rs) records outcomes, exact state validation, and latency. Run it after the usual benchmark's read-only phase. Cross-mount cache convergence and cross-shard/failover races require their own evidence.

## Delivery sequence and exit gates

| Step | Deliverable | Exit gate |
| --- | --- | --- |
| 1 | Allocation metrics, common reservations, early extraction admission | Attributed baseline; bounded construction/cancellation |
| 2 | Opt-in projection schema/chunks/snapshots/redo protocol | Paired metadata/Tantivy crash tests; legacy path usable |
| 3 | Streaming export and fresh-epoch builder | Bounded RAM/staging disk; lease correctness |
| 4 | Incremental records/chunks, exact collector, remove address map | No whole-population work for small changes; exact results/coverage |
| 5 | Lineage reuse, migration, reclamation, streaming validation | Same-PVC lookup reuse; bounded source-check memory; safe fallback |
| 6 | Single-replica Kubernetes recovery/probe/drain harness | Pod/node failure and pressure evidence; no HA claim |
| 7 | Async sidecar replication, etcd/fencing, prefix recovery, current follower reads | Distributed failure, promotion, and maintenance matrix passes |

- **Migration:** build a sibling epoch from one snapshot, catch up, validate, then switch. Keep bounded rollback; old epochs replay their own boundary or rebuild. Old binaries never open the new format; slot maps never mix.
- **Compatibility:** additive wire changes; preserve enum positions/endpoints. Review source/authority changes explicitly. Target RocksDB; sibling SlateDB adapters need separate validation.
- **Performance gate:** small updates stop calling full `Lookups::build`, metadata serialization, address reconstruction, and export staging. Compare namespace/body changes separately at 100k/1M under equal corpus, grants, resources, and concurrency.
- **Metrics:** visibility p50/p95/p99, records/chunks touched, allocated/written bytes, cold queries, and rejected work. Derive latency targets from newly validated results; no visibility speedup is established by this design alone.
- **Recovery gate:** separate WAL open, intent reconciliation, source validation/catch-up, warming, and rebuild. Ordinary publication/intact-PVC restart avoids full application lookup reconstruction; periodic snapshots and source validation can remain O(N).
- **Validation:** implementation tests run in GCP `dust-dev` under [DEPLOYMENT.md](../DEPLOYMENT.md). This document changes no executable code and establishes no measured guarantees for the proposed mechanisms.
