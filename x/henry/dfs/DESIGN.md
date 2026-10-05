# dfs (henry) — design and tradeoffs

Living document, updated with every design change and benchmark finding. The source specification is
the "Dust filesystem specification" (2026-10-05); this file records what the prototype implements,
where it deviates, and why.

Status: **bounded-staleness design implemented, benchmarked at 1 s and 8 s, all local checks
pass.** The lease design (v1) is gone; its history is in git.

## Contract

The contract this prototype implements (agreed 2026-10-05, replacing the durable-close /
lease contract):

1. **`MAX_EVENTUAL_CONSISTENCY_DELAY`** (`--max-delay-ms`, 1 s by default, 8 s for comparison):
   once a mutation is acknowledged on one mount, every request that starts more than
   `MAX_EVENTUAL_CONSISTENCY_DELAY` later, on any mount, observes it (or a later state). The budget
   covers both the commit delay and any daemon-side cache.
2. **No kernel caching.** Attribute and entry TTL are 0, every open is `FOPEN_DIRECT_IO`, no
   `READDIRPLUS`, no writeback cache, no `FOPEN_KEEP_CACHE`/`CACHE_DIR`.
3. **fsync and metadata writes may be buffered** (acknowledged before they are durable).
4. **Object-level consistency at all times**, for clients and in durable storage: a file's size
   always matches its blocks; a read returns one whole state the writers produced; nothing is torn
   by a crash.
5. **No constraint on which concurrent writer wins** on an object; a client may see a world that is
   inconsistent with its own earlier operations on *other* objects.

Defaults chosen where the contract was silent (flagged for confirmation):

* `fsync(2)` on a file is buffered like any other write. `fsync` of a **directory** is the drain
  barrier: it returns once every mutation this mount acknowledged before it has committed, and
  reports the first failure since the previous barrier.
* Read-your-writes holds within one mount (the overlay below); across mounts, only the delay bound.
* Revocation of read access is time-bounded: a mount may serve content it fetched before the
  revocation for at most `MAX_EVENTUAL_CONSISTENCY_DELAY`.

## The budget

`Budget::new(max)`: commit **window** = `min(max / 4, 1 s)`, daemon cache **TTL** = `max − window`
(250 / 750 ms at 1 s; 1 / 7 s at 8 s).

* A mutation acknowledged at `t` is committed by `t + window` (admission control below; a commit
  later than that is counted as a *missed window* and reported).
* Every server read runs at a read version taken after the request arrived (`fresh-reads`), so a
  reply includes every commit that finished before the request was sent.
* A cached reply is served only while `now − send time < TTL` (`ttl-at-serve`).

So a stale answer can only come from a request sent before `t + window`, and it is served at most
until `t + window + TTL = t + MAX`. The visibility test checks this bound for every mutation kind.

## Architecture

```
tar/rg/python ─ kernel FUSE (no caching) ─ dfs-mount ══ framed TCP (postcard) ══ dfs-server ─ dfs-store ─ dfs-fdb ─ FoundationDB
```

| crate | owns |
| --- | --- |
| `dfs-store` | ordered transactional KV trait + in-memory reference adapter (conflict-checking) |
| `dfs-fdb` | FoundationDB adapter; the only crate linking the SDK |
| `dfs-proto` | wire messages, framing, limits, errno mapping |
| `dfs-core` | records, authorization (grants + boundaries), filesystem operations over `Store` |
| `dfs-server` | sessions, dispatch, admin |
| `dfs-mount` | FUSE daemon (`fuser` 0.18): TTL cache, overlay of own mutations, commit log |

The server is stateless apart from a read-version cache and an epoch-tagged authorization cache; no
correctness depends on server memory, and any number of servers can serve a tenant.

## Records (tenant prefix applied by the adapter)

| key | value |
| --- | --- |
| `n/<id>` | node: parent, name, kind, mode, size, mtime, ctime, content rev, symlink target, detached |
| `e/<dir>/<name>` | child id + kind |
| `t/<dir>` | directory mtime ns, updated with atomic `MAX` (never read in mutations) |
| `b/<id>/<idx>` | 64 KiB content block (last one short) |
| `p/<id>` | explicit policy: grants + boundary flag |
| `g/<group>`, `u/<principal>\0<group>` | group membership and its per-principal index |
| `k/<token-hash>` | principal + tenant-admin flag |
| `s/<session>` | session principal |
| `r/<session>/<seq>` | mutation receipt (exactly-once on `commit_unknown_result`) |
| `a/<chunk>` | principal that owns id chunk `chunk` (client-allocated ids) |
| `j/i/<id>` | index obligation |
| `m/topo` | authorization epoch (policy, membership, token, cross-parent directory move) |
| `m/next-id` | id-chunk allocator |

## Server

* **`Apply { ops }`** runs up to 4096 ops in one transaction, in order (`apply-batch`). Each op is
  validated before it writes; a failing op reports its own errno and leaves no effect, later ops
  still apply. Ops: `Create` (client-chosen id from a chunk the principal owns, `EPERM` otherwise),
  `Write` (≤ 128 distinct blocks, size and blocks in the same op), `SetAttr`, `Remove` (requires the
  entry to still name the expected id; detaches, never deletes), `Rename` (cycle and replacement
  checks). Writes and setattrs apply to detached nodes, so a file unlinked while open keeps
  accepting its writes.
