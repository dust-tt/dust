# Concurrent filesystem operations

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

- **Problem:** two clients can act on the same name, file version, or directory ancestry. A rare race must produce a defined result, never an overwrite of an unrelated replacement.
- **Solution:** validate identity, version, permissions, and namespace preconditions under the source publication lock; commit one atomic batch. PostgreSQL lesson: check the precondition inside the transaction that changes the data. A sequence of RPCs is not one transaction. [Implementation](../src/engine.rs), [race harness](../tests/support/namespace_races.rs).
- **Scope:** current single-engine ordering. Independent client sessions; both clients initially authorized unless specified. No third writer in the benchmark tenant. `move` below means rename, including cross-directory moves; directory deletion means empty-directory removal.

## Which identity does the operation use?

| Mode | Target and conflict rule |
| --- | --- |
| Fresh path lookup | Resolves the entry at that instant. After `src → dest`, lookup of `src` returns `ENOENT`, unless another client recreated it. A recreated path names a new file. |
| Pre-resolved content write | Carries file ID and expected content version. A move preserves both; a concurrent content change makes the version stale. It never redirects to a new file occupying the old path. |
| Namespace mutation | Carries parent ID, name, and expected entry token; replacement also carries the destination token. Missing source gives `ENOENT`; changed entry/destination gives `ESTALE`. |
| Ordinary open handle | Retains the original file identity across move/unlink/replacement. Current permissions and expected content version still apply. It is not exclusive writer ownership. |
| Fenced writer handle | Adds an exclusive, renewable writer generation. Other content writers get `EBUSY`; an expired/replaced generation gets `ESTALE`. Namespace operations remain possible. [Writer leases](../src/writer_leases.rs). |

## Allowed outcomes

`A` and `B` have captured their preconditions before execution. “OK” means source publication, not disk persistence or search visibility. Concurrent execution must match one of the two serial orders.

| A | B | A publishes first | B publishes first |
| --- | --- | --- | --- |
| Move `src → dest` | Write original `src` ID, with or without handle | Both OK; bytes belong to `dest` | Both OK; written file moves to `dest` |
| Move `src → dest` | Rename original `src → other` | A OK; B `ENOENT` | B OK; A `ENOENT` |
| Move `src → dest` | Delete original `src` entry | A OK; B `ENOENT` | B OK; A `ENOENT` |
| Delete `src` | Write `src` ID without handle | A OK; B `ENOENT` | Both OK; written file is then unlinked |
| Delete `src` | Write already-open `src` | Both OK; handle accesses unlinked file | Both OK; handle accesses unlinked file |
| Delete `src` | Delete same entry | A OK; B `ENOENT` | B OK; A `ENOENT` |
| Replace `dest` with `src` | Write old `dest` ID without handle | A OK; B `ENOENT` | Both OK; old destination is then unlinked |
| Replace `dest` with `src` | Write already-open old `dest` | Both OK; write affects old unlinked file, never the replacement | Both OK; written old destination is then unlinked |
| Write version V | Write or truncate version V | A OK; B `ESTALE` | B OK; A `ESTALE` |
| Create name | Create same name | A OK; B `EEXIST` | B OK; A `EEXIST` |
| Move to expected-absent `dest` | Create `dest` | A OK; B `EEXIST` | B OK; A `ESTALE` |
| Replace expected `dest` | Delete or move old `dest` | A OK; B `ESTALE` | B OK; A `ESTALE` |
| Remove empty directory | Create child by directory ID | A OK; B `ENOENT` | B OK; A `ENOTEMPTY` |
| Move directory A inside B | Move directory B inside A | A OK; B `EINVAL` | B OK; A `EINVAL` |
| Move `src → dest` | Create a fresh `src` | Both OK; two distinct file IDs | B `EEXIST`; A OK |
| Move parent directory | Create child by parent ID | Both OK; child belongs to moved directory | Both OK; directory moves with child |
| Move file out of B's inherited write grant | B writes through an existing handle | A OK; B `EACCES` | Both OK; subsequent B access gets `EACCES` |

- **Path reuse:** delete/recreate or rename-away/rename-back must invalidate captured entry tokens, even when the spelling or final file ID is unchanged. A stale write to a deleted ID cannot modify the new file. Expected-absent destination checks compare current absence; they do not assert that the name was never temporarily occupied.
- **Three or more operations:** apply the same preconditions at each position in the source publication order. The benchmark exercises pairs; an application workflow spanning create/write/rename RPCs is not atomic as a whole.
- **No automatic merge:** content versions cover the whole file, including append, disjoint-offset writes, truncate, and mode/timestamp changes. Conflict handling must not silently refresh the base and overwrite the winner.
- **Rename is not a writer lock:** ordinary and fenced handles keep their identity after a move. A namespace replacement can unlink a fenced writer's file; it cannot transfer that writer to the replacement.
- **Permissions:** check current authority at publication and read time. A retained handle is not a retained grant. A write published before revocation remains part of history; revocation blocks subsequent access.
- **Retry:** retry the same request identity and payload after an uncertain reply. A known successful rename returns its original result, even after `src` is reused. An unknown outcome requires reconciliation; do not replay it under a new identity. After a disconnected write and server restart, a new open on the same mount can retain the uncertainty error; a fresh mount reconciles the recovered file. The [failure campaign](../scripts/failure-scenarios.py) checks both rejection and remount recovery. [Client publication API](../src/client.rs), [ABA/retry test](../tests/namespace_races.rs).
- **Invalid operations:** kind mismatch, nonempty-directory replacement, and cycles fail atomically without advancing the namespace or journal. [Existing validation tests](../tests/core/rename.rs).

