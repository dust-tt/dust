# dfs:// v5

Proposal: a FUSE client that amortizes filesystem work, a small transactional FDB server, and a
complete in-memory authorization tree for each active tenant. Tenant affinity keeps requests near
their tree. One server owns all active tenants in the first implementation.

The RAM tree answers permissions for both filesystem requests and future search-result filtering. It
continuously follows an FDB-backed `TreeUpdateLog`. FDB remains the durable authority; the tree is
an explicitly bounded-stale materialized view, with a freshness gate rather than best-effort
invalidation. File contents and ordinary metadata remain in FDB.

This is a separate `dfs.v5` protocol and storage format. It proposes changes relative to
[v4](../v4/DESIGN.md); it does not change v4's API, format, or contracts. There is no automatic
migration in this PoC.

## Decisions

- Keep UUIDv4 object identities, represented as 16 bytes in memory, RPCs, and FDB records/keys.
- Keep gRPC/protobuf and enforce one 512 MiB client memory budget, including transient reservations.
- Adopt Henry's inline FUSE fast path, directory-wide attribute fetching, sibling-content fetching,
  and large-file read-ahead. Keep all caches and speculative work bounded by bytes.
- Keep v4's independent atomic mutation groups and object-scoped durable fsync. Henry's single
  mount-wide transaction queue and mount-wide fsync are different semantics and are not adopted.
- Replace server ancestry/grant hints with a complete tenant authorization tree. Remove speculative
  ancestry/collision prefetch, per-primary server scheduling, and their experiment knobs.
- Keep one global transaction concurrency limit and ordinary FDB conflict retries. A small
  filesystem core owns semantics; RPC dispatch and the FDB adapter remain separate.
- Keep conflict-avoiding directory bookkeeping. Rewriting one read-modify-written parent record
  for every child creation would reintroduce the hot-directory bottleneck.
- `TreeUpdateLog` keeps the latest state per object, ordered by FDB commit versionstamp. Updating an
  object atomically removes its previous log entry. Deletions require tombstones and a resume floor.
- Allow the permission tree to lag by up to 30 seconds, independently configurable. Default client
  write buffering to at most 200 ms and cache TTL to 800 ms; enforce a combined maximum of 1 second.
  Poll frequently so normal tree lag is much shorter.

## Architecture and ownership

```text
Application -> kernel FUSE -> mount/client -> gRPC -> filesystem core -> FDB adapter -> FoundationDB
                                                  |                        |
                                                  v                        v
                                           tenant RAM tree <-------- TreeUpdateLog
                                                  ^
                                                  |
                                      future search candidate filtering
```

| Component | Owns |
| --- | --- |
| Protocol | Typed IDs, bounded messages, revisions, errno mapping, independent group results. |
| Client | Synchronous cache hits, overlays, prefetch, write coalescing, object fsync barriers. |
| FUSE adapter | Kernel callbacks, inode/handle identities, mode checks, inline/deferred execution. |
| Filesystem core | Object and namespace semantics, permission checks, transactional mutations. |
| Tenant tree | Complete topology and explicit grants, feed position, age, bootstrap and eviction. |
| FDB adapter | Keys, transactions, conflicts, versionstamps, bounded range scans. |
| Server | Sessions, tenant routing, admission, RPC dispatch and lifecycle. |

Use a narrow transactional KV interface and an in-memory adapter for deterministic core tests,
following Henry's separation. Real-FDB tests are still required for versionstamps, conflict ranges,
pagination, and recovery. Keep the abstraction limited to operations this filesystem actually uses.

Affinity is placement, not a correctness lock. Later, routing may place a tenant on a preferred
server; every participating server must follow the same feed and enforce freshness. FDB transactions
must remain correct if two servers temporarily serve the tenant. Session establishment warms or
attaches to the tenant's tree; sessions retain their existing tenant scope, grant set and expiry.
There is no new distributed lease or election protocol in this first implementation.

## Object identities and compact storage

`ObjectId` is a UUIDv4 wrapper around `[u8; 16]`: fixed size, copyable, hashable, and without a heap
allocation. Validate UUID version/variant and exact length at ingress. Format hexadecimal IDs and
`dfs://` URIs only at human-facing boundaries. Tentative creates allocate UUIDs locally; FDB still
checks collisions. IDs are never deliberately reused.

Use the same representation for parent IDs, directory-entry values, grant indexes, cache keys,
pending edits and server records. Bind protobuf reference/revision messages to typed prost values;
required fields keep their Rust representation inline. Do not retain a `Vec<u8>` or `String` per
internal ID. Revisions are fixed 16-byte values
too. Root and `/shared` projections use an explicit tagged reference, not magic strings or UUIDs.

V4 already writes binary UUIDs in FDB keys. V5 also removes textual UUIDs from record values and
child-index values. Tenant prefixes and variable-length names remain unambiguous and
length-delimited where followed by another field. Block indices remain big-endian so ranges sort
numerically.

