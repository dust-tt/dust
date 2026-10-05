# dfs (henry) — design and tradeoffs

Living document, updated with every design change and benchmark finding. The source specification is
the "Dust filesystem specification" (2026-10-05); this file records what the prototype implements,
where it deviates, and why.

Status: **prototype runs end to end (server, mount, benchmarks); hill-climbing.** Reviews: design
(Codex gpt-6-astra xhigh + Fable), code review 1 (Codex) fixed, review 2 (Codex + Fable) fixed,
advice 2 (matched profile) and 3 (content prefetch) applied. Smoke and two-mount coherence tests
pass in both profiles.

## Goal

Beat Spolu's dfs v2 (pinned `90f9932`) on his own benchmark — jd's VFS workloads, the 10k-file
untar, and the deep-grant untar — on the same machine and the same FoundationDB settings, while
keeping the specification's agreed contract: durable create/close/fsync, live authorization with
inherited write-stop boundaries, exactly-once retries.

## Measured ground truth on this machine (OrbStack, 12 vCPU, FDB 7.3.69 `single ssd`)

| measurement | native knobs | Spolu's tuned knobs* |
| --- | ---: | ---: |
| FDB GRV p50 | 0.61 ms | 0.08 ms |
| FDB point read p50 | 0.14 ms | 0.06 ms |
| FDB commit p50 (17 KB value) | 3.96 ms | 2.47 ms |
| `fdatasync` on the FDB volume p50 | 0.72 ms | — |
| **Spolu v2 untar, 10k files** | **65.6 s (6.56 ms/file)** | not run yet |

\* commit batch intervals 10 µs, server/client busy-wait 100 µs, GRV batch 1 µs.

Spolu's pinned harness acknowledges writes and `utimensat` from **server RAM** (writeback 256 MiB);
only create is a synchronous FDB commit. Per untarred file he pays: lookup RPC + durable create +
3 RAM-acknowledged RPCs that each still take a fresh read version and authorization reads.

## The budget, honestly

The agreed contract makes create and close each durable before returning, and tar is serial:
**two durable commits per file is the floor** (≈ 8 ms native, ≈ 5 ms tuned here). Spolu pays one
commit plus four cheap local RPCs (≈ 6.6 ms native). So on this machine:

* **Untar under the agreed contract is expected to be at parity or a loss locally**; it should win
  where read round trips are expensive (GCP: his non-commit RPCs cost ≈ 3 ms each, ours are zero).
* **First-touch reads are the decisive win**: ≈ 110 directory RPCs instead of ≥ 10–20k per-file
  RPCs; warm reads at parity (kernel cache in both).
* The only ≥ 2× untar lever is to defer create durability to the file's first close/fsync (one
  commit per file). That changes an agreed contract item, so it is **a separately labelled
  profile**, never the headline, and only after the strict profile is measured.

## Architecture

```
tar/rg/python ─ kernel FUSE ─ dfs-mount ══ framed TCP (postcard) ══ dfs-server ─ dfs-store ─ dfs-fdb ─ FoundationDB
                    ▲ notify_inval_*           ◄── Invalidate / ack ──┘ (lease holder table in memory)
```

| crate | owns |
| --- | --- |
| `dfs-store` | ordered transactional KV trait + in-memory reference adapter (conflict-checking) |
| `dfs-fdb` | FoundationDB adapter; the only crate linking the SDK |
| `dfs-proto` | wire messages, framing, limits, errno mapping |
| `dfs-core` | records, authorization (grants + boundaries), filesystem operations over `Store` |
| `dfs-server` | sessions, read-version policy, lease holder table, invalidation, dispatch, admin |
| `dfs-mount` | FUSE daemon (`fuser` 0.18): inode table, lease-validated caches, write buffering |

**v1 runs one server** (both reviews). The transaction shapes stay multi-server-ready (no
correctness depends on server memory except lease holder tables); cross-server invalidation
(`lsrv` registry) is deferred and documented below.

## Records (tenant prefix applied by the adapter)

| key | value | written by |
| --- | --- | --- |
| `n/<id>` | node: parent, name, kind, mode, size, mtime, ctime, content rev, symlink target, has-policy, detached | create, close/flush, setattr, rename, unlink |
| `e/<dir>/<name>` | child id + kind | create, rename, unlink |
| `t/<dir>` | directory mtime ns, little-endian, updated with atomic `MAX` (never read in mutations) | child create/unlink/rename |
| `b/<id>/<idx>` | 64 KiB content block (last one short) | flush |
| `p/<id>` | explicit policy: grants (principal → read/write/manage) + boundary flag | admin |
| `g/<principal>` | group membership | admin |
| `k/<token-hash>` | principal + tenant-admin flag | admin provision |
| `r/<session>/<seq>` | mutation receipt (result) | every mutation, same transaction |
| `s/<session>` | session principal + creation time | Hello |
| `u/<principal>\0<group>` | membership index (read per principal) | admin |
| `j/i/<id>` | index obligation | every content/namespace mutation, same transaction |
| `m/topo` | authorization epoch: bumped by every policy, membership, token, or cross-parent directory move (not by rmdir) | admin, dir rename |
| `m/next-id` | id allocator (blocks of 4096) | allocator |

