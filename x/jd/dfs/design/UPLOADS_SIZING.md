# Uploads workload and DFS sizing

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

The uploads workload makes metadata cardinality, scoped namespaces, and retention first-order design constraints. The sizing examples below use three replicas per shard as an illustrative multiplier; the actual follower count remains open. A fixed memory allowance is also useful, but neither establishes that all namespace metadata can remain resident. Before moving the uploads payload into RocksDB, compare that design with replicated DFS metadata referencing immutable GCS blobs, a separation already present in `front`.

This investigation used read-only bucket metadata and Cloud Monitoring in **`or1g1n-186209`** on **2026-10-03**, then inspected the current `front` worktree. It focuses on `dust-private-uploads`, as requested. No object bodies were read, no full object listing was performed, and no production database was queried. Source inspection describes supported code paths, not their deployed adoption or share of traffic.

This supplies workload evidence for [the HA proposal](HA_DESIGN.md), [server memory and database lessons](POSTGRES_LESSONS.md), and [the client kernel-cache design](CLIENT_CACHE_DESIGN.md). It does not change the implementation or establish production performance.

Deployment decision, 2026-10-04: size for Kubernetes, storage pods hosting multiple shard replicas, with independently stored replicas of each shard across nodes; replica count remains open; followers support reads with the freshness requirements in HA_DESIGN.md. Include persistent search checkpoints, cold starts, and replacement capacity. The production observations below are unchanged; they do not measure Kubernetes resource requirements.

The [server implementation design](SERVER_IMPLEMENTATION_DESIGN.md) selects a separate RocksDB search projection with chunked memberships and bounded decoded caches. Include its WAL, staged redo, compaction, and paired backup checkpoints in these capacity experiments; sharing the configured engine cache does not remove its disk or I/O cost.

## Observed storage and growth

| Bucket and object state | Objects or retained generations | Payload size |
| --- | ---: | ---: |
| Private uploads, live | 457,180,214 | 15.907 TiB |
| Private uploads, noncurrent | 46,904,243 | 1.385 TiB |
| Private uploads, soft-deleted | 219,976 | 0.047 TiB |
| Private uploads, all three states | 504,304,433 | 17.339 TiB |
| Public uploads, live | 20,568 | 1.661 GiB |

Private live objects average **37.36 KiB** by aggregate bytes/count. This says nothing about the median, large-file tail, or hot working set. Binary units are used throughout; private live payload is 17,489,673,452,097 bytes.

Between aligned report endpoints on September 4 and October 3, 29 days apart, private live storage increased by **2.389 TiB (+17.7%)** and **62.60 million objects (+15.9%)**. That is approximately **84.36 GiB and 2.16 million net additional objects per day** over the interval. These are differences in retained stock, not an ingestion rate or a growth forecast.

The private bucket is US multi-region, with versioning enabled, a noncurrent-version deletion rule conditioned on 50 newer versions, and seven-day soft deletion. There is no bucket-wide age expiration in the returned lifecycle policy. Retained history must therefore be distinguished from current content and from actively accessed content.

## What `front` stores there

The source explains why treating every live GCS object as a DFS file would be misleading:

| Workload | Current source layout or behavior | Consequence for sizing |
| --- | --- | --- |
| Canonical attachments | `files/w/{workspace}/{fileId}/{original\|processed\|public}`; public content routes to the public bucket | A logical file can have multiple representations; upsert queue files use a separate bucket |
| Mounted file copies | `w/{workspace}/conversations/{conversation}/files/...` and `w/{workspace}/pods/{space}/files/...` | Mount setup copies the original and, when applicable, processed content; canonical and mounted copies coexist |
| GCS filesystem backend | Conversation, pod, and user scopes under `w/{workspace}/...` | Filesystem operations are scoped; the bucket itself is not the namespace presented to one sandbox |
| Database filesystem backend | Immutable payloads at `w/{workspace}/filesystem/blobs/{nodeId}/{blobId}` | Namespace nodes point to separately stored, versioned payloads |
| MCP tool output | Current writer uses `w/{workspace}/mcp_output_items/{action}/...json`, one object per content item | Numerous application blobs need not become mounted files or searchable filesystem nodes |
| Conversation state | Content fragments and conversation-window checkpoints use separate prefixes | Retention and access patterns differ from editable files |
| Frame state | Workspace/frame publication bundles, mutable state files, and database replica paths | File contents, deployment assets, and database recovery data need distinct semantics |

