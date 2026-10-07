# v5 implementation and measurements

## Search and durable tree warmup

- [x] Add generic gRPC Search for files and directories, with name/content selection, typed filters,
      subtree scope and bounded top-k results. Do not add GetIndexStatus.
- [x] Persist coalesced indexing obligations atomically in FDB; implement resumable ES indexing and
      backfill, conditional publication, revision validation, and shared RAM/FDB authorization.
- [x] Verify real ES/FDB behavior for directories, scope, moves without descendant reindexing,
      revocation, stale content, deletion, tenant isolation, retries, and index rebuilds.
- [x] Benchmark search locally and on GCP and check filesystem performance for regressions.
- [ ] Populate two persistent GCP tenants with 1M and 10M files, plus realistic directory
      depth and grants. Preserve existing fixture data and record actual counts and storage usage.
- [ ] Measure permission-tree bootstrap from those FDB tenants with empty server memory, recording
      wall time, FDB work, final tree size, process RSS and peak memory. Synthetic builder timing is
      not evidence for this requirement. Verify authorization after every bootstrap.
- [ ] Document reproducible commands, raw report locations, identities and limitations.

The user cancelled the 100M benchmark for now. The current goal covers only 1M and 10M population,
warmup and persistent serving. No 100M population was started. Older synthetic 100M results remain
historical evidence; they are not an FDB bootstrap measurement.

Search is implemented and passes real ES/FDB checks locally and on GCP. Local runs now cover
failed ES bulk publication, superseded queue completion and index deletion/rebuild races. Publication
uses a unique alias per ES incarnation with `require_alias=true`; this prevents late bulk requests
from recreating an unmapped index. The derived schema is now `dfs-v5-es-2`. The API has no status RPC.
[Measurements](bench/SEARCH.md) retain raw local/GCP search and full filesystem results. The
completed local/GCP Search run `f` has matching source identity and includes both publication
and safe pre-commit FDB retry fixes.

The first durable GCP population contains 1,000,000 files + 10,000 directories + root. A new
process bootstrapped its 1,010,001 permission nodes from FDB in 15.688 s, with 86.85 MiB tree accounting,
101.23 MiB final RSS and 118.19 MiB peak RSS. Exact count and sampled owner/empty-grant checks passed.
This is an actual FDB-to-RAM measurement, not the earlier synthetic builder test. Raw reports are
under `/var/log/dfs-bench/v5/scale-20261007-a`; FDB/OS caches were retained.