Grant names remain strings in administration/session APIs. Within a tenant, intern them to stable
`GrantId(u32)` values using an FDB dictionary. Allocate a new number only when a new grant name is
introduced; never reuse numbers. Session creation, under tenant authority, resolves or interns its
at most 512 grant names once, so a later attachment of a previously unused name works for existing
sessions. A grant with no attachments matches nothing; allocation exhaustion fails explicitly. The
dictionary is separate from object identity allocation; object IDs remain independent UUIDv4s.

## Client

### Inline FUSE execution

Start with one FUSE receiving thread. Cache hits and immediately admissible local edits run inline,
without entering an async runtime or handing work to another thread. If a callback would block on an
RPC, capacity, another fetch, or fsync, defer it to a bounded worker pool before any mutation takes
effect. Do not rerun a callback after it has changed state. Use one receiving thread, at most eight
deferred workers, and at most 64 running/queued callbacks; charge captured arguments to the shared
budget. Flush/release keep their ordering and do not trigger a mount-wide drain.

Use direct I/O, zero kernel entry/attribute TTLs, and no kernel writeback or directory caching.
Perform mode checks in the mount, using live cached attributes, rather than `DefaultPermissions`.
The server independently checks session/grant authority. Shared writable mmap remains unsupported.

### Metadata and directory locality

A lookup miss in an ordinary directory first requests a larger attribute listing. Start with 4,096
entries and a 4 MiB encoded-response cap. Reaching either cap produces a continuation; only EOF
proves a complete listing. For larger directories, fetch the needed page or use a point lookup, then
bounded page-ahead prefetch. A listing can prove absence only in the key range it actually covers.
`/shared` remains a grant-filtered projection and cannot prove name absence from ID cursors.

Return small `Attr` records in listings and stat batches: ID, kind, size, mode, timestamps,
revision. Fetch MIME/xattrs through `GetMetadata` when requested. This keeps large xattrs from
determining the batch size for ordinary traversal. Cache small attributes and extended metadata
separately under the same object revision and authorization deadline.

Use a listing token that covers entries and the returned child attributes, following Henry. Every
change to a listed child's attributes invalidates that directory's listing token. Batch-first
`Validate` checks retained pages/listings together with file revisions and refreshes unchanged
views without returning their attributes again. Names, attributes, and permissions share the
validation deadline; a token must not renew a stale child independently of its authorization proof.

The token contains the directory's FDB listing counter and the server tree incarnation/generation
used to filter it. A changed authorization generation conservatively invalidates listing tokens;
an empty feed poll does not change that generation. A server restart or affinity change invalidates
old tokens. This deliberately starts with broad invalidation rather than descendant propagation.
Listing validation accepts only real-directory tokens. Virtual root and `/shared` refresh through
`List`: their visibility is not covered by one physical directory's listing counter.

Each page is a coherent FDB snapshot, but traversal across pages does not promise one long-lived
snapshot. Local namespace overlays and generations fence every install/revalidation. On a listing
race, dispatch and await the directory's captured namespace edits before
retrying its snapshot, with dispatch enabled throughout. Hold the directory gate against new local
namespace edits; never block accepted edits behind a listing RPC or force unrelated files to publish.
Retain local overlays while edits are pending. Readdir cursor suffixes
reuse the covering cached page with its original token and expiry.

Fence page read versions against locally committed changes to their directory and returned objects.
Keep at most 4,096 commit records under a 2 MiB shared-budget reservation; discarded records advance
a conservative global floor before removal. This preserves coherence after attribute eviction
without making an unchanged directory chase every unrelated commit in the mount.

### Content locality

- A sequential read miss for a file up to 1 MiB may fetch its complete content plus small siblings
  from the cached directory listing. Start at 16 files, grow to 256 when consumed, and cap the
  response at 4 MiB. Prefetch siblings no larger than 256 KiB.
- Large-file misses fetch a contiguous window of up to 1 MiB, starting at the required 64 KiB block.
  Random access reduces speculative read-ahead. Demand bytes always take priority.
- `ReadFiles` returns each file's canonical attributes/revision with its content from one FDB
  snapshot. Installing the pair together prevents bytes being associated with older metadata.
  Content fills cap any installed attributes at their existing metadata deadline; fetching bytes
  does not renew authorization. Range reads retain explicit expected-revision checks.
- Retain clean blocks beyond metadata expiry, but serve them only under freshly authorized matching
  metadata. `Validate` can renew cached file metadata and matching blocks without downloading them.
  A changed revision invalidates old blocks. A read must never splice revisions.
- Deduplicate concurrent fetches, cancel unnecessary speculative work, and measure prefetched bytes
  consumed versus evicted. No recursive directory or content prefetch chains.

Initially, sibling bytes travel in the demand file's `ReadFiles` RPC. Skip busy/dirty siblings using
nonblocking per-object gates, and cancel the request with its demand operation. Two whole-file slots
remain reserved through decoded-reply installation, within the shared large-RPC limit. Speculative
cache admission cannot evict demand entries and leaves at least 4 MiB of shared capacity free.
Consumption metrics count a prefetched block's bytes once when first used; unused bytes are counted
when the last retained block reference is dropped.