The attachment and copy behavior comes from [FileResource](../../../../front/lib/resources/file_resource.ts), while [mount path helpers](../../../../front/types/mount_path.ts) and [GCS filesystem operations](../../../../front/lib/api/file_system/backends/gcs_file_system_backend.ts) define the scoped filesystem layout. One processed, mounted attachment can account for four current objects: canonical original, canonical processed, mounted original, and mounted processed. This is an example, not a measured universal multiplier; dividing 457 million by four would be unjustified.

[Backend selection](../../../../front/lib/api/file_system/dust_file_system.ts) supports both GCS and database namespace modes. [Immutable blob paths](../../../../front/lib/file_storage/file_system_blobs.ts) and [content publication](../../../../front/lib/api/file_system/file_system_content.ts) show a concrete existing sequence: prepare an upload, write a create-only GCS blob, then commit its reference with an expected prior blob identity. This is a useful architectural precedent for DFS, without proving that its publication protocol can be reused unchanged.

[MCP output storage](../../../../front/lib/resources/agent_mcp_action/output_storage.ts) writes JSON content items and uses a 15-minute Redis cache. Its current workspace-prefixed layout differs from the observed top-level `mcp_output_items/` prefix; the inventory does not quantify historical layouts. [Content fragments](../../../../front/lib/resources/content_fragment_resource.ts), [window checkpoints](../../../../front/lib/api/assistant/conversation_rendering/conversation_window_checkpoint.ts), and [frame paths](../../../../front/types/api/frame_storage.ts) account for further workload classes.

## Observed request mix

For September 26 04:00 UTC through October 3 04:00 UTC, the private bucket reports:

| GCS method | Seven-day requests | Mean requests/second | Highest hourly mean/second |
| --- | ---: | ---: | ---: |
| GetObjectMetadata | 160,567,016 | 265.5 | 441.8 |
| ListObjects | 36,523,456 | 60.4 | 134.8 |
| ReadObject | 35,884,990 | 59.3 | 165.1 |
| WriteObject | 18,007,243 | 29.8 | 189.1 |
| DeleteObject | 3,478,047 | 5.8 | 90.7 |

Across all methods there were 255.39 million requests. **GetObjectMetadata plus ListObjects account for 77.17%.** ReadObject sent about 2.827 TiB, while WriteObject received about 521 GiB. Metadata and listing responses add traffic beyond ReadObject bytes. These totals include all reported response codes, retries, and callers; they cannot identify `front`, GCS-mounted sandboxes, maintenance, or backfills individually. Hourly means do not reveal second-scale bursts. Method peaks occur independently and must not be summed as a simultaneous peak.

The source gives plausible mechanisms for metadata amplification: generation-aware reads fetch metadata before opening a pinned content stream; GCS directory operations enumerate objects; and directory moves copy then remove. The GCS backend pages listings in batches of 200, while an unbounded listing can collect all matching objects. [Revision handling](../../../../front/lib/api/files/revisions.ts), [GCS backend](../../../../front/lib/api/file_system/backends/gcs_file_system_backend.ts).

DFS should therefore benchmark `stat`, directory enumeration, scoped view initialization, rename, and generation-checked writes alongside payload bandwidth. A cached namespace may avoid repeated GCS metadata calls, but the bucket-level ratio is not a promised reduction or a direct DFS RPC target.

## Consequences for HA and shard placement

