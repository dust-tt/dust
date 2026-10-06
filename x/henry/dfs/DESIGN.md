# dfs (henry): design and tradeoffs

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

* `fsync(2)` is **durable**; other writes and metadata changes stay buffered. `fsync` of a file or a
  directory is the drain barrier: it returns once every mutation this mount acknowledged before it
  (the file's own changes included) has committed, and reports the first failure since the previous
  barrier.
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
until the TTL lapses. Content is cached by `(id, rev)` in one 256 MiB memory budget, whole for
files up to 1 MiB and by 64 KiB block for larger ones, and served only under a live attribute of
that rev (`content-under-live-rev`). So bytes outlive the TTL but are revalidated by a fresh
attribute, never served stale. A range-read miss fetches 16 blocks (1 MiB) from the first block
it needs; a range read whose attribute expired fetches the attribute first. A reply read below the version at which one of this mount's own ops on that
object committed is not installed (`own-commit-floor`); lookups retry up to 3 times, then serve
uncached.

**Lookup miss = whole listing.** A miss in a directory fetches its whole listing (up to 4096
entries; the first page is capped there) with every child's attributes, so one RPC answers every
lookup in the directory for the TTL. A directory known to be larger falls back to per-name lookups.
This took open+fstat+close (10k files) from 20.1 s to 2.0 s and read+SHA from 43.6 s to 2.2 s.

**Overlay.** Every mutation is acknowledged locally: a `Local` per touched object (attributes,
symlink target, and for files the content changes not yet committed, one layer per op plus the
unsealed ones) and a pending name per `(dir, name)`; reads in this mount see them at once. Opening a
file for writing reads none of it. A read of a file with uncommitted changes fetches only the bytes
the changes do not cover (none for an append read back or an unborn file), at or above the file's
floor, and applies the changes in order (`overlay-over-fresh-base`). A layer is dropped when its op
commits, so committed bytes come from the server and stop shadowing other mounts' writes. Appending
a line to a 256 MiB file after its cache expired went from 3.07 s to 3.2 ms (peak mount RSS 353 to
32 MiB; `bench/append.py`). A `Local` with nothing pending is dropped (re-fetched on demand) once
its TTL lapses, so an idle open writer does not freeze other mounts' updates out of view. A `Local`
built from cached data keeps that data's request time, so promoting it does not extend its life
(`local-keeps-freshness`). A read that returns a newer revision than the cached attribute drops that
attribute, so `stat` does not keep reporting the old size.

**Log and committer.** Mutations become ops in an ordered log. A `SetAttr` folds into the latest
queued op on the same object; a sealed `Write` merges into the latest queued `Write` while it stays
under the block limit. One committer sends one `Apply` at a time (`ordered-commit`), up to 512 ops
/ 2 MiB, sealing every dirty file into the batch it forms. On success it installs the returned
attributes and names at the commit version, raises the floor, and drops the overlay entries the
batch carried. On failure (another mount won a race) it invalidates what the ops touched, counts
them as dropped, logs each, and reports the first failure at the next fsync.

**Admission (`admission-projects-apply`).** A new mutation waits while the queue is full (512 ops),
the queued plus dirty bytes exceed 2 MiB, or the oldest uncommitted op (the batch in flight
included) could not commit in time: its age plus one `Apply` (two while a batch is in flight)
exceeds the window, an `Apply` being assumed as slow as the slowest of the last 8 (and the one in
flight so far). A slow server therefore slows writers instead of stretching visibility. Only an
`Apply` far slower than the recent ones can still land late; such a commit is counted as a missed
window, and the benchmark harness rejects any run with one. The previous rule (wait once the
oldest op is `window / 2` old) missed 828 windows in a `git clone`, whose reads slowed `Apply` to
218 ms. Measured: 0 missed windows in every run, worst commit lag
58 ms at 1 s (250 ms window), 53 ms at 8 s.

**Inline-or-defer (`serve-inline-or-defer`).** The kernel round-robins requests across idle FUSE
threads; with 8 threads every request paid a cross-CPU wakeup (36 µs per cached stat vs 5 µs on one
thread, 10× on deep paths). The mount reads requests on **one** FUSE thread and serves anything it
can answer from memory inline. A request that reaches a blocking point (an RPC, an admission wait,
a wait on another thread's fetch, a drain) before changing anything returns its reply object and is
rerun on a blocking pool, so a slow request never stalls the others (checked: a 128 MiB uncached
read in one client leaves another client's cached stats under 2 ms). A mutation passes admission
before its first change; from then on it waits in place instead of deferring. `flush` and `release`
never block and always run inline, in kernel order.

**Permissions.** No `default_permissions` (the kernel would check bits it may not cache): the mount
checks `writable` and mode bits itself (`local-permissions`); the server re-checks grants at commit.

**Durability and crashes.** Unmount drains. A killed mount loses what it had acknowledged but not
committed; durable storage stays object-consistent (crash test: every file complete, a prefix, or
absent; `fsck` clean).

## Disclosures

* Writes and metadata changes are buffered; fsync (file or directory) is the durability barrier
  (fuser has no `FUSE_SYNCFS`, so `syncfs(2)` is a no-op and the harness fsyncs the mount root).
* A failed op is reported by the next fsync of any object on the mount, not only its own.
* Revocation is time-bounded by `MAX_EVENTUAL_CONSISTENCY_DELAY`, not immediate.
* A concurrent conflicting mutation is acknowledged locally and dropped at commit if another mount
  won; this mount masks the other's name for at most the window. Dropped ops are logged and
  counted; the next fsync reports them.
* Any local uid acts as the session principal (mode bits are honoured for non-root callers).
* No reconnect: on a lost connection pending ops fail (`EIO` at the barrier, counted as dropped).
* A file's size in a mount with uncommitted changes to it comes from that mount's own view, so two
  mounts writing one file at once may each report their own size until they go quiet.
* Reading a file back while it still has uncommitted changes costs a `Read` per uncovered range.
* A `read(2)` the kernel splits into several FUSE reads may span two revisions of a file being
  rewritten elsewhere; each FUSE read returns bytes of one revision.
* `MAP_PRIVATE` mmap goes through the page cache (the kernel's direct-I/O path); shared mmap is
  refused. The kernel drops the file's page cache on every `open` and every `mmap` (no
  `FOPEN_KEEP_CACHE`), so a mapping only ever holds pages faulted after the latest of them; POSIX
  leaves it unspecified whether a private mapping sees later changes to the file.
* Search indexing, hard links, xattrs, locks, TLS: out of scope.
* In-place 64 KiB block map instead of an immutable chunk tree.

## Code contracts

Directory (`CONTRACTS`): `tenant-and-principal-from-session`, `store-trait-boundary`.
Declarations: `write-stop-boundaries`, `read-version-reuse`, `auth-cache-epoch`, `fresh-reads`,
`apply-batch`, `session-principal`, `ordered-commit`, `own-commit-floor`, `ttl-at-serve`,
`local-permissions`, `serve-inline-or-defer`, `local-keeps-freshness`, `overlay-over-fresh-base`,
`content-under-live-rev`, `admission-projects-apply`.

## Checks (`local/`)

| script | checks |
| --- | --- |
| `smoke.bash` | end-to-end ops; unmount with 0 dropped ops; remount and verify content, listing; `fsck` |
| `visibility.py` | two mounts; for create, overwrite, append, truncate, chmod, utime, rename, unlink, mkdir, rmdir, a directory handle held open and rewound, a file opened for writing just before its cache expires, a 4 KiB overwrite in the middle of a 2 MiB file read by range, and read revocation, no poll starting later than ack + MAX sees the old state, and every read returns a whole written state |
| `crash.py` | SIGKILL the mount mid-untar; every file complete, a prefix, or absent; `fsck` clean |
| `stall.py` | cached requests are not delayed by another client's slow uncached reads |
| `bigdir.py` | lookup hits and misses in a directory above and below the listing cap |
| `profile.py` | per-phase op/RPC counts for the open+fstat and read workloads |

All pass at 1 s and 8 s.

## Benchmark protocol

Our adapter of Spolu's `vfs.py` / `untar.py`: same corpus and manifest hash, jd's workloads
unchanged, same `tar --no-same-owner` command, new server + mount before every `first` row. One
machine (OrbStack, 12 vCPU, Linux 7.0), FDB 7.3 `single ssd` with **FDB's default commit knobs**.

References:

* **Spolu pinned**: his v2 `90f9932` run by us on this machine against the same FDB settings
  (`bench/results/spolu-vfs-native.log`). Same FDB settings. Our untar time excludes the final
  drain, as his harness does; the drain is recorded separately (≈ 20–30 ms).
* **Native**: jd's script run directly on the corpus on this machine's local disk
  (`bench/results/native/`).
* **Spolu latest**: his own `RESULTS.md` run (revision `2717953273`), on FDB tuned with four of
  his five knobs (commit batch intervals, server and client busy-wait). Same machine class, faster
  FDB settings than ours.

## Results (2026-10-06)

10k-file untar (then drain): **2.31 s at 1 s, 2.02 s at 8 s** (an A/B of three runs each, before
and after the sparse overlay, spans 2.19 to 2.48 s), vs Spolu pinned 65.6 s and Spolu latest 37.2 s.
Native tar of the same archive on this machine: 0.23 s. Deep-grant untar (1000 files): 0.160 s /
0.173 s (first build of this design: 1.73 s; lease design: 11.27 s).

`git clone https://github.com/dust-tt/dust` (1.03 GB pack, ~15.3k files; network included) then
`git status` twice (`bench/git.py`), three runs per budget, each with its own native clone (six
native samples); median [min to max]. Validated after a server restart: clean status and every
tracked file re-hashed through the mount equal to its blob at HEAD.

| | native | ours, 1 s | ours, 8 s |
| --- | ---: | ---: | ---: |
| clone | 42.9 s [41.4 to 43.5] | 70.4 s [65.5 to 70.6] | 69.2 s [68.7 to 78.1] |
| status, first | 0.26 s [0.12 to 0.49] | 10.1 s [8.5 to 11.3] | 2.3 s [1.8 to 9.8] |
| status, repeated | 0.17 s [0.02 to 0.33] | 6.6 s [6.0 to 7.3] | 1.9 s [1.0 to 7.2] |
| status after remount | | 6.3 s [6.2 to 6.4] | 1.6 s [1.5 to 2.4] |

0 missed windows and 0 dropped ops in every run; worst commit lag 193 ms at 1 s, 180 ms at 8 s.
At 8 s a status costs 1 to 2 s when the directory listings are still cached and about 7 to 10 s when
they expired (2.5k listing fetches, one per directory, one at a time).

Before the block cache and the projected admission: clone 496 s at 1 s (727k `Read` calls from
`index-pack`, 828 missed windows); after: 8.9k `Read` calls, 0 missed windows, worst lag 164 ms.
`status` refetches one listing per directory (2.5k) once the TTL has lapsed.

Spolu's own corpus (10k files, 662 MiB, `bench/archive.py`, before the block cache): `tar -xzf`
6.1 s at 1 s and 6.4 s at 8 s vs 3.9 s native; uncompressed `tar -xf` 7.1 s / 5.9 s vs 0.8 to
2.0 s native.

jd's rows, ms, `first / warm`. Native is jd's script on the VM's local disk, with the corpus
already in the page cache, so its `first` is not cold:

| row | native | ours, 1 s | ours, 8 s | Spolu pinned | Spolu latest |
| --- | ---: | ---: | ---: | ---: | ---: |
| scandir + stat | 168 / 150 | 665 / 316 | 914 / 302 | 9,267 / 2,383 | 1,708 / 132 |
| rg --files | 5.2 / 5.1 | 144 / 7.5 | 246 / 7.5 | 639 / 5.1 | 264 / 6.0 |
| open + fstat + close | 54 / 50 | 639 / 233 | 606 / 223 | 34,487 / 776 | 6,053 / 852 |
| stat missing | 4.3 / 2.1 | 338 / 9.7 | 331 / 8.4 | 644 / 4.5 | 184 / 1.8 |
| rg no-match | 45 / 35 | 826 / 415 | 863 / 395 | 7,412 / 58 | 5,426 / 189 |
| rg rare | 17 / 14 | 1,277 / 424 | 1,356 / 331 | 6,245 / 51 | 5,363 / 190 |
| rg branch glob | 8.4 / 7.8 | 469 / 153 | 394 / 150 | 1,170 / 12 | 768 / 31 |
| rg depth-10 | 5.5 / 3.9 | 92 / 42 | 87 / 41 | 263 / 4.4 | 129 / 6.9 |
| open + read + SHA-256 | 169 / 165 | 1,846 / 751 | 2,092 / 459 | 47,275 / 11,481 | 12,313 / 1,212 |
| open + pread tail | 1.9 / 1.4 | 908 / 177 | 910 / 9.7 | 1,379 / 7.3 | 359 / 16 |
| create + write / fsync / close / unlink | 1.8 / 54 / 0.06 / 0.32 | 6.2 / 11 / 0.18 / 0.42 | 2.4 / 22 / 0.28 / 0.56 | 211 / 562 / 0.78 / 268 | 59 / 19 / 0.69 / 35 |

Warm rows at 1 s vary between runs (pread warm: 42 ms in the previous run, 177 ms here) because
the `first` pass takes longer than the TTL, so whether the warm pass re-fetches depends on timing.

fsync is durable: the first of the 32 drains the mount's log (one `Apply`), the rest find nothing
left to commit.

Reading the table:

* Against Spolu pinned (same FDB), we win every `first` row and every write row, and lose the `warm`
  rg scans, globs, stat missing and pread.
* Against Spolu latest (tuned FDB), we win every `first` row except `stat missing` and `pread`, and
  lose most `warm` rows; fsync is about even (21 vs 19 ms). Sparse first-touch lookups pay one listing fetch per directory.
* Warm rows are bounded by FUSE round trips: every path component is a `LOOKUP` (TTL 0), every read
  a FUSE `READ` (direct I/O). At ≈ 3–5 µs per request on one thread, rg's warm scans cost
  ≈ 10 requests per file.
* At 8 s the TTL outlives a whole warm pass, so warm rows that re-fetch at 1 s (read+SHA, pread)
  drop to pure FUSE cost.

## History

* Lease design (v1): durable create/close, server-pushed invalidations, kernel caching under
  leases. Untar 103.7 s (strict); two durable commits per file was the floor.
* 2026-10-05: contract changed to bounded staleness without kernel caching; this design.
