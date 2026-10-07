# Client memory accounting

Each mount has a configurable 128–512 MiB accounted limit. The default consists of 416 MiB for
retained state and a 96 MiB transient reserve. Read caches, writeback, inode tables and callback
captures share the retained budget. There is no independent dirty-data allowance.

| Allocation class | Admission / lifetime |
| --- | --- |
| Clean attrs, names, pages, metadata and blocks | One shared byte semaphore; evict clean entries before admitting demand. Entry reservations survive eviction while a reader retains an `Arc`. |
| Dirty edits and RPC encoding copies | Reserve four times the edit allocation cost plus participant/projection/bookkeeping allowances before acceptance. Retain reservations through queued operations, in-flight groups, readers and retired object state. |
| Inodes, handles, directory cookies and deferred arguments | Reserve from the same semaphore before retaining them. Inodes release map nodes on reclamation; handles and directory cookies are bounded. |
| Object/name gates | Reservations survive both live users and weak index slots. Prune unused slots without removing live gates. |
| Listing commit fences | A fixed 2 MiB reservation from the shared retained budget covers at most 4,096 commit records, the ordered object index and retirement ring. Forgetting a record preserves its version in a global fallback floor. |

Payload weights include vector/string capacities. Index allowances cover sparse B-tree nodes,
including directories with a single cached name. Retirement queues contain at most one entry per
retained dirty object and shrink when capacity exceeds four times live entries plus 64 slots.

The transient reserve is partitioned as follows:

| Class | Bound |
| --- | ---: |
| Explicit scratch semaphore | 52 MiB |
| Four RPC receive/transport buffers | 36 MiB |
| FUSE receiver, scheduler, bounded errors/handle tables and fixed bookkeeping | 8 MiB |

Every foreground cached-client operation acquires 6 MiB of scratch before entering its future.
Each of the two permitted page-prefetch tasks does the same. FUSE also holds a scratch reservation
through reply delivery: 4 MiB for directory replies and 1 MiB for other callbacks. These allowances
share the 52 MiB semaphore; they are not separate pools or additional memory. Inline shortage
defers before filesystem effects, and workers wait. Eight directory workers plus two prefetches
can retain 44 MiB before foreground admission, leaving room for at least one 6 MiB operation to
progress. The receiver releases its probe reservation before queueing a deferred callback.

Directory overlays merge ordered entries directly. An RPC page is sliced in place; cached pages
retain their charged backing entry while a caller copies a suffix. Staged directory replies use
one preallocated array of at most 4,098 entries and move names into cookies after emission. They
do not retain a second copy of every cursor. Pages contain at most 4,096 entries and 255-byte
names; xattrs remain separate and have a 32 KiB key/value limit. The 6 MiB operation allowance
covers decoded payloads and the temporary page, coverage, overlay and content-copy combinations.
Whole-file responses are capped at 4 MiB with at most two installations; reads/writes are capped
at 1 MiB, with admitted dirty data separately charged through its encoding copies.

The RPC semaphore permits four non-mutation calls. The 4 MiB + 64 KiB message ceiling permits an
8 MiB decoder allocation after capacity growth, with the remaining allowance for bounded request
and transport buffers. Decoded filesystem payloads use the operation scratch allowance above.
Mutation envelopes are at most 1 MiB and retain their dirty-copy reservations; at most 16 envelopes
and 128 independent groups can be in flight. No mutation response contains file content.

`dfs_memory_metrics` reports retained reservations, their observed peak, the configured limit,
the fixed transient reservation, and scratch use/peak. The accounted peak includes the entire
96 MiB reserve even when scratch is idle. Mounted tests assert both limits, exercise deferred
admission under a full scratch pool, and verify that eviction cannot uncharge a live reader.
Benchmark reports also record `/proc` RSS and peak RSS separately: allocator/runtime overhead
and thread stacks are outside this accounted limit and must not be confused with it.