Enforce one 512 MiB accounted client memory cap per mount, configurable downward. Include the entire
client read cache (clean file blocks, prefetched content, attributes and directory listings), dirty
data, metadata, names, inode/handle/cursor state, queues, in-flight payloads and copies.
Keep v4's 96 MiB transient I/O/scheduler reserve inside this cap; at the default, the remaining
416 MiB is shared by clean and dirty state. Charge allocations before admission and retain their
reservations through the last reader, including after eviction. Bound RPC buffers and concurrent
work against the transient reserve. This is an accounted memory cap; allocator/runtime overhead
still needs RSS measurement.

The 96 MiB reserve contains a 52 MiB scratch semaphore, 36 MiB for four bounded RPC decoders, and
8 MiB for fixed receiver/scheduler bookkeeping. Foreground operations and page-prefetch tasks reserve
6 MiB before execution. FUSE retains another 4 MiB for directory staging or 1 MiB for other callbacks
through reply delivery. Scratch shortage defers before effects. See [MEMORY.md](MEMORY.md) for the
allocation lifetimes and progress bound; expose accounted and scratch peaks alongside measured RSS.

Cache and inode indexes use ordered maps that release nodes as entries disappear. Gate keys and
weak slots retain their own shared-budget reservations. Payload accounting uses allocated vector
and string capacities, and includes sparse index nodes; retired writeback queues have one entry per
live dirty object and shed excess capacity as they drain.

When capacity is exhausted, evict clean entries, then apply backpressure before acknowledging more
writes. Never silently evict acknowledged dirty data. Prefetch uses spare clean-cache capacity; it
must not consume the resources required to complete demand work. No separate unaccounted cache or
prefetch pool may bypass the cap.

### Writeback and fsync

Keep v4's coherent base plus ordered local edits. Opening a large file for writing reads no content;
partial writes and appends retain sparse patches. Fetch only uncovered ranges when reading dirty
files. Coalesce create, initial content, and attributes into a bounded group where possible.

Use a short 25 ms coalescing window, dispatch earlier under pressure, and never reset the oldest
accepted edit's deadline when more writes arrive. Enforce the configured maximum client buffering
delay W (200 ms by default) from acknowledgment to dispatch, including time waiting in client queues.
Admission accounts for queued/in-flight bytes, group slots, and prerequisite progress before
acknowledging RAM acceptance.
Before accepting a third dependent group, wait for its captured prerequisites to progress; keep
shallow create/write coalescing and independent sibling groups concurrent. Directory removal waits
for its captured child edits before acceptance, so slow child deletion commits cannot consume the
removal's entire buffering allowance. Membership-only parent overlaps do not serialize siblings.
Prioritize the earliest deadline over further batching or speculative work. If a known-unsubmitted
edit cannot be dispatched by its deadline, fail it explicitly through the deferred-error path;
never extend its deadline or silently leave it queued. Already submitted RPCs retain their normal
outcome/timeout handling.

Initially retain at most 128 queued and in-flight groups combined, 16 envelopes, and a conservative
1 MiB envelope/group budget. Reserve a group slot and an envelope before accepting a new group;
when ready groups share a batch, retain one envelope and release the extra reservations immediately.
When every envelope is reserved, bypass coalescing for eligible groups so admission does not wait
on an idle batching timer; dependencies, refresh pauses and byte limits still apply.
Refresh of a membership-only parent's attributes must not pause independent child groups.
Return group capacity as individual results arrive. Independent files do not share a transaction merely
because they share a request. Client dependencies preserve ordering for overlapping namespace edits.

`fsync(id)` captures and awaits a finite prefix of that object's edits, across its handles, plus
necessary creation/namespace prerequisites. It does not drain siblings or later writes. Directory
fsync waits its namespace edits. Server success means FDB committed. Close may leave writes pending;
unmount drains them. Deferred failures reach affected-object fsync and subsequent mutations. Unknown
commit outcomes fail explicitly; this proposal does not add transparent mutation replay.

## Server API diff from v4

Keep gRPC/protobuf and introduce `dfs.v5`. The following is the proposed surface, not a change to
the existing service. Counts are initial limits; encoded bytes and transaction budgets also apply.

| V4 | V5 | Reason / behavior |
| --- | --- | --- |
| String IDs, including projection strings | Exactly 16-byte real IDs; tagged root/shared references | Dense internal and stored identities. |
| `Object` embeds MIME/xattrs everywhere | Small `Attr`; separate `GetMetadata` | Dense stat/list responses without losing extended metadata. |
| `Stat`, `StatMany` | One batch-first `Stat`, up to 256 object references / 4 MiB | One RPC for single-object and batched reads, with explicit per-object outcomes. |
| `Lookup` | Keep | Point fallback for sparse access and large directories. |
| `List` with small full-object pages | `List` with up to 4,096 attrs / 4 MiB and opaque keyset cursor | Whole small directories, bounded pages for large ones. |
| Membership-only directory revision | Listing token covering membership, child attrs and authorization generation | Reuse an entire unchanged attribute listing. |
| No equivalent | One batch-first `Validate`, up to 256 file-revision or directory-listing checks | Per-check unchanged/changed/denied/missing/error outcomes; request-time cache renewal. |
| `Read` | Keep expected revision; return canonical `Attr` with data | Coherent range reads and attribute installation. |
| No equivalent | `ReadFiles`, up to 256 IDs / 4 MiB | Whole small files and sibling prefetch; per-ID outcome and explicit omitted IDs when the byte budget fills. |
| `MutateBatch` | Keep streamed independent `GroupResult`s; binary IDs and canonical attrs | One group is one transaction; no mount-wide `Apply`. |
| Unary `Create/Update/Write/Rename/Remove` | Remove from public v5 service; express as one-group `MutateBatch` | One mutation implementation and error path. |
| Server `Fsync` | Remove | Fsync is the client barrier over durable group results. |
| Tenant/session/grant administration | Keep semantics; binary object IDs | Grant names remain human-readable; tenant authority remains separate. |

