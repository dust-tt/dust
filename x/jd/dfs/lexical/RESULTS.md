# Embedded Tantivy on RocksDB DFS: cloud results

The initial 10k experiment below is historical. See the [larger-corpus follow-up](#larger-corpus-follow-up-current-indexed-literal-lance-control) for the newer Lance substring-index comparison and detailed memory measurements.

Measured on 2026-10-02. The embedded Tantivy path reduced permissioned
name, phrase, and literal-search latency on the 10,000-file DFS corpus. The largest
improvement was literal body search: 30.0× lower median HTTPS latency.
Both engines returned the expected authorized results at the same persisted source boundary.

## Permissioned query latency

Client wall time over persistent HTTPS connections, in milliseconds. Each cell
contains **median / p95** from 50 measured requests after warmups. The caller has
an inherited group grant on the corpus directory.

| Query | Tantivy, ms | Lance, ms | Median speedup |
|---|---:|---:|---:|
| Exact filename (1 hit) | 1.11 / 1.23 | 4.22 / 4.85 | 3.8× |
| Filename substring (20 hits) | 1.74 / 2.03 | 9.34 / 10.03 | 5.4× |
| Rare body phrase (4 IDs) | 1.42 / 1.54 | 4.36 / 4.93 | 3.1× |
| Rare body phrase (4 complete bodies) | 1.84 / 2.01 | 4.97 / 5.67 | 2.7× |
| Common body phrase (100 IDs) | 5.15 / 5.86 | 9.06 / 9.89 | 1.8× |
| Literal body substring (4 IDs) | 1.49 / 1.77 | 44.68 / 47.99 | 30.0× |

The admin workload is also included in the raw results. Full-document results
were checked against all four expected corpus SHA-256 hashes. Exact-name and rare
body IDs agree across engines; common-query ranking retains each engine's native
scoring and tie ordering.

## Concurrent load

Each worker issues 2,000 sequential common-phrase queries returning 100 authorized
IDs. These are observed rates for this client and workload; capacity saturation
was not established.

| Clients | Queries per engine | Tantivy queries/s | Lance queries/s | Tantivy p95, ms | Lance p95, ms |
|---:|---:|---:|---:|---:|---:|
| 4 | 8,000 | 717 | 381 | 6.12 | 11.92 |
| 8 | 16,000 | 1,182 | 627 | 8.94 | 14.43 |

Every response was checked for the expected count, unique IDs, and a complete
source/index boundary. The ungranted caller returned no hits.

## Updates and recovery

Twenty sequential content mutations became searchable in **309 ms median /
309 ms p95**, including the mutation CLI, readiness polling at 100 ms,
and exact returned-body validation. The configured refresh interval remained
250 ms. Buffering the durable JSON sidecar reduced the earlier observed median
from 713 ms to 309 ms. The final single-file index-publication stages took about
32 ms median; the namespace lookup indexes were reused.

Grant revocation and restoration took effect on the next query without an index
wait. Content replacement suppressed stale versions immediately. Rename preserved
body identity, and unlink removed the result.

A SIGKILL of the DFS/Tantivy process recovered and reconciled 10,000 documents in
**10.55 seconds**, including service restart delay. Four persisted IDs and
complete body hashes were unchanged. This exercised process-crash recovery.
The new source incarnation currently triggers a complete rebuild.

## Setup and interpretation

- Project `dust-dev`, zone `us-central1-a`; server
  `dfs-tantivy-jd-20261002-server`, n2-standard-16, 300 GB pd-ssd boot disk;
  client `dfs-tantivy-jd-20261002-client`, n2-standard-4.
- Fresh isolated VMs, database, credentials, indexes, and binaries. The unrelated
  `dfs-search-*` and `dfs-slate-*` experiments were excluded from measurements.
- Same immutable corpus: 10,000 UTF-8 files, 177,499,149 source bytes
  (169.28 MiB). Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Rust 1.96.0, release optimization with debug symbols; Tantivy 0.26.2 versus
  LanceDB 0.39.0 / Lance 12.0.0. The captured Lance prototype includes its
  existing index configuration and vendor changes.
- Warm caches and connections. Sequential admin/permissioned cases were
  interleaved in deterministic randomized order. No builds or corpus mutations
  ran during either final latency/load measurement.
- Client TLS goes through the same nginx endpoint. Tantivy runs inside DFS;
  Lance uses its existing standalone adapter with loopback gRPC to the same DFS.
  The comparison includes authentication, authorization, query planning,
  retrieval, validation, serialization, transport, and the adapters' logging.
- Matching projections were requested from Lance. Tantivy supplies its native
  score for literal queries as well; Lance's literal filter returns IDs and source
  versions. Native scores are not compared numerically.
- The corpus and grant shape are small. These measurements establish this
  workload's behavior; million-file scaling, large grant sets, cold caches,
  long-running mixed writes/searches, and maximum throughput remain unmeasured.

The final service cgroup peaks were about 541 MiB for DFS plus embedded Tantivy,
and another 1,090 MiB for the standalone Lance service. These include cgroup
page-cache accounting and shared-source work. The Tantivy index directory occupied
about 300 MiB, including 261 MiB of JSON metadata artifacts; the Lance index directory
occupied about 148 MiB. These are experiment snapshots, with different retained
history and no storage-normalization claim.

## Implementation and verification

The optional `lexical-search` feature adds an in-process HTTP search path while
preserving the Lance API. It uses stable numeric slots, in-memory name/trigram
indexes, subtree Roaring bitmaps, a bounded permission-mask cache, and current DFS
validation. Body literal search intersects Tantivy trigram postings and verifies
original text before top-k and pagination. Content changes use persisted journal
deltas; policy changes export no nodes and do not modify body postings.

The feature-enabled release suite passed **46 tests**, including eight lexical
integration tests. Clippy passed with warnings denied, and formatting passed.
The integration tests cover pre-top-k authorization, policy-only updates, literal
false positives, stale versions, namespace replacement, scope/tenant boundaries,
extraction limits, checkpoint reopening, source persistence failure, and failed
index publication. Live HTTP checks, both benchmark runs, and final status checks
passed. Contracts were reviewed manually; `cc-check` was unavailable.
The Tantivy source matches the tested snapshot. The local manifest also contains
a concurrently added `dfs-rename-bench` target from the separate Slate experiment;
that target was outside this isolated build and has been preserved.

Current limits: one configured workspace per index; no vector-search path;
short literal strings scan candidates; the filtering collector evaluates matching
postings and does not retain native TopDocs BlockWAND pruning. Metadata cloning
and sidecar persistence still scale with corpus size. Old metadata artifacts
require offline cleanup; automatic garbage collection is not implemented.

## Evidence and reproduction

- [Tantivy raw queries and load samples](../results/tantivy-cloud/client/tantivy.json)
- [Lance raw queries and load samples](../results/tantivy-cloud/client/lance.json)
- [Live update and authorization checks](../results/tantivy-cloud/server/live.json)
- [SIGKILL recovery](../results/tantivy-cloud/server/recovery.json)
- [Release tests](../results/tantivy-cloud/server/tests.log),
  [Clippy](../results/tantivy-cloud/server/clippy.log),
  [source hashes](../results/tantivy-cloud/server/all-source.sha256), and
  [deployed binary hashes](../results/tantivy-cloud/server/deployed-binaries.sha256)
- [Exact tested source snapshot](../results/tantivy-cloud/server/tested-source.tar.gz)
- [Final source/index status](../results/tantivy-cloud/server/final-status.json)
- Earlier `*-prebuffer` artifacts and `tantivy-before-recovery.json` are retained
  as development evidence and are excluded from the final comparison table.

The server services remain active as `dfs-search-tantivy` and
`dfs-search-tantivy-lance`. Only the dedicated client can reach private TLS port
7444. DFS gRPC and both backend HTTP listeners bind to loopback.

On the dedicated client, rerun either engine with:

```sh
python3 /home/dfs/x/jd/dfs/lexical/cloud-bench.py \
  --run /home/dfs/x/jd/dfs/runtime/search-cloud \
  --server 10.128.0.23 --engine tantivy --rounds 50 --load-rounds 2000 \
  --output /home/dfs/x/jd/dfs/results/tantivy/tantivy-rerun.json
```

For Lance, use `--engine lance --base-path /lance` and a separate output file.
Run `lexical/cloud-check.sh` only on the dedicated server. Stop other experiment
workloads before rerunning measurements.

## Larger-corpus follow-up: current indexed-literal Lance control

Measured later on 2026-10-02 using two newly generated corpora. This control includes the captured Lance prototype's FM substring indexes, including partitioned construction; the earlier 30× literal-search comparison above used its older path. The comparable literal-search advantage is now about **4.0–4.5×**. All **104,640 timed requests** passed validation.

The 100,000-file run keeps selective queries near 1–2 ms, but its common-phrase query grows to 17.1 ms. The larger-body run keeps IDs-only queries fast while retaining much more anonymous memory. Tantivy uses less total cgroup memory in both runs; on larger bodies its RSS exceeds Lance's.

| Corpus | Files | UTF-8 source bytes | Size | Filler lines/file |
|---|---:|---:|---:|---:|
| `count100k` | 100,000 | 1,775,092,431 | 1.65 GiB | 256 |
| `bytes-large` | 10,000 | 2,773,353,826 | 2.58 GiB | 4,096 |

Both engines consume the same DFS nodes and body hashes within each corpus. Tantivy live mutation checks run after its timed queries; their temporary file is deleted before the Lance build. Consequently, the engines have different current source heads/incarnations, with unchanged benchmark corpus IDs and contents. Each query run first verifies that its own index has caught up.

### Warm permissioned queries

Persistent HTTPS client wall time, **median / p95 in milliseconds**, with 30 measured samples per cell after warmups. The same harness also measures fresh TLS connections and administrator queries; those cells are retained in the raw results. The full-body cases verify all four returned SHA-256 hashes.

| Query | 100k Tantivy | 100k Lance | Large bodies Tantivy | Large bodies Lance |
|---|---:|---:|---:|---:|
| Filename literal, 20 hits | 2.74 / 3.33 | 29.26 / 35.05 | 1.85 / 2.00 | 10.56 / 11.46 |
| Filename LIKE, 20 hits | 2.69 / 3.15 | 31.96 / 33.62 | 1.72 / 2.03 | 11.50 / 11.88 |
| Selective filename literal | 1.20 / 1.44 | 5.81 / 6.48 | 1.01 / 1.25 | 4.38 / 4.93 |
| Selective filename LIKE | 1.20 / 1.36 | 7.66 / 8.37 | 1.10 / 1.23 | 5.40 / 6.55 |
| Exact filename | 1.13 / 1.28 | 5.78 / 6.54 | 1.06 / 1.25 | 4.52 / 5.47 |
| Filename prefix | 1.40 / 1.62 | 7.20 / 8.03 | 1.34 / 1.56 | 5.82 / 6.54 |
| Opaque node ID | 1.17 / 1.30 | 5.85 / 6.50 | 1.12 / 1.30 | 4.46 / 5.38 |
| Directory literal | 1.16 / 1.29 | 7.68 / 8.50 | 0.88 / 1.25 | 5.63 / 6.45 |
| Directory LIKE | 1.16 / 1.34 | 7.94 / 13.13 | 1.06 / 1.24 | 5.66 / 6.52 |
| Rare body phrase, 4 IDs | 1.45 / 1.72 | 5.98 / 6.53 | 1.44 / 1.60 | 6.47 / 7.41 |
| Rare body literal, 4 IDs | 1.67 / 1.96 | 6.71 / 7.26 | 1.72 / 1.95 | 7.70 / 8.33 |
| Rare phrase, 4 full bodies | 2.07 / 2.31 | 6.78 / 7.24 | 8.49 / 9.10 | 14.89 / 15.54 |
| Rare literal, 4 full bodies | 2.27 / 2.53 | 7.44 / 8.51 | 9.03 / 9.26 | 15.47 / 17.04 |
| Body LIKE, 4 IDs | 1.71 / 1.99 | 8.42 / 9.23 | 1.70 / 2.10 | 9.79 / 10.62 |
| Common phrase, 100 IDs | 17.10 / 18.27 | 21.00 / 22.00 | 5.18 / 5.96 | 13.55 / 14.37 |
| Absent literal | 1.23 / 1.43 | 5.52 / 5.99 | 1.16 / 1.36 | 6.27 / 6.97 |
| Unicode literal, 20 IDs | 5.92 / 6.54 | 42.66 / 43.75 | 4.31 / 5.24 | 12.92 / 13.70 |

The LIKE cases use patterns equivalent to the corresponding literal or prefix query; this does not establish general SQL LIKE support in Tantivy. Filename and directory FTS phrase queries are explicitly unsupported by the Tantivy API. Lance's two additional native phrase cells were tested and remain in its raw results. Native scores and tie ordering are not compared across engines.

### Concurrent search

Common phrase, 100 authorized IDs, 2,000 queries per worker. These are observed rates, not a measured saturation ceiling. Elapsed throughput includes each worker's two warmups and client-side response validation.

| Corpus | Clients | Tantivy queries/s | Lance queries/s | Tantivy p95, ms | Lance p95, ms |
|---|---:|---:|---:|---:|---:|
| count100k | 4 | 227 | 154 | 19.29 | 28.85 |
| count100k | 8 | 417 | 254 | 29.23 | 35.49 |
| bytes-large | 4 | 770 | 227 | 5.84 | 19.42 |
| bytes-large | 8 | 1251 | 358 | 8.32 | 25.23 |

At 100,000 files, Tantivy's sequential common-query retrieval stage is 10.88 ms median, versus 1.39 ms on the 10,000-file larger-body corpus. Candidate validation adds 4.30 and 2.25 ms respectively. Permission-filtered common-term ranking is a remaining scale bottleneck; the current FilterCollector path does not retain native TopDocs BlockWAND pruning.

### Server memory

**GiB; sampled maxima within each named phase.** The Tantivy rows include its enclosing DFS process. Lance rows combine plain DFS and the standalone Lance process. These exclude nginx, the client, sampler, CLI, and orchestration processes. Baselines are plain DFS after a cold restart and 20 seconds idle.

| Corpus | Phase / architecture | Total cgroup | RSS | PSS | Anonymous | File cache |
|---|---|---:|---:|---:|---:|---:|
| count100k | DFS baseline | 0.50 | 0.28 | 0.27 | 0.26 | 0.24 |
| count100k | DFS + Tantivy, initial build | 1.68 | 1.01 | 1.01 | 0.91 | 0.75 |
| count100k | DFS + Tantivy, 8 clients | 1.70 | 1.03 | 1.03 | 0.97 | 0.70 |
| count100k | DFS + Tantivy, live checks | 2.93 | 1.89 | 1.89 | 1.83 | 1.06 |
| count100k | DFS + Lance, initial build | 6.21 | 4.21 | 4.20 | 4.24 | 2.49 |
| count100k | DFS + Lance, 8 clients | 5.60 | 3.13 | 3.12 | 3.02 | 2.50 |
| bytes-large | DFS baseline | 0.24 | 0.09 | 0.08 | 0.07 | 0.17 |
| bytes-large | DFS + Tantivy, initial build | 4.42 | 3.68 | 3.67 | 3.19 | 1.24 |
| bytes-large | DFS + Tantivy, 8 clients | 4.44 | 3.71 | 3.71 | 3.16 | 1.24 |
| bytes-large | DFS + Tantivy, live checks | 4.48 | 3.74 | 3.73 | 3.23 | 1.24 |
| bytes-large | DFS + Lance, initial build | 6.22 | 3.73 | 3.73 | 3.67 | 2.74 |
| bytes-large | DFS + Lance, 8 clients | 5.57 | 2.83 | 2.83 | 2.73 | 2.75 |

Cgroups were sampled every 100 ms and process `/proc/*/smaps_rollup` every 500 ms. Peaks in separate columns may occur at different instants. RSS includes resident mapped files and is not additive with file cache; PSS apportions shared mappings. Cgroup total includes anonymous memory, file cache, and kernel allocations. The memory summaries preserve idle, matrix, four-client, and individual-service breakdowns as well. There were **zero OOM/OOM-kill events**, and service swap was disabled.

The larger-body Tantivy run retains about **3.16 GiB anonymous memory** under query load. Its 64 MiB writer configuration is not a bound on process memory. Code inspection identifies a possible contributor: the prototype supplies each body to both the text and trigram fields, while Tantivy 0.26.2 has a queue bounded at 10,000 documents, not bytes. Byte-bounded ingestion and allocator retention deserve a separate controlled measurement; this run does not establish their individual contributions.

The 100k live-check peak includes metadata snapshot handling, grants, content writes, rename, and deletion. It is not a pure single-write measurement. Neither the query peak nor the writer configuration should be interpreted as a production memory limit.

### Initial indexing and updates

Time below includes stopping/restarting DFS with cold filesystem caches and waiting for the initial index to reach the current source head. Reopening DFS itself took about 30–32 seconds; these are not isolated search-index construction times.

| Corpus | DFS + Tantivy ready, s | DFS + Lance ready, s | Tantivy steady update median, ms | Update range, ms |
|---|---:|---:|---:|---:|
| count100k | 69.9 | 95.5 | 511 | 411–513 |
| bytes-large | 85.1 | 99.5 | 309 | 209–310 |

Five steady updates per corpus were checked, including CLI mutation time, readiness polling at 100 ms, and exact returned-body validation. Live checks also passed immediate grant revocation/restoration, cross-tenant rejection, request bounds, stale-version suppression, rename identity, and unlink removal. Large-corpus crash recovery and sustained mixed write/search load were not measured.

### Configuration, checks, and reproduction

The same dedicated n2-standard-16 server and n2-standard-4 client were used, with release binaries and the same private nginx TLS endpoint. No builds or mutations ran during timed query/load phases. Each engine configuration started after a filesystem-cache drop on this isolated server; query results are warm-cache measurements. Tantivy uses two writer threads and a 64 MiB writer budget. The captured Lance build logged 14 FM construction workers and 16 MiB partitions.

DFS/Tantivy had a 16 GiB service limit. Standalone Lance had a 40 GiB limit, plus plain DFS's 16 GiB limit; no service approached these limits. Both corpus databases use an explicit 200,000-node limit and 32 GiB tenant quota. At 100,000 files, directories exceed the default 100,000-node capacity. `dfsd --max-nodes` and `dfsctl --max-nodes` now support this scale without changing the defaults or FUSE client behavior. A CLI snapshot-capacity setup failure was retained in the logs and resolved before accepted query measurements.

The release DFS/Tantivy suite passed **46 tests**, including the CLI client's exact-capacity/overflow checks in the RPC test. The captured Lance suite passed **18 tests**. Release Clippy with warnings denied and formatting passed. Contracts were reviewed manually; `cc-check` remains unavailable.

These are synthetic marker/lorem corpora with high compressibility and one inherited group grant. They do not establish production-corpus behavior, million-file capacity, large ACL-set behavior, cold-query latency, or maximum sustainable throughput. Directory sizes include different retained histories: Tantivy live checks created additional sidecars while Lance was built afterward. Disk usage is saved as an experiment snapshot, not a normalized storage comparison.

Reproduction scripts:

- `scale-corpus.py`: generate manifests and bodies on the dedicated server (100,000 / 256 filler lines, or 10,000 / 4,096 filler lines).
- `scale-server.py --dataset DATASET --action prepare`, then `baseline`, then `tantivy`: create fresh isolated state, start sampling, configure permissions, and measure initial readiness. Existing database/index paths are deliberately rejected.
- Copy the dataset's `fixture.json` and `corpus/manifest.json` into the dedicated client's `results/tantivy-scale/DATASET/` directory. `scale-run.py --dataset DATASET --engine tantivy` orchestrates the shared matrix and 4/8-client workloads from the local workspace.
- `scale-live.py` runs the Tantivy live checks. `scale-server.py --dataset DATASET --action lance` replaces embedded search with plain DFS plus Lance; then run the same `scale-run.py` command with `--engine lance`.
- Stop with `scale-server.py --dataset DATASET --action stop`; `scale-summarize.py RESULT_DIRECTORY` aggregates the resource samples. `scale-compare.py results/tantivy-scale` validates and combines accepted results. The original 10k services were restored after measurement; the larger corpus databases and indexes remain preserved separately.

Evidence:

- [Combined comparison and all query summaries](../results/tantivy-scale/comparison.json)
- [100k memory profiles](../results/tantivy-scale/count100k/memory-summary.json), [raw samples](../results/tantivy-scale/count100k/memory.jsonl.gz), [Tantivy queries](../results/tantivy-scale/count100k/tantivy-matrix.json), [Lance queries](../results/tantivy-scale/count100k/lance-matrix.json)
- [Larger-body memory profiles](../results/tantivy-scale/bytes-large/memory-summary.json), [raw samples](../results/tantivy-scale/bytes-large/memory.jsonl.gz), [Tantivy queries](../results/tantivy-scale/bytes-large/tantivy-matrix.json), [Lance queries](../results/tantivy-scale/bytes-large/lance-matrix.json)
- Each dataset directory also contains both engines' 4/8-client load samples, corpus manifest, fixture, readiness observations, and live-check results.
- [DFS release tests](../results/tantivy-scale/dfs-tests.log), [Lance release tests](../results/tantivy-scale/lance-tests.log), [Clippy](../results/tantivy-scale/dfs-clippy.log), [service logs](../results/tantivy-scale/services.log.gz)
- [Captured source](../results/tantivy-scale/tested-source.tar.gz), [source hashes](../results/tantivy-scale/source-files.sha256), [deployed binary hashes](../results/tantivy-scale/deployed-binaries.sha256)

## Bounded ingestion and ranked pruning — 2026-10-02

The optimized implementation was rebuilt and measured against the same saved
100,000-file / 1.65 GiB and 10,000-file / 2.58 GiB corpora above. Corpus and query
harness hashes match. Fresh indexes were created for each run; timed queries used
the unchanged TLS matrix and 4/8-client workloads. These measurements precede the
separate-VM showdown and compare Tantivy with its own previous implementation.

Ingestion now owns each body once and shares borrowed field views with Tantivy.
A 32 MiB admission budget follows queued and actively consumed documents until
they are dropped. This addresses the previous document-count queue and duplicate
body ownership together; this experiment does not isolate their individual effects.
The existing two-thread, 64 MiB writer configuration is unchanged. Neither budget
bounds process memory, metadata, extraction buffers, allocator retention, or cache.

The new bounded ranking heap raises its pruning threshold only after a candidate
passes deletion, permission, and literal checks. Common exact phrases use a native
BM25 upper bound from a constituent term's frequency before positional verification.
Among equally selective terms, sampled frequency selects a tighter bound. Native
phrase matching, scores, document-address ties, and final DFS validation are retained.
There is no index-format or API change.

### Query performance

Alice, persistent HTTPS, 30 timed samples per matrix cell; milliseconds unless
specified. These are observed workload rates, not saturation limits.

| Metric | 100k before | 100k optimized | Large bodies before | Large bodies optimized |
|---|---:|---:|---:|---:|
| Common phrase, median | 17.10 | 9.80 | 5.18 | 3.86 |
| Common phrase, p95 | 18.27 | 10.43 | 5.96 | 4.62 |
| Common phrase, retrieval stage median | 10.884 | 0.424 | 1.391 | 0.284 |
| Rare phrase, median | 1.45 | 1.59 | 1.44 | 1.39 |
| Rare literal, median | 1.67 | 1.88 | 1.72 | 1.63 |
| Rare phrase, full bodies, median | 2.07 | 2.28 | 8.49 | 8.25 |
| Unicode literal, median | 5.92 | 3.58 | 4.31 | 3.51 |
| Four clients, queries/s | 227 | 346 | 770 | 955 |
| Eight clients, queries/s | 417 | 523 | 1251 | 1493 |
| Eight clients, p95 | 29.23 | 19.89 | 8.32 | 6.82 |

Common-phrase retrieval is 25.7× faster at 100k, while end-to-end median improves
1.74×. Current DFS validation increased from 4.30 to 7.58 ms in the observed matrix
and now dominates the request; it was not modified. Fresh indexes can select
different tied documents because native document-address ordering is retained.
The rare-query rows at 100k are 0.13–0.21 ms slower end to end; their retrieval
stages remain around 0.10 / 0.22 ms. Common filename queries also rose from
2.74 / 2.69 to 3.11 / 3.19 ms. This is not a claim that every workload improved.

### Memory

GiB, sampled maxima within each phase, including the enclosing DFS process.
Each cell is **before → optimized**. Total includes cache and kernel allocations;
RSS overlaps cache and must not be added to it. Column peaks need not coincide.

| Corpus / phase | Total cgroup | RSS | Anonymous | File cache |
|---|---:|---:|---:|---:|
| 100k, initial build | 1.68 → 1.44 | 1.01 → 0.74 | 0.91 → 0.66 | 0.75 → 0.76 |
| 100k, eight clients | 1.70 → 1.45 | 1.03 → 0.79 | 0.97 → 0.67 | 0.70 → 0.76 |
| 100k, live checks | 2.93 → 2.69 | 1.89 → 1.66 | 1.83 → 1.64 | 1.06 → 1.02 |
| Large bodies, initial build | 4.42 → 1.49 | 3.68 → 0.79 | 3.19 → 0.30 | 1.24 → 1.17 |
| Large bodies, eight clients | 4.44 → 1.58 | 3.71 → 0.85 | 3.16 → 0.30 | 1.24 → 1.24 |
| Large bodies, live checks | 4.48 → 1.61 | 3.74 → 0.88 | 3.23 → 0.42 | 1.24 → 1.24 |

The larger-body query workload uses 77% less RSS, 90% less anonymous memory, and
64% less total cgroup memory. Initial-build total memory falls 66%. The 100k
live-check peak remains material: metadata and snapshot handling still scale with
file count. Both configurations used the same 16 GiB service limit and disabled
swap; there were zero OOM or OOM-kill events. Sampling remains 100 ms for cgroups
and 500 ms for process RSS/PSS; complete profiles are retained.

### Build, freshness, and verification

Cold DFS restart plus initial readiness was 70.52 seconds at 100k (previously
69.89), and 83.29 seconds for large bodies (previously 85.09). Indexing stages
alone were 36.62 and 54.08 seconds. The 60-second source export lease remains a
scale limit; these results do not establish arbitrary corpus capacity.

All 52,080 timed requests passed validation, including exact hashes for full-body
responses. Both live suites passed grants, revocation, cross-tenant rejection,
request bounds, stale-version suppression, rename, and deletion checks. Five
steady updates had median visibility of 410 ms at 100k and 309 ms for large bodies,
including CLI mutation and 100 ms readiness polling.

The release suite passed 48 tests; release Clippy with warnings denied passed.
New tests compare native scores and ordered results against the original filtered
collector across segments, deletions, sparse/empty permissions, offsets, ties,
literal predicates, term/Boolean/exact/gapped/repeated-term phrases, and failures.
Admission tests cover bounds, release, waiting, and timeout. Changed product files
match the tested cloud source. Contracts were reviewed manually; `cc-check` is
unavailable. Original services were restored after the measurements.

Evidence: [complete comparison](../results/tantivy-optimized/comparison.json),
[100k samples and memory](../results/tantivy-optimized/count100k/memory-summary.json),
[large-body samples and memory](../results/tantivy-optimized/bytes-large/memory-summary.json),
[tests](../results/tantivy-optimized/tests.log),
[Clippy](../results/tantivy-optimized/clippy.log).
Raw queries, load samples, readiness, live checks, and compressed memory samples
are alongside these files. Intermediate runs are preserved in
`results/tantivy-optimized-v1` and `results/tantivy-optimized-v2`; they are excluded
from the final tables. Synthetic-corpus, warm-cache, and mixed-load limitations
from the preceding report still apply.
