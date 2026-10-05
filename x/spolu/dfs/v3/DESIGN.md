# dfs:// v3

**Proposal.** Rust/Linux FUSE → tenant-affine gRPC routing → independently writable Rust servers
→ shared FoundationDB.
FDB stores all durable filesystem data; servers accept pending edits in RAM. Replace client caching
with a bounded server cache and asynchronous publication; omit ES, search, subscriptions, and
tenant ownership. Preserve the object/grant model from
[v1](../v1/DESIGN.md) and [v2's `/shared`](../v2/DESIGN.md#root-and-shared).

## Contracts

```text
MAX_EVENTUAL_CONSISTENCY_DELAY_MS = 1000  // Also evaluate 8000.
```

Call this bound `D`. It applies to content, size, metadata, xattrs, directory membership, negative
lookups, moves, and grant changes, on every server and existing open handle.
The bound covers server-side publication and cache staleness; RPC delivery may add extra delay.
Transport timeouts are independent of `D` and do not require client-side freshness bookkeeping.
All servers serving a deployment use the same `D`. Changing it requires settling pending edits and
discarding existing views before resuming with the new configuration.

- **Bounded convergence:** publication and remote cache staleness share `D`. A RAM-acknowledged
  mutation is tentative: publish it within its budget or invalidate its pending branch and report
  deferred failure. Conflicts may select another writer's complete state. Never continue serving
  a losing/expired branch or extend its deadline through new writes. See the failure boundary below.
- **Object consistency:** a read response MUST contain bytes and size from one complete file state.
  A directory page MUST describe one consistent namespace view. Both RAM acceptance and durable
  publication MUST atomically change metadata, blocks, and affected indexes. Truncation/re-extension
  MUST never expose old tails.
- **Concurrency:** any writer may win. No client-supplied expected versions, read-your-writes across
  servers, monotonic reads, or snapshot spanning separate operations. `stat` followed by `read` may
  observe different complete states; a multi-request file read is not an immutable file snapshot.
- **Object-scoped batching:** ordinary file edits coalesce only within one `(tenant, object ID)`.
  Create/remove explicitly coordinate two objects: parent directory and target. Rename coordinates
  source parent, destination parent, and moved object. These namespace operations are individual
  atomic transactions, not opportunities to merge independent object queues or different children.
- **Independent writers:** process-local locks MUST NOT provide cross-server correctness. FDB
  conflict detection remains authoritative. Tenant affinity MUST NOT imply exclusive ownership:
  overlapping servers remain valid during rerouting/recovery. No tenant lease or tenant-wide version.
- **Cached authorization:** parent links, grants, and derived permission decisions MUST share the
  existing freshness budget, with no extra TTL per ancestor or cache layer. Expired values MAY guide
  refresh reads but MUST NOT authorize a request until validated at the refreshed snapshot.
- **RAM fsync:** successful fsync MUST confirm preceding writes reached a complete, locally visible
  server state and report already known errors. It MUST NOT require or promise an FDB commit.
- **Failure:** expired views MUST refresh or fail. RAM acknowledgments, including successful fsyncs,
  MAY be lost on crash or rejected during later publication. FDB trouble MUST NOT extend cache
  validity or permit serving a pending branch indefinitely.

The bound governs filesystem operations, not bytes/listings already copied into application memory.
An application cannot be forced to reread its own buffer.

## Tenant affinity and recovery

Normally route **all clients of one tenant to the same preferred server**, including FUSE and Product
clients. They share its cache and immediately observe its RAM-accepted edits. Different tenants may
share a server. Routing uses the tenant ID; authorization must still validate the authenticated
session's tenant and grants, never trust routing information as authority.

Affinity is a performance preference, not a correctness requirement or permanent assignment. On
failure or restart, route clients to an available server. Planned movement stops new admission on
the old route and drains pending edits when possible; failure recovery does not require that server
to return or transfer its cache. Old and new servers may overlap: both retain ordinary FDB conflict
checks, absolute cache expiry, and the same `P + C <= D` budget. Affinity does not relax that bound.

The replacement starts cold from committed FDB state. Unpublished RAM edits may be lost even after
a successful fsync; only FDB-committed state survives. Process-local sessions may be recreated by the trusted tenant
session issuer; clients must never need the failed server to regain access. A lost session/server
is an explicit recovery boundary: outstanding mutations have uncertain outcomes and are not replayed;
old handles, directory cookies, and fsync barriers must be re-established rather than silently
treated as recovered. Initial recovery may require a fresh session/remount; transparent preservation
of an existing mount is not implied by affinity. The replacement must not claim to have recovered
acknowledged writes that existed only in the old process's RAM.

## Acknowledgment boundary

**Ordinary filesystem mutations acknowledge complete server RAM acceptance, never wait for durable
commit by default.** This includes writes, truncation, metadata, namespace, and grant changes. Cold
cache misses may need FDB reads first. Hot writes and rereads use RAM; reads through the accepting
server immediately include pending edits. Another server sees them after publication and cache refresh.

Persist asynchronously, coalescing and batching content operations **only within the same object**,
within FDB limits. Different files use separate transactions. Each create/remove coordinates its
parent and target in its own transaction; sharing a parent does not combine independent operations.
A create may include initial writes to its new child before its batch is frozen; it still touches
only that parent and child. No application WAL or disk recovery: a crash can lose acknowledged
edits. The client holds no dirty data. Tenant affinity normally keeps sessions together; rerouting and server overlap follow the
recovery rules above and do not introduce an exclusive writer.

**`fsync` acknowledges server RAM visibility.** The client waits for its preceding write RPCs; the
server confirms a finite prefix of target edits and required namespace changes is completely accepted
and locally visible, or reports retained errors. It does not wait for those edits or their prerequisites
to commit to FDB. Later writes cannot extend that barrier indefinitely. Concurrent edits may supersede
earlier values, as with ordinary reads; fsync does not pin a file snapshot.

Fsync does not force a publication batch, reset its deadline, or bypass expiry checks. Publication
continues under the same asynchronous schedule and `P + C <= D` budget. A successful fsync can still
be followed by publication failure or loss on crash. Ordinary close likewise adds no durability
barrier. V3 exposes no durable-fsync mode; FDB commits and orderly server drain remain internal.

**Failure boundary:** the normal convergence budget is measured from RAM acceptance, but acceptance
does not promise that this branch will survive. Conflicts, crashes, and publication failures can roll
it back to FDB's winning state. Record deferred errors for affected sessions/objects and surface them
on subsequent fsyncs and mutation attempts once known. An earlier successful fsync does not predict
the outcome of future publication. Under an ambiguous timeout, invalidate rather than replay;
the original transaction may still commit later. Strict global visibility within `D` of every RAM
acknowledgment, including these failures, cannot be guaranteed without additional coordination.
After any actual FDB commit, the read-cache freshness bound still applies to every server.

## Dumb client and API

Use a separate `dfs.v3` protocol; leave v1/v2 intact. Preserve tenant creation, session keys,
grant administration, and filesystem operations. Remove all `expected_version`, `Expected`, and
read-version fields from requests; revisions remain internal to the server. No search RPCs.
Use tenant terminology throughout the v3 API and storage model: `CreateTenant`, `tenant_id`, and
`tenant_key`. Historical v1/v2 names and formats remain unchanged.

| Client state | Policy |
| --- | --- |
| File content | `FOPEN_DIRECT_IO` on create/open; disable `FUSE_WRITEBACK_CACHE` and `KEEP_CACHE`. |
| Attributes and positive/negative names | Reply with zero validity time, including `readdirplus`. |
| Directory listings | No `FOPEN_CACHE_DIR`; no retained listing pages or cached EOF across calls. |
| Xattrs | No userspace xattr cache; unsupported namespaces still fail locally. |
| Handles/inodes | Retain only identity, flags, offsets/cookies, and transport/error bookkeeping. |

Every callback needing filesystem state calls the server. Read RPCs return size with bytes; the
client MUST NOT clip reads using an earlier `stat` result. Bound I/O to 1 MiB per RPC and stream large
files. No automatic mutation replay after transport errors. Append chooses EOF on the server.
Shared writable `mmap` is out of scope; do not enable mappings that reintroduce uncontrolled caching.

Use opaque server directory cookies mapped to FUSE offsets. Each page is independently consistent;
concurrent edits may change what later pages contain. A cookie records position, not a permanent
snapshot or cached page. Rewinding starts fresh, and another call after EOF must revalidate EOF.
Partial-response buffers live only during the current callback. libc may retain already returned
directory entries; that is application buffering, not a filesystem freshness promise.

[FUSE direct I/O](https://www.kernel.org/doc/html/latest/filesystems/fuse/fuse-io.html) bypasses the
page cache. Metadata TTLs remain separate [protocol controls](https://libfuse.github.io/doxygen/structfuse__entry__param.html).

## Objects, grants, and layout

Keep stable UUIDs/URIs, files/directories with MIME type and binary xattrs, POSIX metadata, sparse
64 KiB blocks, and sessions bound to one tenant and at most 512 opaque grants. Inherited access
is the union of grants on the object and its current ancestor chain. Tenant isolation is strict.

Retain tenant-prefixed `objects`, `children`, `data`, `grants_by_object`, `objects_by_grant`, and
tenant records. Every object record has an internal revision changed by every mutation of its
metadata, content, explicit grants, parent/name, or directory membership. Use a fresh UUID revision
per complete locally visible state; publication persists the selected state's revision. No global
allocator or client-visible revision protocol. Mark pending revisions separately from FDB read versions.

Create/remove/rename update the affected objects, parent membership, and indexes in the same FDB
transaction, and apply the same changes atomically in the local overlay. Preserve cycle prevention
and replace/nonempty-directory rules. Unlink removes data and grant entries together; the accepting
server returns `ENOENT` immediately and other servers follow within the normal convergence budget.
An old content write MUST NOT recreate a durably deleted object. A rejected tentative unlink can roll
back, like other rejected namespace edits.
File writes need not change the parent's revision; child creation and membership changes do.

The root exposes authorized immediate children plus virtual `/shared`. Shared discovery merges
the session's grant-index scans, deduplicates by object ID, and displays `<name>--<id>`. Do not suppress
entries already accessible through the main tree. Preserve the special root child named `shared`,
projection-aware `..`, and immutable synthetic directories. No grant propagation through subtrees.

## Server cache

One byte-bounded cache per process, initially **1 GiB**, shared across tenants with bounded entry,
in-flight request, refresh, and deferred-error counts. Reserve at most **256 MiB** for pending edits.
Cache complete logical views with lazily loaded data, not arbitrary independently aged key values:

```text
ObjectView = tenant + object ID + revision + metadata
           + available blocks / directory ranges (including proven holes or absence)
           + FDB read version + validation-start time + absolute expiry
AuthNode[(tenant, object ID)] = parent link + revision + cached explicit grants/membership results
                            + FDB read version + validation-start time + absolute expiry
AuthorityProof = tenant + target ID + exact session grant-set identity
               + verified ancestry/grant dependencies + read version + earliest dependency expiry
Pending[(tenant, object ID)] = immutable complete overlay + ordered edits for that object
                              + prerequisite references + oldest acceptance time
                              + fixed publication deadline + deferred errors
NamespaceMutation = operation + participating object IDs + queue ordering barriers
```

Use one local object gate to coalesce loads and serialize local mutations. Cache misses for unrelated
objects run concurrently. Evict clean data freely; never silently evict acknowledged pending edits.
Apply admission backpressure before acceptance when dirty capacity or deadlines cannot be respected.
Restart discards all cache state. No disk cache or local recovery initially.

**Expiry is absolute, never sliding.** Measure from before acquiring the FDB read version, not from
completion of a slow fetch. Hits, block fills, negative results, and derived views cannot restart the
clock. Refresh reads fresh FDB state; renewing an unchanged object requires a revision check. An
unchanged file revision does not renew its ancestor authorization proof.

Initial budget split; tune only while preserving `P + C <= D`. Never assign the full `D`
independently to publication and cache expiry:

| Budget | Fraction | `D = 1000 ms` | `D = 8000 ms` |
| --- | --- | ---: | ---: |
| Acceptance → publication, including retries (`P`) | `D / 2` | 500 ms | 4000 ms |
| FDB-backed read/authority freshness (`C`) | `D / 2` | 500 ms | 4000 ms |

For publication completed within `P`, `P + C <= D` bounds visibility on another server; RPC delivery
is outside this budget. Begin publication after a short **25 ms coalescing window**, earlier for
pressure or dependencies;
`P` is a maximum budget, not the normal flush interval. Capture the oldest acceptance time before
acknowledging and never reset it when more edits arrive. Retries inherit that deadline.

Before sending a read response, validate the base/authority ages against `C` and the pending branch
against its publication deadline. Transport deadlines remain independent. Background refresh may
retain pending operations only after validating/rebasing their base; it cannot extend their
publication deadline. A batch missing that deadline stops being served and records failure. This
does not cancel a commit already in flight; its outcome remains unknown until resolved.

Fsync uses ordinary bounded RPC/ordering waits, with no separate persistence wait. It cannot keep
expired pending views readable or clear deferred failures. Neither writes nor fsyncs renew deadlines.

There is no additive TTL at another layer. Derived pages/authorization results inherit the earliest
dependency expiry. Missing objects/names and `/shared` pages get the same bound. Check session closure
and expiration per RPC. Permission decisions are keyed by tenant and exact grant set, never object
ID alone. Read proofs may be stale within `C`; committing mutations validate their authority through FDB.

### Parent/grant cache and hinted refresh

Keep parent links and explicit grants in server RAM, charged to the same bounded cache. Reuse their
immutable revisions from object views instead of maintaining independently authoritative copies.
Cache complete grant sets when they fit; otherwise retain bounded grant pages/membership results with
explicit completeness/absence markers. An incomplete set cannot prove that access is denied. Share
these facts across sessions within a tenant; derived allow/deny proofs include the exact grant set.

**Hot evaluation is entirely in memory:** follow cached parent links, intersect explicit grants with
the session grants, and reuse a proof only while its relevant dependencies are coherent and valid.
All nodes used by a proof must describe one FDB snapshot plus a consistent cut of local pending edits.
The proof expires with its earliest dependency, never `C` after the proof was computed. Both allow
and deny results obey this rule. Grant publication delay plus authority-cache age remains bounded
by `P + C <= D`, including moves that change inherited access. RPC delivery may add extra delay.

Refresh retains [v2's ancestry hinting approach](../v2/DESIGN.md#ancestry-read-hints):

1. Use resident parent IDs, including expired ones, to predict a bounded ancestor chain. Start object
   revision/parent reads and useful grant reads concurrently in a **fresh FDB transaction**, initially
   at most 16 nodes in flight. Cached matching grants can prioritize membership probes.
2. Follow only parent links confirmed by that snapshot. A changed link redirects traversal; fetch
   newly discovered ancestors in the same transaction and ignore off-chain results/errors. If an old
   matching grant disappeared, evaluate other current grants rather than treating its absence as denial.
3. If a node's revision is unchanged, its cached parent/grant values may be reused at the new read
   version: every parent/grant mutation changes that revision atomically. Otherwise fetch the changed
   values. Never promote stale grants merely because the target file's own revision stayed unchanged.
4. Publish the refreshed facts/proof atomically with expiry measured from before the new read-version
   acquisition. Reconcile pending local edits as for content; an overlapping invalidation wins over
   an older refresh. If refresh cannot finish within the budgets, fail rather than authorize from hints.

Retain expired facts only as bounded refresh hints; accessing them does not renew their authority.
Local moves/grant edits change the corresponding cached node generation immediately. Proof reuse
checks its recorded dependency generations, so ancestor changes invalidate descendant decisions
without walking or rewriting the subtree. Evicted dependencies require revalidation. FDB publication
still conflict-checks the verified authorization dependencies; a valid RAM proof alone is insufficient
to commit. These authorization reads do not widen the transaction's object write scope.

## Consistent reads

1. Select a valid FDB base and authority proof, plus a pinned complete local overlay if present.
   A fully cached request returns from RAM, including just-acknowledged edits. Lookup can return the
   child directly; no initial client version-fetch RPC.
2. Read missing unchanged blocks/ranges at the base's FDB read version and apply the selected overlay.
   Never combine pending size with unrelated current blocks. Writes/truncations override base bytes;
   known holes produce zeros, but a missing cache entry is not proof of a hole.
3. If the old FDB snapshot is unavailable or any dependency expires, discard the response under
   construction and refresh. At a fresh snapshot, unchanged revision permits cached block reuse;
   a changed revision invalidates the old base and forces reconciliation of pending edits. Replace
   the whole visible view atomically or fail; never leak a half-rebased result.

A directory page includes membership and returned child attributes from the same base snapshot plus
one consistent cut of local namespace edits. Do not assemble independently fresh but mutually
inconsistent object views. Cache complete page
results with their original dependencies/expiry; refill or revalidate them as a unit. `/shared`
similarly combines grant-index membership, names, and authorization from that logical view.

FDB's roughly [five-second MVCC window](https://apple.github.io/foundationdb/known-limitations.html#long-running-transactions)
is independent of `D`. An 8-second configuration never licenses an 8-second FDB transaction. Cached
bytes may remain resident after expiry, but cannot be served until their revision is revalidated.

## Per-object optimistic transactions

For a file edit, the server interprets the operation against the current local view under its object
gate, builds a new complete overlay, reserves pending capacity, publishes it to local readers, and
acknowledges. No FDB commit on this foreground path. Preserve untouched bytes and unspecified
attributes; competing operations may overwrite the same bytes. Never write an old whole record over
a newer parent, grants, or namespace state.

**Background publication:** freeze a bounded prefix, coalesce its edits, and create a short FDB
transaction for the object at the cached base's original read version. A file-owned write set
contains its metadata, blocks, and index entries only; content writes do not update parent metadata.
Create/remove instead use their explicit parent-and-target scope, atomically initializing or deleting
the child and its required indexes/data. A create may also include initial content/metadata edits
of its new child before publication starts; other namespace operations never absorb independent
content-write queues.
Ancestor/grant reads remain necessary for authorization, but do not enroll their objects' pending
edits into the transaction. Explicitly register read conflicts for every cached dependency before
applying mutations: object revision,
authorization-chain revisions, and any relied-on existence/name/range conditions. Each writer must
change the associated revision guards atomically with its data. Fetch uncached dependencies at that
same read version. This can avoid both read-version acquisition and repeated key reads on a hot edit,
while retaining FDB's commit validation; a RAM lookup alone is never a transactional read. Publication
does not hold object gates over FDB I/O: it commits an immutable batch while later RAM edits may queue.
Allow only one in-flight publication per participating object per server; unrelated objects publish
concurrently through separate FDB transactions. Give each object its own deadline, retry state, and failure
accounting. Flush a bounded prefix early when it reaches the transaction budget, never merge it with
another object or extend its deadline to fill a batch.

Only reuse snapshots with enough MVCC lifetime remaining for the bounded commit attempt. Otherwise
start fresh and validate cached revisions before using cached bytes. Never take a fresh read version,
add conflict ranges, and assume that validates older cached values: it misses intervening changes.
See [explicit conflict ranges](https://apple.github.io/foundationdb/developer-guide.html#conflict-ranges)
and [read-version selection](https://apple.github.io/foundationdb/api-c.html#c.fdb_transaction_set_read_version).

| Outcome | Required cache action |
| --- | --- |
| Commit succeeds | Advance the durable base and retire only the frozen prefix; atomically reapply any later pending edits. The original acknowledgments already happened. |
| Definitely uncommitted conflict/expired snapshot | Invalidate base/proofs and dependent views; reload and reapply still-valid semantic edits within their original publication deadlines. Otherwise discard the branch and retain deferred errors. |
| Namespace/authorization rejection | Discard rejected edits and dependent edits; expose the reconciled winning state and retain the applicable deferred errors. |
| Ambiguous commit, cancellation, or timeout | Invalidate affected views and dependent edits; retain an error without replay. Reload authoritative state before serving them again. |

Readers may see complete uncommitted views immediately; they never see partially patched or
partially rolled-back state. Track a local cache generation so a load started before invalidation
cannot repopulate the cache afterward. Publication completion must match its frozen prefix and cache
generation; a late completion for an invalidated branch forces reload instead of restoring it.
Invalidation also removes dependent ranges, blocks, and responses. Other servers expire within `C`.

After commit, stamp the new durable base with its actual FDB commit version, never the old read version.
Retain/reuse only bytes and proofs covered by that transaction's validation, and conservatively carry
forward their original validation times/expiry; otherwise invalidate them. A commit is not permission
to renew unrelated cached state. FDB does not roll back application RAM on transaction failure, so
pending edits must remain distinguishable from the committed base even while locally visible.

### Transaction ownership and namespace atomicity

| Operation | Owning object / coordination scope | Atomic changes |
| --- | --- | --- |
| Write, truncate, metadata/xattr update | Target file or directory | That object's metadata and applicable blocks. |
| Grant update | Target object | Its revision and both grant-index directions. |
| Create / mkdir | Parent directory + target object | Parent revision/membership and initialization of target metadata/indexes. |
| Unlink / rmdir | Parent directory + target object | Parent revision/membership and removal of target metadata, data, and grants. |
| Rename / move | Source parent + destination parent + moved object | Both memberships, moved parent/name, and affected revisions. |

Each create/remove coordinates **both parent and target**, including the new UUID for a create.
Both RAM visibility and FDB publication include their changes atomically. Place ordering barriers
in both objects' queues; do not batch different children merely because they share a parent. Validate
the target's state, including absence for create, emptiness for rmdir, and its parent binding for
remove. Concurrent target writes conflict through its record; a rejected writer must reload and
cannot resurrect a removed target. Removal invalidates/cancels dependent local target edits while
unrelated file queues continue.

Rename is an explicit coordinated operation across **three objects**: source directory, destination
directory, and moved file/directory. Deduplicate IDs for a same-directory rename. Replacing an existing
destination also checks/removes that victim atomically and invalidates its pending edits. Acquire
affected local gates in sorted order for RAM changes and place ordering barriers in participating
queues; publish one atomic rename without absorbing their unrelated queued edits. Barriers wait for
required earlier publications without holding a tenant lock across I/O.

Initial writes to a pending new file MAY join its parent-and-target creation transaction until that
batch is frozen. This does not widen the create's two-object scope or combine different children.
Writes accepted after freezing publish next in a file-only transaction, ordered after creation.
All these writes acknowledge RAM acceptance without waiting for creation to commit.
Grant-dependent writes likewise wait for pending grant edits in another object's transaction.
Prerequisite waits count against the dependent write's original deadline. Rejection invalidates
actually dependent edits, not independent object queues. Bound the dependency graph and apply
backpressure before acceptance. Never split one rename into separate commits.

FDB's [transaction limits](https://apple.github.io/foundationdb/known-limitations.html#large-transactions)
still apply: bounded 1 MiB I/O, 64 KiB values, and a checked total mutation/conflict budget. Reject an
oversized atomic operation rather than partially committing it. A large file is a sequence of atomic
bounded edits. Range-clear deleted/truncated blocks; update EOF and the surviving tail atomically.

## Validation and next steps

Implement the uncached client with RAM acknowledgment, coherent overlays, deferred errors, and
bounded asynchronous publication from the start. No durable-before-ack intermediate design.
No v1/v2 implementation changes in this proposal. Measure both `D` settings against:

- Two independent servers: warm all caches on A, mutate through B, then verify the bound for bytes,
  EOF, xattrs, negative lookups, listing/EOF, rename, inherited grants, and `/shared`.
- Races: partial write versus truncate/extend, delete versus write, rename versus authorization,
  conflict during a cached edit, publication versus newer queued writes, pending create/grant
  dependencies, rollback after acknowledgment, late cache fills, and slow reads crossing expiry.
- Authorization cache: reuse hot parents/grants without FDB reads; refresh via parallel hinted reads.
  Test changed ancestors, revoked and newly added grants, stale allow/deny proofs, off-chain hint
  errors, incomplete grant sets, eviction, and refresh racing a local grant edit. Assert one shared
  freshness budget and no descendant fan-out or tenant-wide invalidation.
- Transaction scope: queued writes to A and B MUST produce separate commits; a conflict or blocked
  publication on A MUST NOT stall independent B. Create/remove MUST coordinate parent and target;
  different children remain separate. Verify rename coordination, same-parent deduplication, replacement,
  and that only a create may include initial writes to its own child before freezing; other
  namespace publications never absorb independent file-content writes.
- Failures: isolate a server from FDB, delay commit/reply/refresh, expire an FDB snapshot, lose a
  commit reply, and restart. Assert errors instead of over-age or internally inconsistent success.
- RAM fsync: pause publication within its budget and verify cached writes, rereads, and fsync complete
  without an FDB commit. Crash before publication and allow those fsynced edits to disappear while
  recovering consistent committed state. A later detected publication failure must reach later fsyncs.
- Affinity: route two tenant clients to A and verify immediate RAM visibility, then reroute to B with
  A still running and after killing A. Verify concurrent-writer safety, cold recovery, committed-state
  durability, permitted loss of RAM-fsynced edits, session re-establishment, and failure of old barriers.
- Existing 10k/100k and deep-subtree workloads: untar, open/stat/close, and read/hash. Record RPC
  counts, cache-hit/refresh ratios, batching, FDB reads/commits/conflicts, acceptance-to-publication
  age, remaining drain, server-side cache age, and RPC latency separately. Repeated writes must not
  extend deadlines.

Expect hot writes and rereads to avoid foreground FDB I/O, and coalescing to reduce commit count.
Cold misses, cross-server conflicts, and namespace dependencies still cost FDB work. Measure these
separately before adding watches, disk caching, or search.

## First local implementation

The initial implementation uses one pinned FDB snapshot plus an immutable cut of RAM edits for each
request. Point/range caches share that snapshot's absolute expiry; parents and grant memberships
are cached there too. Refresh uses bounded ancestry hints. A short RAM lock validates and installs
edits; no lock is held across FDB I/O. Publication scopes and dependency barriers remain per object.
Initial writes can join their create; unrelated children remain separate commits.

RAM edits are indexed by physical key, with file-scoped indexes for truncation/clear markers.
A read pins an acceptance sequence and resolves only versions at or before that cut, newer than
its FDB base. It does not copy or scan the full journal. Listings merge indexed mutations in batch
order; local conflict checks use the same key/range index. Pending publication and object-participant
indexes exclude completed history. Retire only the oldest terminal entries after `P + C`, when no
valid older snapshot can need them; account for index memory before acknowledgment. Resident primary
objects skip speculative hint construction; semantic reads still validate every consumed link/grant.
Point-cache hits borrow keys without allocation. Ancestor reads decode each record only once.

Publication retries definitely uncommitted attempts immediately within the original deadline,
validating their original preconditions at a fresh read version. Authorization guards compare
consumed parent links and grants, allowing unrelated ancestor timestamps to change. A changed target
precondition rejects the tentative branch
and records failure; general semantic rebasing is not implemented yet. Ambiguous outcomes are never
replayed. Invalidating a rejected batch does not cancel unrelated object publications.

The server retains FDB-backed blocks and proven holes across snapshot refresh, keyed by the
tenant/object/block key and private object revision. Each use first validates the object and its
authorization in the current coherent view. A changed revision misses the cache; an unchanged
revision never renews ancestor permissions. Objects changed by the RAM overlay use the journal
instead, preserving pending-operation dependencies. Cache hits used to prepare writes still record
publication conflict dependencies. No client or API change is involved.

Retained blocks share the existing RAM budget and a 65,536-entry cap. FIFO eviction discards only
clean retained facts; pending writes remain charged to the journal. Retention failure does not fail
an otherwise successful read. Restart discards all retained blocks.

Derived authority proofs and independently refreshed object bases remain follow-up work. Local
10k baselines at both bounds are recorded in [bench/RESULTS.md](bench/RESULTS.md). The 100k corpus,
broader fault injection, and networked evaluation remain separate steps.