`Stat` accepts 1–256 object references and returns one attribute-or-error result per input, in input
order. A single-object call supplies one reference. There is no separate `StatMany` RPC in v5.

`Validate` likewise accepts 1–256 checks and returns one outcome per input, in input order. Checks
may mix files and directories:

```text
ValidationCheck = File { id, revision } | Directory { id, listing_token }
ValidationResult = Unchanged | Changed | Denied | Missing | Error { code }
Validate(checks: ValidationCheck[]) -> ValidationResult[]
```

File validation compares the current FDB object revision and rechecks session/grant access. A match
validates cached attributes, extended metadata and content of that revision. Directory validation
compares the listing counter and authorization generation, rechecks access, and validates only the
cached listing's covered names and child attributes; it does not validate descendant listings.
Perform all revision/counter reads at one fresh FDB read version and permission checks against one
fresh-enough tree generation. File revisions alone cannot prove permission after ancestor changes.
When the RAM view is unavailable, authoritative FDB checks use a separate epoch read from the same
snapshot, combined with the server incarnation. Namespace/grant edits increment it atomically;
child attribute edits increment listing counters. Fallback and RAM proof identifiers use distinct
domains, so switching permission paths invalidates retained listing tokens.

`Unchanged` renews the matching cached view from this request's send time, subject to session expiry,
local generations and known commit-version floors. It never validates unpublished local edits.
`Changed` requires fetching the affected view through `Stat`, `List` or `Read`; `Denied`/`Missing`
invalidate cached access. File validation does not require the old authorization generation to
match if current permission and revision still match. Virtual root/shared listing checks are
unsupported and refresh through `List`.

Read replies expose `read_version` and an opaque authorization view identifier for fencing and
diagnostics. Mutation results expose `commit_version`. Neither is an idempotency key. Within a
mount, replies older than that object's known committed version must not replace its newer state.
Clients also retain local generations for replies that race pending edits.

`TreeUpdateLog` is an internal FDB index, not a client subscription API. Future search accepts
normal sessions and uses the same server authorization engine; its query/index API is deferred.

## Server transactions and storage

The normal path is: validate session, obtain a fresh-enough RAM authorization view, read current
objects/blocks in FDB, validate operation invariants, apply one atomic group, commit, reply. No
server writeback, content cache, speculative ancestry cache, or per-object scheduling layer is
needed. One global semaphore bounds active transactions; all waits and transaction memory are
bounded.

Cached authority is an intentional change from v4: a recent coherent tree may grant or deny access
without rereading every ancestor. This relaxation does not permit stale namespace or content
preconditions. FDB still checks existence, destination collisions, expected name bindings, directory
emptiness, replacement rules, sizes/blocks, and rename cycles. Cross-parent directory moves perform
their structural ancestor checks transactionally; the RAM permission tree is not a substitute for
those conflict reads. Administrative grant changes use tenant authority.

A group that creates an object authorizes its parent and evaluates subsequent edits against the
group's private overlay. Check all participants against one tree generation; if a later freshness
check requires another generation, reevaluate the group's permissions together. FDB preparation
never reads its own incomplete versionstamp mutations: prepare final tree images first, then write
the tree heads and log entries at the end of the group. Retry only definitely uncommitted
transactions, recomputing state and checking tree freshness again.

Keep file metadata and blocks atomic. For directories, keep stable metadata separate from blind
membership-time and listing-counter updates. Use atomic maximum for membership time and atomic add
for listing counters; sibling creates do not read-modify-write the same parent state. A child
attribute change bumps its parent's listing counter. If a child's namespace changes its directory
attributes, also invalidate the listing in which that directory appears; do not recursively update
ancestor timestamps. Deduplicate counter bumps within a group. Complete attributes are assembled
from one FDB snapshot. A directory's public revision combines a base revision with a separate
membership counter; listing counters also cover child attributes and are not public revisions.
Explicit directory metadata edits conflict-read the complete attributes, write a new base revision,
and clear membership time/counter. The next membership event supersedes explicit utimes; independent
membership events between metadata edits combine by maximum using an ordered 12-byte timestamp.

Mutation replies return the edited object's canonical attributes and commit version. They omit
membership-only parent attributes: reading atomic parent fields before commit would make sibling
creates conflict. The client invalidates these parents' attributes without renewing their TTL and
fetches them on demand; it retains separately committed name bindings and pending local edits.