* Mutations may start from a reused read version only because every outcome-affecting read is
  conflict-tracked and results are returned only after commit (`read-version-reuse`).
* Reads (`Lookup`, `GetAttr`, `ReadDir`, `Read`, `ReadFiles`, `ReadLink`) take a fresh read version
  and return it; `ReadDir` continuation pages read at the first page's version.
* Authorization: write-stop boundaries (`write-stop-boundaries`), cached per `m/topo` epoch
  (`auth-cache-epoch`), acting principal only from the session (`session-principal`).

## Mount

**Cache.** Attributes, names (positive and negative), listings and symlink targets are cached with
the send time of the request that fetched them and the read version of its reply; they are served
until the TTL lapses. Content is cached by `(id, rev)` (256 MiB) and served only under a live
attribute of that rev. A reply read below the version at which one of this mount's own ops on that
object committed is not installed (`own-commit-floor`); lookups retry up to 3 times, then serve
uncached.

**Lookup miss = whole listing.** A miss in a directory fetches its whole listing (up to 4096
entries; the first page is capped there) with every child's attributes, so one RPC answers every
lookup in the directory for the TTL. A directory known to be larger falls back to per-name lookups.
This took open+fstat+close (10k files) from 20.1 s to 2.0 s and read+SHA from 43.6 s to 2.2 s.

**Overlay.** Every mutation is acknowledged locally: a `Local` per touched object (attributes, the
whole content image for files, symlink target) and a pending name per `(dir, name)`; reads in this
mount see them at once. A file opened for writing without `O_TRUNC` is materialized whole first. A
`Local` with nothing pending is dropped (re-fetched on demand) once its TTL lapses, so an idle open
writer does not freeze other mounts' updates out of view.

**Log and committer.** Mutations become ops in an ordered log. A `SetAttr` folds into the latest
queued op on the same object; a sealed `Write` merges into the latest queued `Write` while it stays
under the block limit. One committer sends one `Apply` at a time (`ordered-commit`), up to 512 ops
/ 2 MiB, sealing every dirty file into the batch it forms. On success it installs the returned
attributes and names at the commit version, raises the floor, and drops the overlay entries the
batch carried. On failure (another mount won a race) it invalidates what the ops touched, counts
them as dropped, logs each, and reports the first failure at the next directory fsync.

**Admission.** A new mutation waits while the queue is full (512 ops), the queued plus dirty bytes
exceed 2 MiB, or the oldest unsent op is older than `window / 2` — this is what keeps every commit
inside the window. Measured: 0 missed windows in every run, worst commit lag 42 ms against a 250 ms
window.