The 10M loader hit an FDB read timeout after earlier `process_behind` failures exposed missing read
retries. Typed pre-commit errors now use fresh-snapshot bounded retries; unknown commits remain
non-replayable. Tests verify that writes from a failed preparation disappear and the retry commits
once. The loader's durable 16-way partitioning is separate from its new eight-transaction concurrency
limit, allowing safe resumption with less backend pressure. The updated runtime passed GCP
tests/clippy/mounted and Search checks. Report `scale-20261007-b` repeated the 1M warmup in 17.537 s.
Its 10M loader was deliberately stopped after 2.1M inserted files when stronger public-RPC validation
found a fixture-only child-index encoding bug: it wrote tagged 17-byte references, while lookup/list
require raw 16-byte UUIDs. Normal filesystem creation already uses the correct representation.
The loader is fixed and now verifies actual lookup and root listing before reporting success.
Its offline repair checks the original manifest and exact deterministic key/value, changes only the
legacy encoding, and accepts already-correct rows without rewriting them. The local 10,100-row repair
and repeat passed; real gRPC checks passed on repaired and newly seeded tenants for file bytes,
namespace links, metadata, inherited/explicit grants, empty grants and cross-tenant isolation.
Runtime h passed the GCP full filesystem benchmark and repaired all 1,010,000 existing 1M child rows
and 2,286,240 partial-10M child rows. Second repair scans changed zero rows. Report `scale-20261007-c`
then verified the repaired 1M tree: 15.759 s bootstrap, 86.85 MiB accounted, 99.01 MiB final RSS and
116.34 MiB peak RSS, with exactly 1,010,001 nodes and all 748 permission samples passing.
The 10M loader added another 200K files before exhausting its bounded retries on FDB process_behind.
The driver now resumes only terminal typed 1031/1037 failures from atomic cursors, lowers concurrency
and waits 30–60 seconds, with an eight-attempt bound and retained failure logs. Other failures stop.
The replacement `dfs-v5-resume-20261007-i` unit resumes only 1M/10M in report `scale-20261007-c` and
retains the measured Rust binaries. Do not replace binaries while this job is running.
The 10M fixture, its actual warmup, and live persistent service verification remain unfinished.
GCP filesystem run `f` stopped at drain with one expired client dependency. The client now excludes
actual prerequisite RPC intervals from its 200 ms buffering clock, counting overlaps once and
retaining queued/local time. A 350 ms stalled-prerequisite test, the full local suite, strict clippy
and mounted checks pass. Local full filesystem run `g` passed all 24 checks, content hashes and cleanup: 5.789 s untar,
zero drain and zero dispatch expirations. GCP runtime h passed all 24 checks, hash passes and cleanup:
15.779 s untar, 25 ms drain, zero dispatch expirations and 360.52 MiB peak accounted client memory.
Search and filesystem tables retain the measured performance caveats; no blanket absence of slowdown
is claimed under background indexing.
The earlier follow-up unit `dfs-v5-finalize-20261007-g` was stopped with the old loader. Runtime h
includes the client correction. Its state and logs are under `/var/log/dfs-bench/v5/finalize-20261007-h`.
After both selected populations and measured warmups pass, the resume unit starts the persistent
server and runs `gcp/verify_scale.py` against the real API. Starting a unit is not completion evidence.
`gcp/serve_scale.py` prepares the service only after the selected measurements pass and keeps credentials
in private files. The workload VM and existing FDB configuration are unchanged.

Objective: implement every behavior in [DESIGN.md](DESIGN.md), validate with real FoundationDB and
mounted FUSE, run the untar and full jd benchmark locally and on the existing dust-dev fixture,
and record comparable result tables with source/binary identities and configuration.

This checklist records implementation progress, not a reduced definition of completion. Copied v4
code is a starting point only; its old behavior must be replaced before v5 is considered ready.

- [x] Inspect v4 runtime, contracts, benchmark harness and existing local/GCP fixture instructions.
- [x] Establish an isolated v5 workspace from the tested v4 implementation; preserve v4.
- [x] Dense UUIDv4 types throughout retained client/server state, protobuf and FDB values/keys.
- [x] Small attributes, separate metadata, batch Stat and mixed Validate, ReadFiles, version fencing;
      remove unary mutations/server Fsync from the v5 wire API.
- [x] Small filesystem core with transactional KV abstraction and deterministic in-memory adapter;
      remove ancestry hints, collision prefetch and per-primary scheduling.
- [x] Atomic directory time/counter bookkeeping including child-attribute listing invalidation.
- [x] Durable grant interning, coalesced versionstamped TreeUpdateLog, tombstones and bounded GC.
- [x] Complete dense tenant RAM tree, atomic poll publication, scalable bootstrap/reconciliation,
      freshness/fallback, active-tenant lifecycle and shared search candidate filtering.
- [x] FUSE inline fast path with bounded deferral before side effects and mount-side mode checks.
- [x] Directory-wide attribute fetching/validation, sibling content fetching and adaptive read-ahead.
- [x] Enforce the shared 512 MiB accounted cap, including read cache and transient buffers, and
      combined 200 ms write-buffer / 800 ms send-time cache budget.
- [x] Preserve object fsync, dependency ordering, sparse writeback, unknown-outcome handling and
      revision/namespace race protection; add focused regression coverage for new semantics.
- [x] Format, contract checks, Rust tests/clippy, real-FDB and mounted correctness checks pass.
- [x] Local untar + full benchmark, durable drain, 24 timed checks and content verification;
      [result table](bench/RESULTS.md).
- [x] After the first local benchmark is complete, email the user its results table,
      untar time, durable-drain time and general run information (hardware/topology, configuration,
      corpus, source/binary identity and validation outcome). Sent to `spolu@dust.tt` on 2026-10-07
      after recipient confirmation; Gmail message `1a114f386c1a9a0e`. The HTML body is retained at
      `/tmp/dfs-v5-local-benchmark-email.html`.