The compact authorization records are separate from ordinary metadata. Content writes, chmod,
timestamps, MIME/xattrs and same-parent name changes do not emit tree updates: they do not change
v4-style grant inheritance. Create, delete, cross-parent move, and explicit-grant changes do. Local
POSIX mode checking still requires current attributes; the tree answers session/grant access.

All key families below have a tenant prefix. Actual encodings use fixed-width IDs and explicit
delimiters, not these textual separators.

| Key | Value / purpose |
| --- | --- |
| `object/<id16>` | Small attributes, binary parent ID/name, revision. |
| `metadata/<id16>` | MIME/xattrs, read separately from ordinary traversal. |
| `child/<parent16>/<name>` | Binary child ID. |
| `block/<id16>/<index8>` | Sparse content block. |
| `directory-state/<id16>` | Explicit metadata's base revision and mtime/ctime. |
| `directory-time/<id16>`, `membership-version/<id16>` | Atomic maximum time and membership counter. |
| `listing-version/<id16>` | Atomic counter covering membership and child attributes. |
| `grant-name/<name>`, `grant-id/<id4>` | Durable grant dictionary. |
| `object-grant/<object16>/<grant4>` | Explicit attachment; inherited grants are not materialized. |
| `grant-object/<grant4>/<object16>` | Numeric reverse index used by `/shared`. |
| `object-grant-name/<object16>/<name>` | Administration-only name index preserving lexical pagination. |
| `tree-node/<object16>` | Parent ID, kind, has-grants/deleted flags, latest 10-byte update stamp. |
| `tree-update/<stamp10>/<object16>` | Latest parent/kind/has-grants/deleted image for this object. |
| `tree-deleted/<stamp10>/<object16>` | Tombstone GC index; present only for deleted objects. |
| `tree-control` | Format/incarnation and minimum resumable FDB version. |
| `tree-deleted-count` | Tracked tombstone admission and GC count. |
| `authorization-epoch` | Atomic namespace/grant epoch for listing validation on the FDB fallback. |

The control state uses separate incarnation and resume-floor keys so GC can atomically maximize
the floor. A global tenant-name registry supports bounded GC discovery even with no active sessions.

Tree records contain no names, content, xattrs, or accumulated inherited permissions. Grant sets are
hydrated from `object-grant` at the same snapshot as the node/log row, only when `has_grants` is
set. Thus log values stay small without imposing a new per-object grant-count cap. Grant attachment
and detachment update both grant indexes and replace that object's tree-update entry in the same
transaction, even when its parent is unchanged.

## Full RAM authorization tree

For each connected tenant, retain every live file/directory and its explicit grants. Use dense node
slots, `u32` parent indices, interned immutable grant sets, and a compact UUID-to-slot hash index.
Keep kind/liveness in compact arrays or bitmaps. A slot index never leaves the server; UUIDs remain
the public identity. Reclamation must not expose a reused slot to a reader holding an older view.

Start with one reader/writer lock per tenant: permission walks hold a read guard, and feed
publication holds a write guard briefly after all FDB I/O and allocations finish. No await under a
guard. Stage updates before publication and bound each search-filter batch to avoid starving the
feed. Do not introduce RCU, per-node locks, descendant permission propagation, or a second
authorization cache before measuring this implementation.

Authorization walks parent indices and intersects explicit grants with the session's resolved grant
set. A match at any ancestor grants access, as in v4. Missing nodes/parents, cycles, wrong tenant,
invalid session, or excess depth fail closed. No full path or inherited grant list is copied onto
each descendant. Subtree moves update one parent edge; ancestor grant changes update one grant set.

An unknown object in a recent tree may be a just-committed creation. Filesystem operations may use
the straightforward fresh-FDB authorization path in that case, or when current FDB metadata exposes
a parent mismatch. Evaluate the entire proof in FDB; do not splice a missing parent into an
otherwise cached proof. Warm search filtering simply excludes unknown/deleted candidates until the
feed catches up. A definite cached denial otherwise respects the same allowed staleness as a cached
grant.

### Memory at 100 million objects

The logical payload is 16 bytes UUID + 4 bytes parent index + 4 bytes grant-set reference: 2.4 GB
for 100 million objects before indexing. A practical dense node array plus UUID hash index is
estimated at 4–5 GB per resident tenant, plus grant contents, dictionaries, flags, free slots and
capacity. Use binary UUID byte arrays and measured layouts; native `u128` struct alignment can add
padding. The UUID index can own the sole UUID copy while parallel arrays hold parents/grant
references; do not accidentally budget a second full UUID table as free. Refuse slot exhaustion
explicitly before reaching the reserved `u32` sentinel values.

One million distinct four-grant sets need approximately 24 MB for `u32` grant handles and
descriptors; one hundred million such sets need approximately 2.4 GB. Deduplicate identical sets.
These are sizing estimates, not a hard RSS guarantee; directories add to the object count.