Separation matters: sibling creates touch `e/<dir>/<new>`, `n/<new>`, `t/<dir>` (blind atomic) — none
of which any other create or permission check reads. Spolu's parent-record contention disappears.

## Read-version and validation policy (both reviews' top item)

* Every mutation's outcome-affecting reads are conflict-tracked; a committed mutation therefore
  linearizes at its commit version even when it started from a reused read version.
* Reused read version = `max(cached GRV ≤ 1 s old, this server's last commit version)` — never below
  our own last commit, so create→close never self-conflicts.
* **Error outcomes are never reported from a reused version** (a read-only FDB commit validates
  nothing): `ENOENT`/`EEXIST`/`EACCES`/… are re-derived at a fresh GRV before replying.
* Authorization uses a server cache of nodes on the ancestor path + policies + membership, tagged
  with the `m/topo` epoch it was loaded at. Each transaction reads `m/topo` (one parallel point
  read); equal epoch ⇒ the cache is exact at the read version, and the conflict range covers later
  changes. Different epoch ⇒ drop the cache and reload.
* **Zero-read close.** The server remembers `(node, commit version)` for nodes it just wrote. A flush
  within 4 s of that version uses it as read version, adds conflict keys `n/<id>` + `m/topo`, and
  issues no reads: create's validation covers `[rv_create, v_create]`, close's conflict check covers
  `(v_create, v_close]`. Any conflict ⇒ retry through the full read path.
* Read RPCs (lookup/getattr/readdirplus/read) take a fresh GRV after registering lease holders.

## Leases (single server)

* Session lease D = 30 s, renewed every 10 s; validity measured from the send time of the last
  acknowledged renewal on the mount's monotonic clock (the server measures from receipt, so it
  never expires a lease before the mount does). Renewal is refused while the session has an
  unacknowledged invalidation older than D/2 (a stuck mount cannot extend revocation indefinitely).
* Holdables are `Node(id)` (attributes, content, symlink target) and `Dir(id)` (every name in the
  directory, positive or negative, and its listing).
* **Registration without a pre-read race: the touch check.** The server keeps a mutation sequence
  and `touched[holdable] = seq` of the last mutation that invalidated it. A read takes `s0 = seq`
  *before* its read version, reads, then (under the registry lock) registers the session for every
  holdable it returns and checks `touched > s0` for each. A mutation committed after the read
  version touches after `s0`: either before registration (the reader sees `touched > s0` and
  retries, at most 3 times, then replies uncacheable) or after it (the mutation sees the reader as a
  holder and invalidates it). This also covers children whose ids are only known after the read.
* Mutation: commit → under the registry lock, check/register the caller for what the reply
  returns, touch the mutation's holdables, collect *other* holders → send `Invalidate` → wait for
  each ack or that session's lease expiry (re-checked if a renewal moved it) → reply. **No lock is
  held across the ack wait.**
* Directory move across parents and every policy/membership change ⇒ `All`: every session drops
  everything, including the mutating mount.
* Mount: **per-object freshness.** A generation counter is bumped by every applied invalidation and
  own mutation reply, which stamp it on each node they change (`All` and lease loss raise a floor
  instead). A reply may install cached state only if none of the nodes it installs or names was
  stamped after the generation read when its request was sent; otherwise it reaches the kernel with
  TTL 0. (A first, global generation made every concurrent background commit invalidate every
  in-flight lookup: 988 lookup + 1,644 getattr RPCs in a 1,000-file untar; per-object: none.)
  Kernel notifications run on a
  dedicated thread that acks only after the kernel calls return; `ENOENT` from
  `notify_inval_entry` is ignored. Kernel TTL = remaining lease validity. On lease loss or
  disconnect the daemon drops its caches and invalidates every known inode.
* Known limit: a remote invalidation of directory D can block in the kernel on D's `i_rwsem` while
  this mount has its own mutation in D waiting on the server, which waits on the other mount's
  ack. Two mounts mutating the same directory can therefore stall each other until a lease expires
  (≤ D). Single-mount benchmarks cannot hit it.