Keep **one leader, follower WAL replication, and etcd ownership coordination**. Follower count remains open; followers must support reads, and the writer does not wait for sidecar replication. The new evidence changes the capacity experiment and makes payload placement an explicit comparison:

| Candidate | Replicated state | Capacity and recovery implications |
| --- | --- | --- |
| Payload in RocksDB | Namespace, policy, retry outcomes, and content chunks | One protocol covers metadata and bytes, but logs, catch-up, and snapshots carry the payload |
| Immutable payload in GCS | Namespace, policy, retry outcomes, and immutable blob references | Replica storage and recovery can be smaller; content availability and latency depend on GCS, with a separate retention protocol |

If every current live private object were migrated as payload and copied three times, the raw baseline would be **47.72 TiB**, before metadata, retained replication WALs, indexes, compaction space, and recovery reserve. It excludes historical versions and assumes no compression or deduplication savings. This is a scenario for the complete bucket, not the established migration scope or a billable-storage estimate.

For the external-blob candidate, upload and verify an immutable object before committing its reference; bind identity and integrity to that reference. A committed reference must remain readable by every eligible replica. Define deletion against retained versions, snapshots, retry windows, and recovery, then collect abandoned uploads separately. Source replication cannot substitute for unavailable GCS payloads. Keeping large/cold blobs external while inlining small chunks is another candidate, but a threshold needs a size/access distribution rather than the aggregate average.

With perfectly even placement, full-bucket payload would divide as follows. Counts assume one logical record per current object solely to expose the scale:

| Shards | Live objects per shard | Live payload per replica | Metadata per replica at an illustrative 1 KiB/object |
| --- | ---: | ---: | ---: |
| 32 | 14.29 million | 509.0 GiB | 13.63 GiB |
| 64 | 7.14 million | 254.5 GiB | 6.81 GiB |
| 128 | 3.57 million | 127.3 GiB | 3.41 GiB |
| 256 | 1.79 million | 63.6 GiB | 1.70 GiB |

These are arithmetic scenarios, not proposed shard counts. Partition placement will not be perfectly even, and bytes, node counts, write load, and search load can have different skew. The first HA experiment can still use one or two groups. Production placement needs per-workspace and per-mount distributions, explicit maximums, and a design for a namespace that exceeds them. Scope boundaries already used by `front` are candidates to examine, not proof that cross-scope transactions are unnecessary. A Kubernetes operator would automate lifecycle procedures; it would not resolve these capacity or protocol decisions.

## Kubernetes capacity and recovery costs

Under the illustrative three-copy assumption, 32/64/128/256 shards imply 96/192/384/768 shard replicas, not necessarily that many pods or PVCs. With at most K replicas per storage pod, ceil(R*S/K) is only a capacity lower bound for replication factor R; placement needs at least R nodes and recovery headroom. Separate each shard's replicas across nodes. Pod-wide limits cover every hosted RocksDB/projection and correlated recovery.