- [x] Verify dust-dev workload identity, deploy only isolated v5 sources/builds, validate, benchmark
      sequentially, restore prior interactive services, record topology and [table](gcp/RESULTS.md).
- [x] After the GCP benchmark is complete, send a separate email to the same confirmed
      recipient with its results table, untar time, durable-drain time and the same run information,
      including the dust-dev node topology and comparison with the local results. These two emails
      are explicitly authorized by the user; no further send approval is needed after each run.
      Sent on 2026-10-07; Gmail message `1a114fe641d62da9`.
- [ ] Audit implementation/design and every required result before marking the goal complete.

Runtime artifacts, credentials and generated corpora stay outside Git. Do not reconfigure existing
GCP FDB or provision/delete cloud resources. No builds/tests overlap timed workloads.

## Current checkpoint

The current v5 runtime compiles and passes unit tests, the real-FDB contract suite and unprivileged
mounted checks. The retained/transient memory audit is recorded in [MEMORY.md](MEMORY.md); scratch
admission and peak metrics are implemented. Release mounted validation and the full local benchmark
passed on 2026-10-07: all 24 timed checks, both content hash passes and cleanup. After the cleanup
fix, untar took 6.402 s with 0.014 s remaining durable drain. Peak accounted memory was 362.75 MiB; peak RSS was 218.75 MiB.
The [report](bench/RESULTS.md) records the table, comparison, source/binary hashes and configuration.
The first failed untar led to bounded per-object commit fences, with a conservative fallback floor
when records are discarded. Related/unrelated commit and eviction regressions pass.
The original v5 source passed GCP tests, clippy, release mounted checks and the full benchmark: 24 timed
checks, both content hash passes and cleanup. Untar took 14.660 s plus 0.088 s durable drain.
Peak accounted client memory was 360.54 MiB; peak RSS was 221.00 MiB. The [GCP report](gcp/RESULTS.md)
records topology, hashes and comparison. FDB remained healthy with unchanged configuration, and
interactive services returned to their exact prior active states. Both results emails were sent.
The final audit is checking the design's additional scale and workload validation requirements.
The [synthetic permission-tree measurements](bench/SCALE.md) completed all six 1M/10M/100M cases,
including the later distributed-path access benchmark. At 100M objects the tree accounts for
6.37–6.38 GiB; checked authorization averages 1.20–1.88 µs on one thread at depths 8/64, excluding
FDB/RPC. All six runs completed and restored interactive services.
The supplemental GCP run `extended-20261007-a` completed its timed Git, 5,000-entry directory,
sparse-file and two-client shared-parent cases, but failed recursive cleanup of the large directory
with `ENOTEMPTY` and deferred `Unavailable` writeback errors. It is not a passing validation run.
Creating the 5,000 empty files took 394.679 s; listing and statting them from the other client took
0.838 s. The [cleanup investigation](bench/CLEANUP.md) identified dispatch pauses and admission that
allowed accepted edits to expire behind saturated RPC capacity. The safety fix passed focused 5,000-file
cleanup tests both locally and on GCP. Its first local rerun exposed a 22.149 s untar regression from
idle coalescing while all envelope reservations were occupied. Bypassing coalescing under capacity
pressure restored untar to 6.416 s including drain, with all 24 checks passing. That exact build then
passed both 5,000-file removal methods again (24.340 s / 24.333 s, zero deferred errors). The warm
no-match scan's slower sample did not reproduce in a focused repeat; both samples are retained in
the local report. The final scheduling change has not had a full GCP benchmark rerun.
Reports and logs for the original failure remain at
`/var/log/dfs-bench/v5/extended-20261007-a` on the workload VM. The driver exited with code 1 and
restored every pre-existing interactive service state, with no restoration errors.

Implemented:

- One FUSE receiving thread serves warm reads and admitted local edits synchronously, outside Tokio.
  Misses defer before effects to at most eight workers / 64 running and queued callbacks. Captures
  reserve shared memory. A probe that unexpectedly waits after accepting an edit fails without
  replay; test metrics require zero such cases. Handle guards never span RPC waits. Directory
  callbacks stage results before changing cookies or inode references, and cursor suffixes reuse
  cached pages. The mount enforces POSIX modes without kernel DefaultPermissions or allow_other.