* **`Close` = immediate release; disconnect = holds stand until the lease expires.** A lost
  connection does not prove the mount purged its kernel caches (it may be paused), so the server
  keeps the session's holds until its lease, which can no longer be renewed, runs out (review 2).
  The mount, on disconnect or a failed/late renewal, drops every cache and invalidates every known
  inode. Known gaps: a restarted server does not wait out its predecessor's leases (needs a
  persisted lease horizon), and a mount whose renewal failed stays uncached until remounted.
* **Negative entries reach the kernel with a TTL only if the kernel can drop them.** Linux 7.0
  rewrote `fuse_reverse_inval_entry` around `start_removing_dentry`, which returns `ENOENT` for a
  negative dentry: `FUSE_NOTIFY_INVAL_ENTRY` cannot evict a cached "no such file" (master reverted
  to `d_lookup`). The mount probes this at start (look up a reserved root name, invalidate it, look
  it up again) and otherwise answers misses with `ENOENT`, which the kernel never caches; the
  daemon still answers them from its lease-covered directory cache. Cost: one FUSE round trip per
  repeated miss on 7.0 kernels.
* No kernel writeback cache (would reorder `utimensat` vs data and break invalidation of dirty
  pages). Spolu enables it; disclosed in results.

## Data path

* Daemon buffers writes and `utimensat` per inode; bounded per file (4 MiB or 120 distinct 64 KiB
  blocks; over the bound the write itself flushes, durably). A read of a dirty file flushes first;
  `getattr` overlays the buffered size and mtime. No per-mount bound yet.
* `flush` (every close) and `fsync` commit the inode's buffered prefix: blocks + node in one
  transaction. Whole-block writes need no block reads; partial blocks are patched server-side inside
  the transaction.
* Warm content is the kernel page cache: `open` returns `FOPEN_KEEP_CACHE` only when the daemon's
  lease-covered attributes carry the same content rev the kernel was last given; any `Node`
  invalidation purges the inode's pages (`notify_inval_inode`).
* **First-touch content: demand-triggered sibling prefetch** (advice 3). A read miss on a file of at
  most 1 MiB sends one `ReadFiles` with the file plus the next *W* small (≤ 256 KiB) siblings in
  its directory's cached listing that are not cached or in flight; *W* starts at 4 and doubles with
  every miss in that directory up to 256, within a 4 MiB reply. Contents land in a 256 MiB
  daemon cache keyed by `(id, rev)`: since every content change bumps `rev` and ids are never
  reused, a cached `(id, rev)` is an immutable fact and needs no lease hold — a READ is served from
  it only when the lease-covered attribute currently says `rev`. Other threads missing on a file in
  flight wait for that call. Metadata-only workloads never trigger it (rg --files, scandir).
  Security: `All` invalidations and lease loss empty the cache, and a reply is installed only if no
  such drop happened since its request was sent — otherwise a principal whose read was revoked
  could be served bytes fetched before the revocation under an attribute re-listed after it
  (`readdir` returns a child's attributes without checking the child's own read grant).
* Unlink: remove entry, mark node detached; v1 never collects detached content (open-unlinked
  files keep working; space is not reclaimed — collection with durable pins is deferred).

## Protocol

* One TCP connection per mount session, length-prefixed postcard frames, calls multiplexed by id.
* `ReadFiles { ids, budget }` returns whole contents of the readable files among `ids` that fit in
  order, at one fresh read version; it registers no holds (see Data path).
* Every reply carries `invalidations` (what this call changed, applied to the caller's own caches
  instead of a push) and `cacheable` (false when the touch check failed three times, or the call
  invalidated everything).
* `Close` releases the session's holds explicitly before unmount; EOF does not (see Leases).
* **Resends are not supported in v1**: a reconnect is a new session. The receipt (`r/<session>/<seq>`)
  is still written in every mutation and consulted when FDB reports `commit_unknown_result`, which is
  what makes an uncertain commit exactly-once inside the server's retry loop.

## Durability profiles

| profile | create/mkdir/rename/unlink | close | fsync | fsyncdir / syncfs |
| --- | --- | --- | --- | --- |
| `strict` (default, the agreed contract) | durable before return | durable before return | durable | — |
| `matched` (labelled, Spolu-equivalent) | durable before return | returns at once, commit in background | waits for that file's commits, reports their failure | `fsync` of a directory waits for every background commit |

`matched` exists only to compare like with like: Spolu acknowledges close (data and `utimensat`)
from server RAM. Our background commit is a durable FDB transaction launched at close (≤ 64 in
flight), so the RAM window is the commit latency, not a drain interval. A failed background commit
keeps its batch buffered (it is retried by the next close/fsync) and is reported once by the
file's next close or fsync and by the next directory fsync. Known gaps: `fuser` 0.18 has no
`FUSE_SYNCFS`, so `syncfs(2)` is a no-op and the harness fsyncs the mount's directory instead; an
unmount waits for every background commit, but a crashed daemon loses unacknowledged closes —
exactly Spolu's exposure. (Fable suggested a sticky per-inode error instead of re-buffering: we do
both — the batch stays, and the error is sticky until reported.)