Budget each replica PVC (or the aggregate if replicas share a pod PVC) for: source state, retained WAL, Tantivy, projection checkpoints, pinned generations, and concurrent checkpoint/compaction output. Add temporary snapshot installation space and free-space admission. The 47.72 TiB payload scenario excludes all of these costs. Copies of the same shard use independent pod volumes. The current proposal uses per-shard caches under an aggregate process budget, plus a separate replication-sidecar budget; different nodes do not share file caches. [Projection storage](POSTGRES_LESSONS.md#persistent-search-projections-and-pod-recovery).

Size CPU and memory requests for schedulable recovery capacity as well as steady serving, with explicit container limits and room for sidecars. Account for zonal volume topology, detach/attach delay, disk IOPS and bandwidth, cross-zone replication traffic, snapshot transfer, and checkpoint loading. Spread each group's replicas and reserve space for replacements without assuming the failed node's resources remain available. Limit simultaneous recovery across shards so one node drain or failure cannot create an uncontrolled rebuild wave. [Deployment and placement](HA_DESIGN.md#kubernetes-deployment-and-operator-scope).

An intact PVC permits source recovery and verified search-checkpoint reuse; lost storage requires snapshot/replay and potentially full indexing. Neither duration follows from payload bytes alone: metadata cardinality, checkpoint age, replay retention, extraction, and storage throughput matter. Tune checkpoint frequency and retained history together against measured restore time and write amplification. Adding pods alone does not split a tenant or change replication membership; scaling requires explicit shard placement, follower bootstrap, and etcd configuration transitions.

## Consequences for the half-RAM proposal and client cache

A hypothetical 1 KiB resident record for each live object would occupy **436 GiB per logical copy**, before indexes and overlapping generations. The current prototype does not have a measured 1 KiB/object representation, and not every object should become a node. The illustration shows why choosing a cache size cannot establish a bound on an independently growing metadata population.

Retain the [50% managed-memory experiment](POSTGRES_LESSONS.md#a-concrete-memory-experiment), sized against the storage pod's container limit, with per-shard admission budgets. Put evictable caches and admitted work inside that allowance, with separate headroom for native allocations, OS file cache, and recovery. For an 8 GiB container with a proposed 1 GiB metadata allowance, even the illustrative 64-shard scenario would exceed the metadata budget before search or generation overlap. Preallocating four GiB at startup does not change that arithmetic.

Consequently, the scaling experiment must include on-disk authoritative metadata with bounded hot views, compact lookup structures, and limits on pinned generations and snapshots. Full-population maps and complete metadata clones require either strict per-shard limits or redesign. Raising the current default 100,000-node limit is not sufficient evidence of scalability.

For clients, use conversation, pod, or user scope to size mount metadata; never infer a required mount snapshot from the total bucket population. Large scopes need pagination or lazy metadata with explicit watch, invalidation, and authorization semantics. Kernel content pages remain useful for the active payload working set, but they do not bound daemon namespace maps or server snapshots. This connects directly to [client memory ownership](CLIENT_CACHE_DESIGN.md#memory-ownership-and-throughput).

## Measurements that should decide the next prototype

1. **Establish migration scope.** Separate canonical attachments, mounted files, filesystem blobs, MCP outputs, checkpoints, frame state, and retained generations. Prefer an existing inventory or an offline inventory job over synchronously listing hundreds of millions of objects.
2. **Measure skew and the hot set.** For the selected classes, obtain bytes, object/node count, size quantiles, age, and access/write rates by workspace and mount scope. Bucket metrics cannot supply these distributions.
3. **Scale metadata independently of bodies.** Start beyond the existing 100k corpus with synthetic million-node cases, then increase only within explicit resource allowances. Measure steady and overlapping-generation memory, startup, view creation, listing, and index refresh. Add skewed hot scopes and short bursts; historical hourly averages are insufficient.
4. **Compare payload placements under failure.** At equal resources, compare inline replicated chunks with immutable GCS references, including election, missing/stalled blob reads, replacement-replica catch-up, and garbage collection. Record replicated-write acknowledgment latency, snapshot size, restore time, and availability of both source reads and search.
5. **Test retention and admission together.** Reproduce mounted copies, processed content, retained versions, slow readers, and abandoned uploads. Report logical file count separately from object versions, index documents, and physical bytes.
6. **Measure Kubernetes recovery at equal limits.** Compare steady serving, a one-file namespace update, same-PVC cold restart, lost-PVC follower replacement, rolling updates, and a multi-shard node failure. Record source/search readiness separately, lookup checkpoint bytes/load time, replay work, temporary disk use, network traffic, peak cgroup memory, CPU throttling, and foreground latency. Include client remount bursts; successful process restart alone is not recovery evidence.

This investigation supplies a capacity envelope and code-derived workload model. It leaves per-class attribution, tenant skew, hot-set size, short-burst traffic, and the final shard count unmeasured. Implementation checks and synthetic benchmarks belong in `dust-dev` under [the deployment rules](../DEPLOYMENT.md); this production-project access was read-only sizing inspection.
