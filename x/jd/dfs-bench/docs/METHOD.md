# Clean parallel benchmark

The three systems have independent clients, servers and datasets. Every VM is a `c4-standard-8-lssd` with 8 vCPUs, 30 GiB RAM and one 375 GiB Titanium NVMe Local SSD. All data, indexes, database logs and client corpora live on that local SSD. The 50 GB Hyperdisk Balanced boot volume holds the OS and installed packages. The allocated region is `us-east4`; attempts to allocate the same SSD family in `us-central1` failed before deployment.

[Topology](TOPOLOGY.md), [results](RESULTS.md), [actual VM inventory](../results/hosts.json), and [runner](../scripts/run.py).

Google documents the [Local SSD storage tier and Titanium support](https://docs.cloud.google.com/compute/docs/disks/local-ssd?hl=en). This selects its low-latency local hardware; it is not a claim that an eight-vCPU VM reaches the maximum IOPS of Google's largest storage VM. Local SSD data is ephemeral. RocksDB has one copy; FDB and TiKV replicate across three hosts/zones.

## Systems and resources

| System | Filesystem storage | Search | Placement |
|---|---|---|---|
| RocksDB + Tantivy | One RocksDB instance | Embedded Tantivy | One server, one dedicated client |
| FDB + Elasticsearch | FoundationDB 7.3.69, triple redundancy, ssd-2 | Three Elasticsearch 8.19.4 nodes | Three DB hosts, three separate ES hosts, one client |
| TiKV + Elasticsearch | TiKV/PD 8.5.3, three stores and three PD members, synchronized Raft log | Three Elasticsearch 8.19.4 nodes | Three DB/PD hosts, three separate ES hosts, one client |

Distributed frontends run on their database host A. Each frontend has a 4 GiB memory ceiling. TiKV has 12 GiB per store with a 4 GB block cache; each PD container has 1 GiB. FDB has a 12 GiB native limit, 4 GiB storage cache and 16 GiB service ceiling per host. Each ES container has 8 GiB, including a 4 GiB JVM heap. The implementation creates three primary index shards and one replica per shard. These are complete architecture comparisons, not equal aggregate memory or host-count experiments. FDB’s status reports zero zone failures tolerated for availability in this three-host triple configuration. This run does not inject failures or establish failover behavior.

RocksDB retains its 128 MiB shared storage-memory budget and 64 MiB write-buffer budget. Tantivy has two indexing threads and a 64 MiB writer budget. TiKV/FDB frontends retain the default 64 MiB object cache. Each client application and mount share a 6 GiB cgroup with swap disabled and all eight client CPUs available. Every mount has the same 256 MiB combined content/manifest/hint budget, default 128 MiB metadata limit, direct file-data I/O and eight admitted reads. Native unbuffered trials used a one-second metadata/revision/authority deadline; buffered trials use 500 ms as specified below.

Filesystem RPC uses direct TLS to the frontend; there is no routing tier. TiKV and FDB serve search over TLS directly. RocksDB's existing search API binds loopback, so a local nginx TLS proxy forwards to Tantivy on that same server. This proxy has a 256 MiB ceiling. Its overhead is included in RocksDB search measurements. No public unauthenticated storage or ES listener is exposed by the benchmark firewall rules.

## Work and synchronization

The seed-42 corpus contains 10,000 documents, 100 directories and 177,499,149 document bytes. Its manifest is an additional file. Every client generates the same corpus independently and records its manifest hash. A local uncompressed tar archive is prepared before timing.

1. All three clients wait at an atomic start barrier, then extract into empty mounted corpus directories. Indexing stays enabled throughout. Tar duration is recorded separately from opening, syncing and closing all 10,001 regular files. Every document's size and SHA-256 is then checked outside timing.
2. Each client waits for its search index to catch up and opens a fresh FUSE mount. The coordinator releases the filesystem phase only when all three are ready. The complete 24-row suite runs concurrently, with three immediate warm repetitions. Every sample validates output; a final audit checks paths, sizes and scratch-directory removal.
3. After search catches up with the suite's mutations, another common barrier releases six validated search cases. Each has one first sample and ten warm repetitions over a persistent HTTPS connection. Search validates hit counts and rare-document identities/content.

Barriers use an agreed future UTC timestamp and atomic file replacement. Recorded actual starts establish overlap. Faster systems wait for the next phase; they do not start a later phase while another system is still extracting. In the first baseline run, the original signal-file preflight race was corrected before any timed workload ran. The index-readiness deadline was extended from 30 minutes to two hours after observing the implementation’s 16-event passes and 500 ms inter-pass sleep. A client can resume after its completed, hash-verified untar; extraction is not repeated and backend binaries remain unchanged. RocksDB’s idle populated mount was also recreated before filesystem timing because the extended wait would exceed its one-hour session lifetime. No timed filesystem sample had started. Resource counters identify whether their cgroup covers all phases or only resumed post-untar work.

“First” means the first invocation on that mount or connection, not globally cold storage. Corpus writes, indexing and validation warm server/database/OS caches. Fresh FUSE mounts clear daemon caches before the filesystem phase. No cache flushing is performed. Mount startup and index catch-up are reported separately. No build, correctness suite or disk probe runs concurrently with timed work on these hosts.

## Interpretation

DDIA chapters 3, 5, 6, 7 and 11 distinguish storage access cost, replication, partitioning, transactions and derived indexes. SSD latency does not remove application round trips, shared publication dependencies, per-object transactions or index-maintenance work. One client per system measures latency and this workload's throughput; it does not establish concurrent-writer scalability or failure tolerance.

RocksDB publication can precede its WAL barrier; explicit fsync confirms persistence. TiKV and FDB commit replicated state during publication. The mount coalesces persistence receipts, so the 32-file fsync loop does not imply 32 independent database commits or WAL flushes. Search visibility remains asynchronous. The one-second metadata cache does not weaken write-version fences or make search visibility part of filesystem durability.

Previous benchmark results and fleets were removed at the user's request. New evidence lives only under this folder's sibling `results/`; old timing tables are not reused as baselines.

## Optimization iterations

[Write-path rework](WRITE_PATH_REWORK.md) records code changes and each revision’s acknowledgement boundary. [`iterate.py`](../scripts/iterate.py) isolates readiness, evidence and client units by iteration. Every iteration uses a fresh server namespace/database path and the validated seed-42 corpus. The same eight-read defaults apply to all mounts; only the RocksDB CLI exposes a read-concurrency flag.

The initial `native-01` preflight rejected that unsupported flag on the distributed mounts, before releasing any timed barrier. `native-02` uses the corrected driver and fresh namespaces. Its application sources and binaries are recorded by `native-01-source.json` and `native-01-binaries.json`; the artifact version is unchanged between those attempts.

Untar-only iterations measure extraction and the subsequent durability pass separately, validate every file hash, then run an untimed 32-thread no-match scan on a fresh mount as a read-admission regression check. Index catch-up is verified afterward. Its reported wait excludes extraction and validation time; it is not the total indexing duration from first publication. Full filesystem/search timing is a later gated phase. Failed preflights remain labeled and have no timing rows.

## Buffered-write iterations

The approved buffered-write revisions use the same machines, SSDs, replicas, memory limits, corpus and indexing settings. Their metadata/revision/authority TTL is shortened to 500 ms to leave a 500 ms publication budget within the one-second target. Eligible changes and close may return from a one-MiB/64-node mount buffer. Buffer-09 also batches directory creation and attributes of existing non-root directories, preserving the original revision/entry fences and ordering pending parents before children. Publication becomes eligible at 100 ms; local polling is every 25 ms. No invalidation network channel is introduced.

Extraction return time and the following explicit open/fsync/close pass are reported separately, together with their sum. Hash validation, a fresh-mount parallel scan, and complete literal-search readiness remain mandatory. The mount records publication age and budget misses. These revisions are not directly equivalent in acknowledgement semantics to the synchronous native-03 run: abrupt client loss before durable synchronization can lose buffered bytes. A missed publication budget must be reported rather than described as meeting the one-second target.

The transaction-prefetch follow-up adds a bounded server-side address-hint map (256 entries, 256 KiB charged storage). It does not cache authorization or alter the 64 MiB immutable-object cache; the frontend's 4 GiB memory ceiling is unchanged. Report this extra bounded bookkeeping separately from content-cache capacity. Per-operation client latency counters include retries and encoding/decoding, and are cumulative across the phase.

Buffer-10 tracks the first acceptance time of each pending node, retaining it across edits and retries. It also sets HTTP/2 receive windows to two MiB per stream and eight MiB per connection, on clients and frontends. Request/message limits, concurrency, content and metadata caches, cgroup ceilings, database caches and indexing settings are unchanged. TiKV's prefetch groups use up to 48 records/896 KiB payload inside the existing 256-key/one-MiB retained-value limits.

Buffer-11 raises only the pending publication bound to 128 node updates/two MiB, independently of the unchanged one-MiB individual I/O limit. FDB groups at most 64 updates per prefetch inside one transaction. The same corpus, including its 3,055,215-byte manifest, remains mandatory. This is a disclosed write-buffer change, not an increase to the content cache or database memory budget.