- Cache, pending-object and inode indexes now release B-tree storage with their entries. Gate keys,
  weak slots and live users share reservations through their last reference. Payload accounting
  includes allocated vector/string capacities and sparse index nodes. Retirement queues deduplicate
  object IDs and shrink excess capacity. Directory overlays merge ordered entries directly, and
  owned RPC pages are sliced in place. The 96 MiB reserve now includes a 52 MiB scratch semaphore,
  36 MiB for four RPC decoders and 8 MiB fixed bookkeeping. Foreground operations/prefetch reserve
  6 MiB before polling; FUSE reserves staging/reply space through completion. Scratch pressure
  defers before effects. Metrics expose retained/accounted/scratch peaks; reports collect RSS too.
- Writeback admission waits for prerequisite progress before accepting a third dependent group;
  directory removal awaits its captured child edits before acceptance. Independent siblings no
  longer serialize on membership-only parent overlaps. Listing stabilization dispatches and awaits
  captured directory edits before retrying its snapshot, with dispatch enabled throughout. Parent
  attribute refresh pauses only primary edits, leaving independent child groups dispatchable.
  Queued and in-flight groups share 128 admission slots; every new group reserves an RPC envelope
  before acknowledgment, and batching releases redundant reservations. These changes
  preserve the 200 ms queue deadline through deep creation and repeated recursive dirty cleanup.
- Dense IDs are wired throughout protobuf, FDB records/values, caches, write queues and inode tables.
  `ObjectId` contains exactly 16 inline UUIDv4 bytes; `ObjectRef` adds a projection tag. Revisions are
  fixed 16-byte values. Proto2 required fields plus custom prost message types preserve inline Rust
  representations without changing gRPC. Human CLI JSON still formats IDs as text. The FDB format
  is `dfs-v5-fdb-6`, under the separate v5 prefix discriminator.
- The public service now exposes batch `Stat` (1–256), mixed `Validate` (1–256), `GetMetadata`,
  `Lookup`, `List` (1–4096 / 4 MiB), `Read`, `ReadFiles` (1–256 / 4 MiB), streamed `MutateBatch`, and
  administration. Unary filesystem mutations and server Fsync are gone from the wire. Local mutation
  conveniences submit one-group batches; `stat_one` submits a singleton Stat. The CLI uses batch Stat.
- Small `Attr` records replace the former full Object. MIME/xattrs have separate FDB records and
  client cache entries tied to a freshly authorized revision. Read replies include canonical Attr
  plus a read version/authority view; durable groups expose commit versions. Whole-file reads return
  explicit omitted IDs when the byte budget fills, preserving individual errors.
- Listings now have deduplicated atomic counters invalidated by membership and child attributes.
  Their FDB fallback proof combines the server incarnation with a tenant authorization epoch. This
  counter is read only by the authoritative read fallback and incremented by namespace/grant edits;
  the RAM path uses its coherent tree incarnation/generation. Virtual projections have no token.
  Membership time uses atomic byte MAX over signed-seconds/nanos in chronological order, with a
  separate atomic membership counter. Explicit directory metadata edits conflict-read complete
  fields, replace a base revision/time and clear the membership fields. Public revisions combine
  base and membership counter. Mutation replies omit membership-only parent attrs to keep sibling
  commits independent; clients invalidate those attrs without renewing TTLs or flushing siblings.
- Cached files use Validate after expiry; cached listings renew names/child attrs together. Ordinary
  lookup misses request a large listing first. Default pages have 4096 entries; a lower page-size
  option supports bounded pagination tests. Bounded commit records fence directory and returned-child
  versions without invalidation by unrelated retained commits. Evicting records advances a global
  fallback floor, preserving coherence even after individual cache entries disappear. The 4,096
  records reserve 2 MiB from the shared budget. Delayed related/unrelated commits and eviction are
  covered. Four concurrent large read RPCs bound transient response buffers.
