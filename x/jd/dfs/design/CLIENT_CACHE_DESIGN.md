# DFS client cache ownership and writeback

This document retains the kernel-cache design investigation. The selected default now follows [one-second metadata/revision validation](ONE_SECOND_VIEW.md) and direct file-data I/O. Earlier implementation-campaign results were removed; [the clean benchmark](../../dfs-bench/docs/RESULTS.md) is separate evidence.

## Concurrent operations

- Follow the [operation matrix](CONCURRENT_OPERATIONS.md): a move preserves file identity; replacement creates a different name-to-identity mapping; retained handles never retain revoked authority.
- Preserve entry/version preconditions and original retry IDs across reconciliation. Report conflicts; do not replay a stale operation against a newly resolved replacement.
- Distinguish ordinary handles, fenced kernel writeback, and each mount's independent cache. RPC race timings establish source ordering; mounted invalidation and dirty-page tests establish client behavior.

The publication-only fsync and optional `--durable-sync` behavior discussed below belongs to the earlier investigation. The current default requires durable fsync and graceful unmount, including draining its bounded publication buffer; see [the implemented protocol](../../dfs-bench/docs/WRITE_PATH_REWORK.md#bounded-client-publication-buffer).

## Assumptions and semantics

Most edits to a file are expected to originate through one mount. Remote edits remain possible. Conflicting writes may fail without automatic merging, and applications may receive background publication failures at synchronization rather than at the original `write()` call. These assumptions require workload validation; rare conflicts still need defined behavior.

“Most edits use one mount” is a workload observation to test, not exclusive ownership. Linux documents that FUSE writeback assumes changes pass through the FUSE kernel module and is generally unsuitable for network filesystems. DFS needs an explicit mechanism for remote writers before enabling this mode. [FUSE I/O modes](https://docs.kernel.org/filesystems/fuse/fuse-io.html).

The proposed write mode validates permissions and versions whenever a writeback batch publishes at the server. It does not defer all validation until `fsync()`: the kernel can send dirty pages before synchronization. Earlier successful batches remain published if a later batch fails. Atomic publication of an entire edit at `fsync()` would require a separate staging and commit protocol and is outside this proposal.

## Current implementation and proposed changes

| Area | Current implementation | Proposed ownership or behavior |
| --- | --- | --- |
| Content caching | Read-only handles normally use kernel pages. The daemon also retains versioned 64 KiB blocks under a default 32 MiB budget. Writable handles use direct I/O. | Make kernel pages the primary content cache. Reduce daemon residency to bounded temporary or fallback buffers, with explicit treatment of direct-I/O reads. |
| Read-ahead and prefetch | Daemon prediction covers sequential access and neighboring files. `ReadPack` batches speculative ranges; results enter the daemon cache. | Preserve prediction and batching. Feed eligible results into kernel pages with `Notifier::store`; retain bounded fallback storage for files without kernel inodes. Kernel sequential read-ahead remains available for cached handles. |
| Read scheduling and budgets | Demand RPC size and speculative fetch capacity depend on the daemon content-cache budget. | Separate RPC-size, concurrency, in-flight-byte, and speculation limits from retained-cache capacity. Removing residency must not disable prefetch or unnecessarily fragment reads. |
| Metadata and permissions | A complete authorized view, namespace indexes, and content blocks share `Cache`. | Initially retain the authorized view, but separate it from content storage and fetch scheduling. The daemon owns DFS IDs, versions, effective permission bits, server incarnation, authorization generation, and reconciliation cursor. |
| Writes | Each FUSE write waits for server publication. Expected versions and prior errors live on individual handles. | Retain the current mode first. Evaluate kernel writeback separately with per-inode ordering and a remote-writer protocol. The server validates each published batch. |
| Conflicts and errors | Write errors are returned immediately and retained on the handle for later flush/fsync checks. | Retain background publication failures and report them at synchronization. Reject conflicts without merging or rolling back earlier publications. Define recovery of the affected local inode after rejection. |
| Cache coherence | gRPC watches and periodic reconciliation apply deltas or replace the authorized view, then invalidate affected kernel names/pages. Unchanged readable content can survive refreshes. | Preserve selective reconciliation and extend its ordering to kernel prefetch insertion and pending local writes. Clean-cache invalidation and dirty-write conflict handling need separate paths. |
| Durability | `fsync()` checks handle validity and prior publication errors. Server persistence is separate, with a default 100 ms WAL-sync interval. | Specify publication and persistence separately before buffering writes. The implemented default remains publication-only; `--durable-sync` opts into local persistence. Quorum persistence requires a deployment that implements it. |

The baseline comes from [cache state and eviction](../src/cache.rs), [read scheduling and prefetch](../src/reader.rs), [FUSE callbacks](../src/mount.rs), [mount initialization and reconciliation](../src/bin/dfs-mount.rs), and [server publication and persistence](../src/engine.rs).

## Cache identities and progress

There are several independent caches. Removing one does not remove the correctness obligations of the others:

| State | Owner and lifetime | Identity and invalidation |
| --- | --- | --- |
| Kernel file pages and dentries | Kernel; eviction and inode lifecycle | Mount inode identity plus daemon-enforced version, namespace, and authority transitions |
| Daemon content blocks | Mount; bounded resident cache and in-flight reads | DFS node, content version, incarnation, and authority checked when serving |
| Authorized namespace view | Mount; replaced or updated during reconciliation | Session, scope, incarnation, authorization generation, and source cursor |
| Lexical allowed-set cache | Search publication; reused across queries | Principal/scope/grants and namespace/policy state within that immutable publication |
| Exact server search-validation cache | One validation request | Current authority captured for that request; never reused as mount authority |

The lexical cache is not request-local. The exact DFS validation cache is. Neither can authorize a kernel page hit, which may not call the daemon at all. See [authorization and memory ownership](POSTGRES_LESSONS.md#3-explore-solutions-and-their-tradeoffs).

Use explicit progress names rather than one overloaded “done” state:

| Progress | Meaning | Proposed operation or observation |
| --- | --- | --- |
| Locally buffered | Application bytes accepted into dirty kernel pages | Local write completion in the experimental writeback mode |
| Published | Server atomically accepted a mutation and its retry outcome | `WaitForPublication` through a captured per-inode write sequence |
| Locally persisted | Server sync completed through a receipt and its dependencies | `PersistThrough` with local durability |
| Quorum persisted | Additional cross-replica durability contract | Unsupported by the current prototype and selected asynchronous HA design |
| Indexed | Search generation covers a source prefix | `WaitForIndex` through a source receipt |
| Reconciled | This mount applied a source prefix and completed required invalidations | `WaitForReconciliation` for this mount |

These names describe proposed interfaces, not existing RPCs. The current `Call::Barrier` checks the session only; `CheckSession` describes that behavior. It cannot establish any row in this table. Preserve existing serialized enum positions when implementing protocol changes. [Explicit operation names and receipts](POSTGRES_LESSONS.md#operation-names-and-receipts).

Progress values are comparable only within the same lineage and sequence domain. Current tenant heads cannot be compared directly with engine-wide persistence counters. A file version identifies content; it is not a durability watermark. Search and mount reconciliation can lag independently of each other and of persistence.

For example, a buffered edit can return from `write()` while the server still exposes version 7. Publication may create version 8, which another mount can read before it is persisted. A crash can then recover version 7 under the weak acknowledgment contract. A receipt identifies that uncertain edit; an old version-8 page cannot establish recovered server truth. Conversely, completing `PersistThrough` need not make a still-lagging index return version 8.

## Prefetch feeding kernel pages

Keep the daemon's ability to predict access across files and batch backend reads. Ordinary per-file kernel read-ahead does not replace that policy. Change where eligible prefetched bytes are retained:

1. Observe access and choose authorized, versioned ranges within a speculation budget.
2. Fetch ranges through bounded backend RPCs.
3. Recheck incarnation, authority, version, and local write state before admitting the result.
4. For an existing kernel inode and a safe range, populate kernel pages with `Notifier::store`.
5. Release temporary daemon bytes after transfer. Use bounded fallback storage or skip insertion when the kernel has no suitable inode.

The current `fuser` dependency exposes [Notifier::store](https://docs.rs/fuser/0.16.0/fuser/struct.Notifier.html#method.store). Store notifications can extend the apparent file size, and a failed notification can have partially completed. Clip ranges against the version's verified EOF; on an uncertain partial insertion, invalidate the affected range before declaring the inode reconciled. [FUSE store notification semantics](https://libfuse.github.io/doxygen/fuse__lowlevel_8h.html).

Start with files whose clean state can be established under the current write mode. Once writeback is enabled, “no pending daemon write” does not prove the kernel has no dirty pages. Speculation must be disabled for potentially dirty inodes until an ownership protocol can exclude overlapping writes, including writable mappings. Checking an epoch and later inserting is also insufficient: the check and insertion need ordering against inode retirement, truncate, and reconciliation.

Prefetch should remain bounded and subordinate to demand reads. Track recent submissions and in-flight ranges without recreating a full resident byte cache merely to deduplicate predictions. Kernel eviction can discard prefetched data, so measure useful bytes and refetches rather than treating successful insertion as proof of future residency.

Two current dependencies must be removed before reducing the daemon cache budget: demand coalescing uses `(budget - speculative_budget) / CHUNK_BYTES`, and speculative range selection is capped by `budget / 4`. Simply setting `--cache-bytes 0` would shrink demand batching and eliminate speculative capacity; it is not an equivalent implementation of this design.

## Ordering replies, insertion, and reconciliation

The existing [kernel-cache-coherence contract](../CONTRACTS) requires every cache-populating reply to serialize with view replacement. This includes metadata replies as well as read contents. Source inspection found that `create`, `mkdir`, and the final `setattr` reply do not all retain the same protection used by `lookup` and demand-read completion. A delayed reply must not reinstall obsolete attributes or names after their invalidation completed. Fix and exercise that ordering before adding `Notifier::store`.

One source-level schedule to test is a delayed create result followed by a remote unlink and mount refresh. `create_node` currently inserts its returned node into the cache without the reconciliation gate or a captured-view check. It can therefore reinstall an older namespace result after the refreshed view already excluded it. This is a daemon-state race independently of how the kernel serializes individual notification and callback operations; the resulting kernel behavior still needs a Linux reproduction.

An implementation should have an explicit per-inode eligibility generation. Capture it when scheduling a fetch, then check it with current identity, authority, version, and EOF at the point of insertion or reply. Replacement retires the old generation before publishing its new view. Notification completion records the reconciled cursor only after all required invalidations succeed. Newer views may be visible to callbacks during notification work; no callback may reply using the retired view.

Do not solve this by holding the callback gate throughout notification calls. Invalidation can require write callbacks to run; libfuse explicitly warns against related callback locks. [FUSE invalidation semantics](https://libfuse.github.io/doxygen/fuse__lowlevel_8h.html). Define the ordering under a short gate, execute notifications outside callback locks, then complete the reconciliation state transition. Any insertion mechanism that itself needs callback progress requires a similarly reviewed schedule; a generation counter alone is not that schedule.

Synchronous gate acquisition also belongs off the async network executor when a FUSE callback can hold that gate while waiting on an RPC. The normal refresh path already uses `spawn_blocking`; incarnation-change and access-loss paths need equivalent treatment. Failure paths must preserve the same lock discipline as steady state.

Kernel ownership also requires daemon inode lifecycle accounting. Track lookup references, open handles, in-flight work, and pending notifications; reclaim the DFS-to-inode bookkeeping when those references allow it. Avoid inode-number reuse until stale operations cannot address a replacement. Directory snapshots need a byte allowance or shared immutable representation as well as a handle limit: thousands of handles can otherwise retain thousands of copies of a large directory.

## Buffered writes and conflict handling

The kernel accepts buffered application writes and sends FUSE writeback requests as needed. The daemon orders backend publication per inode, submits a batch against its expected server version, and advances that version only after success. Local handles referring to the same inode must participate in this coordination; their current independent base versions are insufficient as the writeback ownership model.

Each server publication continues to validate current write permission and the expected version atomically with mutation. A conflicting remote edit or permission loss rejects publication. The daemon preserves that failure for synchronization and prevents subsequent batches from silently rebasing rejected data onto a newer server version.

The implementation must define behavior for remote notifications while local writes are pending, failed-write recovery, close without explicit fsync, multiple handles, append, truncate, rename/replacement, unlinked files, and client restart. Namespace operations still require their own server authorization; buffering file contents does not defer those checks.

FUSE inode invalidation can trigger dirty-page writeback, so it cannot be treated as a way to discard a conflicting edit. Coordinate invalidation with publication and error handling without holding locks needed by write callbacks. [FUSE notification semantics](https://libfuse.github.io/doxygen/fuse__lowlevel_8h.html).

There are three useful implementation choices:

| Choice | Additional protocol | Assessment |
| --- | --- | --- |
| Clean kernel read caching, current synchronous write publication | Reply/invalidation ordering and bounded prefetch insertion | Recommended first step; independently measurable |
| Buffered writes with exclusive per-file writer ownership | Server-enforced fencing, lease loss, dirty-state recovery, coordinated truncate and replacement | Plausible later experiment; a stale owner must fail every publication |
| Buffered writes with concurrent optimistic remote writers | Version conflicts plus a proven dirty-page/error/invalidation protocol | Highest complexity; a failed version check alone does not define local recovery |

An exclusive writer lease prevents conflicting publication only if the server checks its fencing token at mutation time. It does not prevent local dirtying after lease expiry or make dirty data recoverable after daemon failure. Existing writable mappings and pending requests must participate in lease handoff. This is the same [ownership requirement used for shard HA](POSTGRES_LESSONS.md#ownership-and-failover-sequence), applied to one file.

For a writeback experiment, model per-inode states explicitly: clean, dirty, publishing, conflicted, revoked, and outcome unknown. Multiple handles submit to the same sequence; a successful batch advances the expected server version. A rejected or ambiguous batch stops dependent publication. Retain its request identity and error until synchronization can report or resolve it; never silently rebase the remaining pages onto a remotely changed version.

Partial-page writeback can require a read even for an `O_WRONLY` handle. [FUSE I/O modes](https://docs.kernel.org/filesystems/fuse/fuse-io.html). DFS distinguishes WRITE from READ permission, so the implementation cannot simply grant an ordinary read to make that path work. Keep the current direct-write fallback for unsupported permission combinations until a narrowly specified page-fill protocol is justified and tested.

## Synchronization and failure semantics

The original proposal recommended durable synchronization by default. The implemented contract, following the user-requested revert, keeps publication-only synchronization as the default and enables persistence through `--durable-sync`. Both modes drain preceding writes, resolve ambiguous outcomes, and report retained errors. Publication-only synchronization does not promise crash persistence.

In durable mode, `fsync()` captures the relevant inode write sequence, waits for all preceding writeback batches to obtain resolved publication outcomes, then passes their server receipt to `PersistThrough`. The server can group concurrent waiters behind one sync. Subsequent writes need not extend an already captured target indefinitely. A successful return proves that target and its dependencies reached the selected durability level; it says nothing about another mount's pages or search visibility.

`flush` reports retained write failures but need not force persistence. Cleanup on `release` must not be the only path that can observe an error. Directory synchronization must cover namespace operations; persisting file contents alone does not promise survival of a newly created name or a rename. Keep the file-versus-directory contract explicit in tests and documentation.

| Event | Required experimental behavior |
| --- | --- |
| Remote overwrite or truncate while dirty | Stop conflicting publication; preserve the error; resolve local dirty state through the chosen protocol before accepting a replacement version |
| Revocation while dirty | Reject further server publication; surface the failure; do not treat invalidation as rollback of dirty data |
| RPC timeout after possible publication | Retain request identity and classify the outcome as unknown until reconciled; do not issue a replacement request blindly |
| Mount-daemon failure | Fail outstanding work; no promise to reconstruct unacknowledged dirty pages without a separate durable client staging design |
| Server restart with a lost suffix | Resolve retained receipts against recovered lineage; retire obsolete inode generations and sessions |
| Invalidation or insertion failure | Keep the affected generation unreconciled; invalidate safely or terminate the mount according to the existing contract |
| Storage cannot keep up | Throttle bounded dirty/in-flight work and expose persistence lag; do not grow daemon retry queues without a byte bound |

The current prototype intentionally permits disconnected reads of already cached bytes. This follows [the server-authority design](../DESIGN.md#server-authority-and-client-caches), and is not a review finding against the current implementation. Stronger bounded-time local revocation would be a separate product requirement: checking a daemon lease cannot stop reads satisfied wholly by kernel pages or existing mappings. Such a requirement needs an enforceable workload lifecycle policy, potentially freezing or terminating the affected sandbox; killing only the daemon does not prove resident data disappeared. Copies already made by an application remain delivered data.

## Kubernetes client lifecycle

For clients hosted in Kubernetes, start with a mount owned by one application pod/sandbox lifecycle. Run the daemon with the workload or in a sidecar with explicit shared mount setup and startup/shutdown ordering. Containers do not acquire a common FUSE mount merely by sharing a pod. Provision `/dev/fuse`, the required Linux permissions, and any mount propagation deliberately; validate the actual runtime configuration. A node-wide shared mount or CSI integration is a separate deployment design because it changes identity isolation, cleanup, accounting, and the failure domain. [Kubernetes mount propagation](https://kubernetes.io/docs/concepts/storage/volumes/#mount-propagation).

| Event | Required client behavior |
| --- | --- |
| Server leader pod replaced | Reroute using the same mutation request identity, reestablish authority/session state, and resolve unknown outcomes before dependent writes |
| Source ready while search restores | Filesystem operations may resume under current authority; search reports its own readiness and indexed position |
| Mount daemon dies | Fail the affected mount/workload and remount explicitly; restarting a container does not restore handles or pending FUSE requests |
| Application pod replaced or moved to another node | Establish a fresh mount, credentials, namespace view, and inode identities; warm caches on demand |
| Client node lost with dirty pages | Unpublished bytes have no server durability guarantee; server replication cannot recover data never sent |

Scope cached reads and authorization to the owning mount even when several application processes use it. Independent mounts and nodes receive no assumed cache-sharing benefit. Under the existing disconnected-read contract, cached bytes may remain readable during a server outage; Kubernetes failover does not revoke copies already delivered to a client.

During planned workload termination, stop application writers, synchronize through the required acknowledgment stage, then unmount before stopping the daemon. Configure workload/daemon ordering and sufficient bounded shutdown time; a forced termination can interrupt this sequence. Dirty pages and memory-only retry identities do not survive pod/node loss. If retry resolution must survive that loss, persist request identities in an application or client journal; this is additional work, not a property of the server's durable outcome table. No new durable client staging is assumed here.

Measure the application and mount daemon containers together, including charged page cache, kernel memory, and transient buffers, while respecting each container's own limit. Account for sidecars and reserve progress capacity; do not give each process half the node's RAM. Repeated mount initialization during rollouts also needs server-side admission so a client restart wave cannot trigger unbounded metadata exports.

Kubernetes validation must include sidecar/daemon death, pod relocation, forced termination with dirty pages, server failover during an unknown outcome, and a concurrent client remount wave. Existing single-host FUSE tests do not establish these deployment behaviors.

## Memory ownership and throughput

Moving bytes into the kernel changes accounting and reclamation; it does not eliminate the working set. Compare the combined application and daemon under a common cgroup envelope, including file-cache and kernel memory. Measure retained bytes separately from RPC responses, page-fill buffers, serialization, and dirty pages awaiting publication. A short-lived daemon buffer can overlap kernel residency during transfer.

The server's [fixed-pool proposal](POSTGRES_LESSONS.md#fixed-pools-and-the-half-ram-proposal) is a managed allowance, not a requirement that each process preallocate half the host's RAM. On the client, reserving a large daemon arena can compete directly with the kernel pages this design aims to use. Budget application, daemon, and kernel memory together and retain only buffers whose reuse demonstrates a benefit.

Use independent limits for demand-read bytes, speculative bytes, RPC concurrency, pending FUSE requests, namespace snapshots, retained fallback content, and dirty write publication. A count semaphore is not a byte bound. Reserve progress capacity for demands, reconciliation, error handling, and completion of writes already accepted. Speculation should shed work first and should not force demand to wait for a speculative network permit.

The server needs matching admission: its streaming snapshot path currently materializes the full view and a second vector of node chunks, and snapshot/watch slots have no tenant-specific stream allowance. Reducing the daemon's 32 MiB cache cannot compensate for many simultaneous full snapshots at the server. Use [the common memory envelope](POSTGRES_LESSONS.md#memory-reservations-and-maintenance-progress) across each deployment boundary, with separate budgets for client and server rather than pretending one local semaphore controls both.

At the uploads workload's scale, keep full-view initialization only for scopes with an enforced node/byte bound. Large scopes need a separately designed paginated or lazy metadata protocol that preserves authorization, reconciliation, and invalidation ordering. Kernel page eviction does not reclaim the daemon's namespace maps. Bucket traffic suggests metadata operations deserve a dedicated benchmark, but its aggregate request mix cannot establish one mount's hot set or cache-hit rate. [Observed traffic and scope limitations](UPLOADS_SIZING.md#observed-request-mix).

Small-write coalescing can reduce RPC and version counts, but steady throughput is bounded by publication, WAL persistence, storage flush/compaction, and eventual indexing. Benchmark long enough for those consumers to catch up. Otherwise a fast buffered-write result may simply measure growth of a dirty queue. Relate local dirty age to server unpersisted age and index lag; do not collapse them into one latency number.

## Expected performance and complexity

These are hypotheses, not measured DFS improvements:

- Small buffered writes and repeated overwrites may combine into fewer RPCs, chunk updates, and server versions. Frequent fsync reduces that opportunity.
- Kernel caching may improve reads through writable handles. Removing duplicate daemon residency may reduce memory use and eviction/accounting code.
- Cross-file prediction and `ReadPack` batching retain potential value even with kernel-owned residency.
- Partial writes to uncached pages may cause extra backend reads, including on write-only handles. Sustained writes remain limited by backend throughput and can stall under memory pressure. See [FUSE I/O modes](https://docs.kernel.org/filesystems/fuse/fuse-io.html).
- Writeback adds per-inode ordering, delayed-error, and dirty-state reconciliation work. Total code reduction is not guaranteed; content residency and writeback should be evaluated independently.

## Implementation sequence and validation

1. Close existing reply/reconciliation races and async lock-discipline gaps. Add deterministic pause points in tests for reply-after-invalidation schedules.
2. Specify receipts, synchronization guarantees, and unknown-outcome recovery with the server. Implement the durability wait before making it a promise of buffered writes.
3. Separate authorized-view state, fetch scheduling, and retained content. Add independent byte/concurrency limits and inode/snapshot lifetime accounting.
4. Add kernel prefetch insertion for proven-clean files, with bounded fallback storage and ordering against invalidation. Compare with current daemon prefetch at equal total memory.
5. Evaluate reducing daemon residency under ordinary cached reads and explicit direct I/O; keep this result independent of writeback.
6. Choose and prototype one remote-writer protocol, then introduce kernel writeback with per-inode ordering and retained failure states.
7. Exercise failure and steady-state pressure before expanding supported write modes or workload assumptions.

Run implementation checks and benchmarks on GCP in `dust-dev`, following [DEPLOYMENT.md](../DEPLOYMENT.md). Compare at equal application-plus-daemon cgroup memory limits. Report kernel pages, daemon residency, temporary buffers, RPC counts and sizes, prefetch usefulness, FUSE callbacks, write latency, fsync latency, and server publication/persistence separately.

Correctness coverage should include in-flight prefetch racing with revoke, overwrite, truncate, restart, or inode eviction; dirty local files receiving remote edits; concurrent handles; append; close/fsync failures; and memory-pressure writeback before explicit fsync. Keep conflict failures and partial publication visible in results. Existing coherence and authority obligations in [CONTRACTS](../CONTRACTS) must be reconciled with intentional behavior changes during implementation.

For each race, assert observable contents, attributes, errors, and recovery, not just internal generation counters. Include delayed `create`/`mkdir`/`setattr` replies after reconciliation, prefetch ending beyond a new EOF, inode forget/reuse, snapshot floods from one tenant, and dirty-page publication under memory pressure. Linux FUSE integration is required; source inspection and the existing saved results do not establish these proposed guarantees.

The shared delivery order is described in [the integrated implementation campaign](POSTGRES_LESSONS.md#integrated-implementation-campaign). The original proposal did not implement kernel writeback, HA, or durability changes. The implementation checkpoint above records subsequent work; HA remains unimplemented. The implementation report records validation and the limits of the opt-in writeback experiment.