## Mounted clients, search, and Kubernetes

- **Default mount:** cached lookup and open descriptors are separate. A stale namespace cache may produce `ENOENT`/`ESTALE` when the server validates a mutation. Reconcile and invalidate names/pages; never reinterpret the operation against a replacement ID. Conflicts must remain visible through synchronization/close where publication is deferred. [Mount publication](../src/mount.rs), [client contract](CLIENT_CACHE_DESIGN.md).
- **Experimental kernel writeback:** fenced ownership prevents competing content publication, but does not block move/unlink. Retired/failed inode state must stop dirty pages from publishing under a refreshed version. A fresh open obtains current identity; old descriptors can fail with `ESTALE` or kernel-surfaced `EIO`. [Mounted tests](../tests/publication/writeback.rs).
- **Two mounts:** each owns its own kernel cache, authority state, and invalidation stream. RPC race tests establish source semantics; they do not prove cross-mount cache convergence. Existing mounted invalidation tests run alongside them. The added two-mount harness exercises six operation pairs with ordinary direct writes; experimental kernel-writeback timing and distributed failover remain separate acceptance cases.
- **Reads:** source snapshot reads observe a committed version; already cached mounted reads can lag remote publication until reconciliation. Mutation serialization does not make every cached read across mounts immediately current. Measure convergence separately.
- **Search projection:** apply source events in publication order, including removal of replaced IDs. At a declared indexed boundary, queries must agree with that source prefix and current authorization; do not report search visibility from the RPC result. [Incremental/recovery design](SERVER_IMPLEMENTATION_DESIGN.md).
- **Pod restart:** persist the accepted prefix using an explicit local persistence request before asserting restart survival. Old sessions/handles are invalid after restart. The RPC matrix additionally closes and reopens the real database and checks namespace/content; existing crash tests cover abrupt failure boundaries.
- **Async failover:** local publication or local durable sync can be missing on a lagging promoted replica. Reconcile against the recovered history and fence the old owner before accepting writes. Namespace races must not be solved by retrying against two leaders. [HA design](HA_DESIGN.md).
- **Cross-shard rename:** no distributed atomic rename is implemented. Routing must reject unsupported cross-shard moves with `EXDEV` before any mutation; copy/delete is a separate, non-atomic application workflow. Do not claim the single-engine matrix validates distributed transactions.

## Benchmark and acceptance

- [dfs-race-bench](../src/bin/dfs-race-bench.rs): 24 cases; each runs A→B, B→A, then 100 simultaneous trials by default. Includes same/cross-directory movement, ordinary/fenced handles, destination replacement, content conflicts, directory races, and path recreation.
- [Clean benchmark](../../dfs-bench/scripts/run.py): runs the RPC matrix after the existing read-only and publication phases on a separate benchmark tenant, then runs the mounted matrix on two mounts of the original tenant. Despite its historical name, execute on GCP `dust-dev` only. Override repetitions with `DFS_RACE_SAMPLES`; do not run unrelated writers in that tenant.
- **Oracle:** exact allowed errno pairs, contiguous successful publication heads, no head advance on failure, final parent/name/ID mapping, exact bytes and sizes, no live tombstones, and original open-handle contents. Both serial orderings are forced; random scheduling alone is insufficient.
- **Artifacts:** `namespace-races.jsonl` records case/schedule/sample, publication outcomes/errors, per-operation latency, validation result, and p50/p95/p99 grouped by case, operation, schedule, and errno. Failures stop the campaign and retain evidence. Setup/verification work is excluded from mutation latency.
- **Mounted matrix:** [namespace-mount-races.py](../scripts/namespace-mount-races.py) runs move/write, move/rename, move/delete, unlink/open-write, replacement/open-write, and competing writes. Force both orders, then repeat concurrent execution; check syscall/sync/close errors, original descriptor identity/content, and exact convergence of both mount views. Record mutation-plus-fsync latency and post-operation convergence separately in `mount-races.jsonl`.
- **Additional tests:** path reuse plus idempotent replay; inherited-authority loss through an open handle; persisted close/reopen validation. Existing suites cover stale writer generations, dropped replies, revoked grants, invalid replacement kinds, FUSE invalidation, and SIGKILL/torn-WAL recovery.