- Sequential small-file misses now fetch the whole file with siblings from the cached directory
  page. Batches start at 16 files, grow on consumption to 256, skip siblings above 256 KiB, and fit
  the 4 MiB response envelope. Per-object gates deduplicate demand and prefetch; busy/dirty siblings
  are skipped. Two whole-file slots remain held through reply installation, inside the shared RPC
  limit. Returned attrs/blocks install together only under their pinned generation; content fills
  preserve existing metadata deadlines. Source/stream/window state and block payloads share the
  cache budget. Speculation uses spare capacity without evicting demand and leaves a 4 MiB reserve.
  Large-file windows grow from 64 KiB to 1 MiB with sequential reads and shrink on random access.
  Metrics report prefetched bytes, consumed block bytes, and bytes discarded without use.
- Dirty reads now subtract pending writes/truncations from base byte ranges before downloading.
  Fully overwritten bytes need no base read; partial ranges share their cached aligned blocks.
  Ordered edits preserve sparse holes and truncate/re-extend zeros under one expected base revision.
- Filesystem keys, metadata, reads, authorization fallback, edits and group preparation now live in
  `dfs-core`. Its transactional KV interface has an FDB server adapter and a deterministic memory
  adapter with snapshot, read-your-writes, phantom/conflict, rollback and atomic increment tests.
  The core shares protocol DTOs/error types but has no RPC dispatch or FDB dependency.
- `core::tree` has dense parent/grant/kind/child-count arrays, UUID-to-slot lookup, interned explicit
  grant sets, reclaimed slots, atomic validation/publication, freshness and batched authorization.
  Capacity growth and grant preparation finish under a read guard before taking the publication
  write guard; replaced buffers are released afterward. Per-replica conservative peak accounting
  covers staging and reallocations. Aggregate server reservations bound concurrently resident trees,
  bootstrap/staging peaks and tenant bookkeeping; in-flight authority readers retain reservations.
- Grants use a durable tenant-scoped bidirectional `u32` dictionary. Sessions resolve/intern their
  names once, including previously unattached names. Forward/reverse authority indexes are numeric;
  an administration-only name index preserves lexical `ListGrants` pagination. Allocation conflicts
  retry safely, IDs are never reused, and exhaustion fails without partially publishing a dictionary.
- Tree-changing edits atomically replace one versionstamped head and log row per object. Content
  edits and same-parent renames do not emit tree rows. Deletions retain indexed tombstones. The KV
  layer now supports versionstamped keys/values, byte maxima, signed counter deltas and fixed read
  versions; the memory adapter rejects reads of unresolved stamps and resolves them at commit.
- `server::tree_feed::Replica` bootstraps through short UUID-ordered base pages while merging a
  complete fixed-version feed interval between pages. Its private dense builder retains per-node
  stamps/tombstones, resolves placeholder parents and validates the graph in linear time. Polls
  hydrate grants at the same snapshot, check a fresh incarnation/floor fence and publish atomically.
  Empty polls renew age but preserve generation. Rebuilds get a new in-memory incarnation.
  Active sessions now attach replicas with bounded polling (250 ms), local-commit wakeups, idle
  eviction (60 s), 30 s maximum proof age, bounded workers and shared server admission. Configuration
  can disable RAM trees or lower aggregate/per-tenant budgets. Stale/incomplete/oversized trees use
  the complete FDB fallback while rebuilding. Each read or mutation group pins one generation;
  changed generation, unknown objects, parent mismatch or expiry discards the entire preparation
  before an FDB retry. Definite cached grant decisions may remain stale within the configured age.
  Same-group private creations remain writable under their already-authorized parent. The future
  search-candidate interface uses the same evaluator and needs no FDB reads with a warm tree.
- The server binary starts periodic GC over the durable tenant registry, including disconnected
  tenants. Monotonic-time/GRV samples enforce the initial one-hour retention; count/byte pressure can
  collect sooner while atomically advancing the resume floor. Defaults are 1,000,000 tombstones or
  512 MiB accounted bytes, with collection toward 90% capacity. Deletion admission tracks the count
  transactionally and applies hard backpressure. Independent deletions can conflict on this count;
  ordinary creates, moves without replacement and content edits avoid that guard. CLI flags expose
  retention, count/byte limits, collection cadence and bounded batch size.