**Inline-or-defer (`serve-inline-or-defer`).** The kernel round-robins requests across idle FUSE
threads; with 8 threads every request paid a cross-CPU wakeup (36 µs per cached stat vs 5 µs on one
thread, 10× on deep paths). The mount reads requests on **one** FUSE thread and serves anything it
can answer from memory inline. A request that reaches a blocking point (an RPC, an admission wait,
a wait on another thread's fetch, a drain) before changing anything returns its reply object and is
rerun on a blocking pool, so a slow request never stalls the others (checked: a 128 MiB uncached
read in one client leaves another client's cached stats under 2 ms). A mutation passes admission
before its first change; from then on it waits in place instead of deferring. `flush`, `fsync` and
`release` never block and always run inline, in kernel order.

**Permissions.** No `default_permissions` (the kernel would check bits it may not cache): the mount
checks `writable` and mode bits itself (`local-permissions`); the server re-checks grants at commit.

**Durability and crashes.** Unmount drains. A killed mount loses what it had acknowledged but not
committed; durable storage stays object-consistent (crash test: every file complete, a prefix, or
absent; `fsck` clean).

## Disclosures

* fsync is buffered; directory fsync is the barrier (fuser has no `FUSE_SYNCFS`, so `syncfs(2)` is a
  no-op and the harness fsyncs the mount root).
* Revocation is time-bounded by `MAX_EVENTUAL_CONSISTENCY_DELAY`, not immediate.
* A concurrent conflicting mutation is acknowledged locally and dropped at commit if another mount
  won; this mount masks the other's name for at most the window. Dropped ops are logged and
  counted; directory fsync reports them.
* Any local uid acts as the session principal (mode bits are honoured for non-root callers).
* No reconnect: on a lost connection pending ops fail (`EIO` at the barrier, counted as dropped).
* Opening an existing file for writing without `O_TRUNC` reads it whole first.
* A `read(2)` the kernel splits into several FUSE reads may span two revisions of a file being
  rewritten elsewhere; each FUSE read returns bytes of one revision.
* `MAP_PRIVATE` mmap goes through the page cache (direct I/O); shared writable mmap is refused.
* Search indexing, hard links, xattrs, locks, TLS: out of scope.
* In-place 64 KiB block map instead of an immutable chunk tree.

## Code contracts

Directory (`CONTRACTS`): `tenant-and-principal-from-session`, `store-trait-boundary`.
Declarations: `write-stop-boundaries`, `read-version-reuse`, `auth-cache-epoch`, `fresh-reads`,
`apply-batch`, `session-principal`, `ordered-commit`, `own-commit-floor`, `ttl-at-serve`,
`local-permissions`, `serve-inline-or-defer`.

## Checks (`local/`)

| script | checks |
| --- | --- |
| `smoke.bash` | end-to-end ops; unmount with 0 dropped ops; remount and verify content, listing; `fsck` |
| `visibility.py` | two mounts; for create, overwrite, append, truncate, chmod, utime, rename, unlink, mkdir, rmdir and read revocation, no poll starting later than ack + MAX sees the old state, and every read returns a whole written state |
| `crash.py` | SIGKILL the mount mid-untar; every file complete, a prefix, or absent; `fsck` clean |
| `stall.py` | cached requests are not delayed by another client's slow uncached reads |
| `bigdir.py` | lookup hits and misses in a directory above and below the listing cap |
| `profile.py` | per-phase op/RPC counts for the open+fstat and read workloads |

All pass at 1 s and 8 s (visibility worst case 646 ms at 1 s, 6.7 s at 8 s).

## Benchmark protocol

Our adapter of Spolu's `vfs.py` / `untar.py`: same corpus and manifest hash, jd's workloads
unchanged, same `tar --no-same-owner` command, new server + mount before every `first` row. One
machine (OrbStack, 12 vCPU, Linux 7.0), FDB 7.3 `single ssd` with **FDB's default commit knobs**.

Two Spolu references:

* **Spolu pinned** — his v2 `90f9932` run by us on this machine against the same FDB settings
  (`bench/results/spolu-vfs-native.log`). Like for like.
* **Spolu latest** — his own `RESULTS.md` run (revision `2717953273`), on FDB tuned with four of
  his five knobs (commit batch intervals, server and client busy-wait). Same machine class, faster
  FDB settings than ours.

Both use kernel caching (attribute/entry TTLs, page cache, writeback); we use none.

## Results (2026-10-05)

10k-file untar (then drain): **1.96 s at 1 s, 1.89 s at 8 s**, vs Spolu pinned 65.6 s and Spolu
latest 37.2 s. Deep-grant untar (1000 files): 0.157 s / 0.147 s (first build of this design: 1.73 s;
lease design: 11.27 s).

jd's rows, ms, `first / warm`:

| row | ours, 1 s | ours, 8 s | Spolu pinned | Spolu latest |
| --- | ---: | ---: | ---: | ---: |
| scandir + stat | 683 / 307 | 712 / 348 | 9,267 / 2,383 | 1,708 / 132 |
| rg --files | 123 / 7.7 | 251 / 7.6 | 639 / 5.1 | 264 / 6.0 |
| open + fstat + close | 619 / 232 | 688 / 216 | 34,487 / 776 | 6,053 / 852 |
| stat missing | 319 / 8.4 | 365 / 9.0 | 644 / 4.5 | 184 / 1.8 |
| rg no-match | 659 / 496 | 685 / 324 | 7,412 / 58 | 5,426 / 189 |
| rg rare | 1,399 / 421 | 888 / 334 | 6,245 / 51 | 5,363 / 190 |
| rg branch glob | 345 / 153 | 450 / 149 | 1,170 / 12 | 768 / 31 |
| rg depth-10 | 89 / 40 | 87 / 48 | 263 / 4.4 | 129 / 6.9 |
| open + read + SHA-256 | 1,840 / 833 | 1,794 / 403 | 47,275 / 11,481 | 12,313 / 1,212 |
| open + pread tail | 825 / 109 | 778 / 8.5 | 1,379 / 7.3 | 359 / 16 |
| create + write / fsync / close / unlink | 1.6 / 0.06 / 0.12 / 0.44 | 1.4 / 0.08 / 0.13 / 0.34 | 211 / 562 / 0.78 / 268 | 59 / 19 / 0.69 / 35 |

Reading the table:

* Against Spolu pinned (same FDB), we win every `first` row and every write row; we lose the
  `warm` rows that his kernel page cache and dentry cache serve without a FUSE round trip (rg scans,
  globs, stat missing, pread).
* Against Spolu latest (tuned FDB), we win every `first` row except `stat missing` and `pread`
  (sparse lookups: one listing fetch per directory costs more than his per-name lookup on tuned
  FDB), and lose most `warm` rows for the same kernel-cache reason.
* Warm rows are bounded by FUSE round trips: every path component is a `LOOKUP` (TTL 0), every read
  a FUSE `READ` (direct I/O). At ≈ 3–5 µs per request on one thread, rg's warm scans cost
  ≈ 10 requests per file.
* At 8 s the TTL outlives a whole warm pass, so warm rows that re-fetch at 1 s (read+SHA, pread)
  drop to pure FUSE cost.

## History

* Lease design (v1): durable create/close, server-pushed invalidations, kernel caching under
  leases. Untar 103.7 s (strict) — two durable commits per file was the floor.
* 2026-10-05: contract changed to bounded staleness without kernel caching; this design.