Bootstrap needs temporary per-object update stamps and tombstone tracking, potentially another 1–2
GB at this scale, plus staging. Rebuilding alongside an existing tree needs both resident copies.
Reserve these peaks before starting. Enforce a configured aggregate server tree budget and per-poll
staging limits. If a full tenant cannot fit, use FDB authorization or reject admission; never serve
a partial tree as complete. Evict an entire idle tenant, not arbitrary ancestors of active trees.

## TreeUpdateLog

### Latest-state index and atomic publication

The name describes its consumption order, not an audit history. An object has one current head and
at most one current `tree-update` entry. Moving A from P to Q removes A's old update entry; it does
not create independent retained entries for both `(A, P)` and `(A, Q)`.

For every object whose authorization image changes, in the same FDB transaction as the filesystem
mutation:

1. Read its existing `tree-node` with conflicts and remember its old stamp.
2. Prepare the complete new parent/kind/deletion image and change explicit-grant indexes as needed.
3. Clear `tree-update/<old-stamp>/<id>` and any old tombstone-index entry.
4. Write `tree-node/<id>` with `SET_VERSIONSTAMPED_VALUE` and the final image.
5. Write `tree-update/<new-stamp>/<id>` with `SET_VERSIONSTAMPED_KEY` and the final image.
6. For deletion, also write `tree-deleted/<new-stamp>/<id>` and clear its metadata, content, and grants.

Repeated edits of one object in one group produce one final tree image. The head read makes
competing updates to that object conflict. Different objects do not update a shared tenant sequence
counter. Rename/replacement emits all affected object images atomically; parent listing-time changes
alone do not emit authorization updates.