## Contract deviations (flagged)

1. **Regular-file `utimensat` buffers like writes** (durable at the next close/fsync). tar calls
   `futimens` before `close`; mode is set at create, so chmod stays synchronous. Directory setattr
   stays synchronous.
2. **Leases in the first profile** (spec lists kernel caching as Review). Required for warm rows;
   validated by a two-mount coherence test.
3. **In-place 64 KiB block map** instead of an immutable chunk tree: atomic via the transaction,
   truncate is `clear_range`; no content dedup, no snapshot reads of old versions.
4. **postcard over TCP** instead of gRPC: server push for invalidations. No TLS in v1.
5. **No search indexer**: index obligations are still written in every transaction.
6. **No collection of detached/orphaned content** in v1.

## Out of scope for v1

Cross-server leases (`lsrv` registry with separate heartbeat key), TiKV adapter, search, xattrs
(getxattr → `ENODATA`/`ENOSYS`), hard links (`EOPNOTSUPP`), locks, writable shared mmap, receipt
collection, quotas, TLS.

## Code contracts (deliberately few)

* `x/henry/dfs/CONTRACTS`: tenant/principal derived only from the authenticated session; only
  `dfs-fdb` links the database SDK.
* Declaration contracts only where a plausible change silently breaks correctness: write-authority
  evaluation, read-version reuse + error re-derivation, zero-read close validity, lease
  acknowledgement rule, mount generation rule, flush durability.

## Benchmark protocol

Our adapter of Spolu's `vfs.py` / `untar.py`: same corpus and manifest hash, same jd workloads
unchanged, same `tar --no-same-owner` command, new server + mount before every `first` row, untar
then `syncfs` timed separately. Both systems run back to back on this machine against FDB containers
with identical image, configuration, and knobs. Report every row, RPC/commit counts per file, and
semantic differences (durable close vs RAM acknowledgement, kernel writeback cache).

## Results log

| date | system | profile | untar 10k | notes |
| --- | --- | --- | ---: | --- |
| 2026-10-05 | Spolu v2 `90f9932` | native knobs, RAM writeback | 65.58 s | jd rows in `bench/results/spolu-vfs-native.log` |
| 2026-10-05 | ours, first build | strict, native knobs | 103.74 s | `bench/results/vfs-1`; deep-grant 1000 files 11.27 s (2053 commits) |

First full comparison (ms, `first` / `warm`; ours vs Spolu):

| row | ours | Spolu |
| --- | ---: | ---: |
| scandir+stat | 503 / 158 | 9,267 / 2,383 |
| rg --files | 156 / 8.3 | 639 / 5.07 |
| open+fstat+close | 883 / 468 | 34,487 / 776 |
| stat missing | 328 / 2.2 | 644 / 4.5 |
| rg no-match | 2,189 / 46 | 7,412 / 58 |
| rg rare | 2,354 / 55 | 6,245 / 51 |
| branch glob | 488 / 21 | 1,170 / 11.6 |
| depth-10 | 81 / 4.4 | 263 / 4.36 |
| read+SHA | 19,988 / 2,032 | 47,275 / 11,481 |
| pread | 944 / 3.7 | 1,379 / 7.3 |
| create+write / fsync / close / unlink | 171 / 176 / 0.56 / 227 | 211 / 562 / 0.78 / 268 |

Diagnosis: untar pays two ≈ 4 ms commits per file (the contract floor). Content rows pay one Read
RPC per file (≈ 1.6 ms: fresh GRV + block read), and `rg` issues two per file (a 3-byte BOM probe,
then the rest). The `stat missing` warm row predates the negative-entry probe (7.0 kernels now pay
a FUSE round trip per miss).

## Review 2 findings (Codex + Fable), all fixed

1. A failed flush discarded the buffered writes: they are now restored ahead of newer writes.
2. EOF released lease holds immediately; now they stand until expiry (see Leases).
3. `readdirplus` re-emitted an opendir snapshot with a live TTL after an invalidation: snapshots
   carry the generation they were cached at, and TTL is 0 unless it still matches.
4. `mutated` returned a TTL when the generation check failed: now 0.
5. Invalidations were acknowledged even when a kernel notification failed: any failure other than
   `ENOENT` now fences the mount (drop everything, stop acknowledging); renewals time out.
6. (Found by the coherence test) Linux 7.0 cannot invalidate negative dentries: probed at start.