- Server ancestry prefetch, collision prefetch and per-primary scheduling have been removed.
- Client defaults remain 512 MiB accounted memory, 800 ms send-time TTL, 200 ms maximum buffering,
  25 ms coalescing. Known-unsubmitted expired groups fail explicitly. Memory accounting now covers
  retained index capacities and bounded concurrent adapter/RPC/copy buffers; see MEMORY.md.

Validation commands (2026-10-07):

```sh
docker exec -w /dfs/v5 -e CARGO_TARGET_DIR=/target/v5 dfs-v4-dev-1 cargo test --workspace
docker exec -w /dfs/v5 -e CARGO_TARGET_DIR=/target/v5 dfs-v4-dev-1 cargo clippy --workspace --all-targets -- -D warnings
docker exec -w /dfs/v5 -e CARGO_TARGET_DIR=/target/v5 dfs-v4-dev-1 cargo build --workspace
docker exec -w /dfs/v5 dfs-v4-dev-1 runuser -u nobody -- env DFS_BINARY_DIR=/target/v5/debug python3 tests/mounted.py
cd v5 && cc-check format
```

The existing dev container mounts all DFS sources; separate target paths preserve v4 binaries.
Tests use unique FDB prefixes. Suites now include 10 client tests, 14 core/tree/KV tests, 5 FUSE tests,
6 protocol tests, one GC-clock test and the expanded real-FDB contract suite. The latter checks mixed validation
outcomes, authority/restart invalidation, API limits, metadata separation, large listings, whole-file
omission accounting, cross-server conflicts, writeback/pressure, TTL and directory-publication races.
It also checks grant allocation/session stability, one log row after repeated moves, replacement
commit stamps, fixed-version visibility, grant hydration, retention/floor and concurrent GC,
disconnected-tenant discovery and hard-cap rollback. A bootstrap test pauses for 5.2 seconds while
objects move, are created/deleted and receive grants, then verifies the reconciled permissions.
Further cases cover retained stale grants within the configured age, parent mismatch, mixed-batch
FDB fallback, authority generation changes during a read and after mutation preparation, idle
eviction and in-flight reservation lifetimes. Directory cases commit older clock samples after
newer ones, preserve sibling independence, reset explicit utimes, and refresh omitted parent attrs.
Content tests read 64 small files with two whole-file RPCs, deduplicate eight concurrent readers,
grow large-file read windows, avoid random-read and memory-pressure speculation, and preserve expiry
across both ordinary and delayed content replies. Covered dirty reads perform no content RPC;
partial dirty reads download only their uncovered base block. Speculative admission cannot evict
demand or consume its reserved capacity. The latest full suite, strict clippy and contract syntax
checks pass; real-FDB coverage completes in about 22 seconds. These are tests, not benchmark results.
Inline tests also run outside Tokio, exercise no-effect deferral under pressure, and pause a content
RPC while an unrelated warm stat completes synchronously. The mounted suite runs as `nobody`, checks
file/directory modes and retained open-descriptor rights, and covers 13-level / 32-file repeated
dirty cleanup. It traverses 600 long filenames across small kernel reply buffers and checks every
stat, with both inline/deferred callbacks and zero waits after effects. The latest expanded mounted
report is `/tmp/dfs-v5-mounted-zeqqcns3` inside `dfs-v4-dev-1`. It verifies the accounted and scratch
limits; the real-FDB inline case also fills the scratch pool and proves no write was accepted before
deferral. The completed local and GCP performance measurements are linked above.

The dust-dev workload identity was verified through the allowlisted IAP wrapper before deployment.
The original v2/v3/v4 sources and binaries were preserved; v5 uses /opt/dfs/v5 and /target/v5.
The remote driver and validation logs are retained under /var/log/dfs-bench/v5. It left the originally
inactive `dfs-play-mount` inactive and restored the active v2 server and v3 server/mount.

Remaining audit: reconcile the design's 1M/10M/100M tree memory measurements, Git/large-directory/
shared-parent/independent-client workloads and feed/authorization telemetry with existing evidence.
Do not claim those broader measurements from the 10k-file jd suite. The focused cleanup and tree
measurements are recorded separately in the reports linked above.