Use FDB's 10-byte commit versionstamp as the logical timestamp, with the object ID breaking ties
within a transaction. Host wall clocks must not order updates: clock skew or a transaction
committing late could otherwise place an update behind an acknowledged cursor. Versionstamped
key/value operations provide the commit-assigned ordering; use the binding's supported encoding and
offsets. See the [FDB versionstamp
API](https://apple.github.io/foundationdb/api-python.html#fdb.Transaction.set_versionstamped_key).

### Polling and coherent tree generations

Poll each active tenant's `tree-update` range every 250 ms, with jitter and shared I/O limits. Local
tree-changing commits wake its poller early. Do not scan all tenants and filter afterward. No active
connection means no ongoing feed consumption after a short idle grace period.

Let V be the last fully published FDB read version. One poll does the following:

1. Record a local monotonic start time and obtain a fresh FDB read version T.
2. At T, read `tree-control`; require the same incarnation and `V >= resume_floor`.
3. At that same T, scan all current log entries with commit version in `(V, T]`, including all
   transaction-order suffixes/object IDs at the boundaries. Hydrate explicit grants at T.
4. Stage complete replacement images or tombstones. Finish the bounded scan and hydration before
   that read version expires. Before publication, reread the control record at a fresh version;
   reject an incarnation change or a resume floor newer than T.
5. Under the tenant write lock, install the complete staged set, resolve parent slots, and publish
   V = T plus the poll's start time. Readers see the old tree or the completed new tree.

Advance V to T even on an empty successful scan. Empty polls prove freshness. Do not derive progress
from the last returned row, nor refresh the age after a failed/partial scan. The authorization
generation changes only when an authorization image changes, independently of V advancing.

Coalescing is safe for this algorithm because reads at T see the latest image of every object as of
T. Replacing an older entry with a newer one at or before T only removes an intermediate state. An
update committed after T cannot hide the old row from reads at T. Applying the complete interval to
a tree complete at V therefore produces a tree complete at T, including deletions.

Pagination must use the same read version throughout a poll. Scanning successive pages at fresh
versions can skip a row that moved beyond the chosen cutoff, then falsely declare that cutoff
complete. Likewise, publishing one page at a time could expose half a move/replacement or combine
permissions from states that never existed together.

Keep scans, grant hydration and staging bounded by time/bytes. If a complete interval will not fit,
discard the attempt without advancing V; use FDB authorization once the old tree expires, then
rebuild while catching up continuously. Do not solve an oversized backlog by pretending a partial
cursor is a complete tree. Sustained update rates beyond one poll's capacity require admission
control or a later partitioned-feed design, not a weaker permission invariant.

### Deletions and bounded retention

Deleting an object's last log row without replacing it would leave offline consumers believing the
object still exists. Keep a tombstone in both the head and update index. Deletion clears explicit
grant indexes; applying the tombstone removes the object and its whole grant set from RAM.

Live-object update entries are retained regardless of age. Only obsolete entries are replaced and
deletion tombstones are garbage-collected. Total log size is therefore:

```text
O(live objects + retained deletion tombstones), not O(number of historical mutations).
```

Start with one hour of tombstone retention and a configured tombstone byte/count ceiling. The GC
worker uses sampled read-version/time checkpoints to choose a cutoff; it must not convert an FDB
version into wall time by assuming a fixed version rate. Time is a retention policy only, never the
consumption ordering. After a collector restart, waiting a full retention interval before age-based
collection is a safe initial implementation.

For each bounded GC batch, transactionally advance `resume_floor` through the removed tombstones'
commit versions and clear their head/update/deleted-index records. Verify heads still refer to the
selected tombstones. The floor update and deletions commit together. A configured space ceiling may
advance the floor sooner: that explicitly invalidates lagging consumers and builders. GC continues
for disconnected tenants too. If its ceiling cannot be maintained, apply backpressure rather than
silently dropping required tombstones.

The initial hard ceiling uses a conflict-tracked tombstone count per tenant. Deletions and GC can
therefore conflict and retry even when they affect different objects. This count never orders the
feed; ordinary creates, moves without replacement, and content edits do not read it. Start with
1,000,000 tombstones or 512 MiB of accounted tombstone storage, whichever is smaller. Collect toward
90% of that limit to leave headroom between sweeps. All limits, retention and GC cadence are
configurable; no stale consumer may pin this space indefinitely.

A consumer whose V is below the floor rebuilds. It must never interpret an empty scan after a long
absence as proof that its old tree is current. No disconnected server may pin retention forever. The
bound includes recent deletion churn and GC headroom; it cannot be exactly one row per live object
while also supporting arbitrary offline consumers.

### Bootstrap and recovery at large scale

Do not assume a 100-million-object snapshot can be read in one transaction. FDB's usual read-version
lifetime is approximately five seconds; a large tree needs short transactions and reconciliation.
See [FDB transaction
limitations](https://apple.github.io/foundationdb/known-limitations.html#long-running-transactions).

1. Create an unpublished builder and capture a fresh starting version B and the feed incarnation.
2. Immediately run the ordinary complete-interval poller from B into the builder while separately
   scanning `tree-node` in UUID order, using short transactions at fresh versions. Hydrate each base
   row's grants in the same transaction as that row. Concurrent inserts behind the base cursor are
   covered by the feed.
3. During construction, retain the latest stamp per object, including tombstones. Merge base rows
   and feed images only if their stamp is newer; a slow base read must not resurrect a deletion or
   overwrite a newer move/grant set. Allocate placeholder parent slots privately when necessary.
4. Once the base scan finishes, complete a poll to a fresh T at least as new as every base-read
   version. Verify a valid root and that live parent references resolve to live directories.
   The reconciled builder is now complete at T; publish it atomically with T's original age proof.
5. Discard temporary merge stamps/tombstones after publication. If a required feed interval has
   expired, the incarnation changes, or memory limits are exceeded, discard/restart the builder.

Continuous catch-up during the base scan keeps the final delta small; accumulating all changes until
the end would recreate the long-transaction problem. Every feed interval still obeys the
fixed-snapshot rule. A builder is never used for permission decisions, even if most rows are loaded.

Initial bootstrap serves filesystem requests through fresh FDB authorization. A process restart
loses both its tree and cursor and starts again. A cursor alone is not a recoverable checkpoint. On
affinity handoff, the destination warms independently or uses FDB until ready; the source's
freshness does not transfer to it. Durable RAM snapshots are deferred.

## Freshness and failures

| Budget | Initial value | Measured from |
| --- | ---: | --- |
| Client write buffering W | 200 ms | Oldest acknowledged edit until dispatch; normally 25 ms. |
| Server authorization-tree age S | 30,000 ms | Start of the last successfully completed fixed-snapshot poll. |
| Client read/authorization cache C | 800 ms | Request send time; tentative objects start at local acceptance. |
| Client-added content delay W + C | 1,000 ms | Combined write buffering and read-cache allowance. |
| Permission-related added delay W + S + C | 31,000 ms | Conservative composition when a buffered edit changes authorization. |

Enforce `max_delay = 1,000 ms` as a combined client budget. Default W to 200 ms and C to 800 ms;
validate positive values and `W + C <= max_delay` at startup, rather than independently allowing
1,000 ms for each. The normal 25 ms coalescing target is capped by W. Derive deadlines from a
monotonic clock; every queue, cache and prefetch path must use these same absolute deadlines.

Configure S with `DFS_AUTH_TREE_MAX_AGE_MS`, default `30000`. Configure the target poll interval
separately with `DFS_AUTH_TREE_POLL_MS`, default `250`; require positive values and a poll interval
smaller than S. The 30-second setting is the maximum accepted age of the permission view, not a
30-second polling interval. Do not lengthen content/metadata cache TTLs or write buffering to match
it. Ordinary content freshness has W + C = 1 second of client-added delay; permission-dependent
visibility, including `/shared` and future search filtering, additionally depends on S.

After a committed grant revocation, a server may use its prior tree for up to S, and a client may
retain an already authorized result for up to C: the configured permission allowance is therefore up
to 30.8 seconds at the defaults, excluding the processing/network waits described below. This is an
explicit relaxation of permission freshness, including for already-open handles.

The tree is continuously maintained but not synchronously identical to FDB after every commit. This
budget explicitly permits temporarily stale grants and denials, including after ancestor moves or
revocation. Content/metadata reads remain coherent FDB snapshots; permission evaluation uses one
coherent recent RAM snapshot, not necessarily the same FDB version as the content.

Measure age from poll start, not completion: a slow poll must not mint a new freshness interval.
Check tree freshness for every authorization batch and again before returning data or submitting a
mutation if processing took time. Never extend it from a cache hit, local commit, partial poll, or
recent row timestamp. Expiry stops RAM authorization; perform the complete fresh-FDB check or return
`Unavailable`. Administrative/session checks remain mandatory independently of tree freshness.

Client caching uses request send time so a delayed response cannot restart a full TTL. Session
expiry caps every cached result. Hits, local edits and consumption of prefetched data do not renew
deadlines. `Validate` uses the same send-time rule; batching starts no later than the earliest
participating view's expiry, and expired views wait for validation or fail. A reply arriving after
its cache deadline may complete its waiting request but cannot create a reusable fresh cache entry.
An expired authorization view cannot be kept alive by unchanged content revisions.

As in v4, W is a dispatch bound, not an acceptance-to-FDB-commit guarantee. Network/transaction
waits are outside the configured added-delay budgets; do not claim a hard end-to-end visibility SLA
during arbitrary stalls. RPC deadlines and admission/backpressure remain independent. Local
tree-changing commits wake the feed but do not patch the published tree out of order or advance its
complete cursor.

An FDB outage stops successful polls. Existing RAM permissions expire after S; clients exhaust C,
then requests fail instead of extending stale access indefinitely. Permission changes discovered
after a write was optimistically accepted can cause deferred write failure, reported at fsync.

## Future search filtering

Search produces candidate UUIDs within an already authenticated tenant. Filter candidates in bounded
batches against one fresh tree generation and the session grant set, using the same authorization
function as filesystem RPCs. Ancestor walks require no FDB read per candidate on the warm path.
Batch-local memoization of shared ancestor decisions is allowed under that read guard.

Filter before exposing names, snippets, result counts or facets. Missing/deleted nodes are excluded.
Do not retain an allow decision across tree generations or sessions. Recheck freshness/generation
before releasing a result batch if candidate retrieval or rendering was slow. A stale/unready tree
requires bounded FDB checks or an unavailable response; the search index's ACL fields never become
an alternative permission authority.

The search index may lag content independently. This tree solves permission filtering and object
liveness within its freshness budget, not search indexing, ranking, path reconstruction, or exact
global hit counts. No search engine or indexing pipeline is introduced by this proposal.

## Validation and measurements

Before treating RAM permissions as authoritative, verify these cases against real FDB:

- One current log entry after repeated moves or grant edits; concurrent same-object edits conflict,
  while independent objects do not contend on a tenant sequence key.
- Log/head/metadata/grants commit atomically; aborts and unknown outcomes never create phantom RAM
  state. Multiple object images at one commit are published together.
- Supersession before, during and after a paginated poll; fixed-version expiration discards progress.
  An empty completed poll advances freshness; failed and incomplete polls do not.
- Offline create/move/delete, repeated rename, ancestor grant revocation, replacement, GC racing a
  poll, and resume below the retention floor. Test both time-based and space-based GC.
- Bootstrap lasting longer than the FDB MVCC window while inserts, deletes, moves and grants change.
  A late base row cannot resurrect an object. Feed-floor overrun prevents publication.
- Two servers temporarily serving one tenant, affinity handoff, process restart, disconnected-tenant
  GC, stalled feed, expired sessions, and FDB outage past S + C.
- Equivalent filesystem and search decisions for the same snapshot/session, including inaccessible
  candidates mixed into authorized results. Check result metadata and counts for leakage.

Retain v4's object-fsync, concurrent writer, truncate/re-extension, append, namespace-cycle,
deferred error, directory-race and memory-backpressure checks. Exercise inline/deferred callbacks
for exactly one execution and verify that a slow read does not stall unrelated cache hits. Measure
actual Rust layouts, index load factor, tree RSS and bootstrap peak at 1M/10M/100M synthetic nodes
with varied grant density and depth.

Check mixed file/directory `Validate` batches, unchanged file revisions after ancestor revocation,
child-attribute listing invalidation, partial errors, and validation replies racing local edits.
Verify the combined 1,000 ms configuration limit, the default 200 ms write-queue deadline under
saturation, and the default 800 ms send-time cache expiry with slow responses. Hits and prefetch must
not renew deadlines. Exercise the 512 MiB cap with full dirty state, live readers after eviction and
concurrent RPC buffers; admission must block or fail before exceeding accounted capacity.

Benchmark v4/v5 with identical corpus, directory depth, grant placement, FDB settings, VM and
budgets. Include cold/warm metadata and content passes, Git, sparse random reads, large directories,
shared parents, and independent clients. Record untar and durable drain separately. Measure FUSE
callbacks, inline/deferred counts, RPCs, FDB reads/commits/retries, prefetch usefulness,
authorization throughput, feed lag, poll bytes, tombstone count, and bootstrap duration. Historical
Henry timings motivate experiments; they are not a controlled v5 performance prediction.

Implement in stages: binary types/storage and core first; optimized client and API next; feed and
tree in shadow mode compared against FDB; then enable bounded-stale RAM decisions after the race,
freshness and recovery checks pass. Add declaration-level and directory code contracts with each
implementation stage. Search initially needs only the shared candidate-filtering interface.
