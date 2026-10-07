# Permission tree memory and access measurements

These are synthetic in-memory builder/access measurements. Actual empty-process FDB bootstrap
measurements for the persistent 1M and 10M fixtures are in [SEARCH.md](SEARCH.md#durable-scale-fixture-2026-10-07).
The later 100M FDB population/warmup was deferred; it is separate from the completed synthetic cases.

All six **1M / 10M / 100M** cases completed on 2026-10-07 using the production `dfs-core` Builder,
Tree and TenantTree evaluators. This is an in-memory measurement on the GCP n2-standard-8 workload
VM (x86-64, 32 GiB), one thread in a fresh container per case, with a 20 GiB memory limit and no
network. No builds/tests ran concurrently on that VM. Prior interactive service states were restored.

The UUID lookup is `Tree::contains`. A tree permission check is `Tree::allows`, including the
ancestor/grant walk. A checked authorization is `TenantTree::authorize_object`, including its read
lock, sorted-session-grant validation, freshness proof and current-parent check. It excludes the
FDB metadata read that supplies that parent, tenant-manager lookup, RPC, session authentication,
and concurrent feed-update contention. These are not end-to-end request latencies.

## Memory

| Objects including directories | Path depth | Directory paths | Accounted tree (GiB) | Post-build RSS (GiB) | Build peak RSS (GiB) | Builder accounted (GiB) | Build + validate (s) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000,000 | 8 | 128 | 0.085 | 0.076 | 0.096 | 0.091 | 0.449 |
| 1,000,000 | 64 | 128 | 0.093 | 0.080 | 0.099 | 0.099 | 0.469 |
| 10,000,000 | 8 | 1,024 | 0.787 | 0.481 | 0.684 | 0.906 | 5.504 |
| 10,000,000 | 64 | 1,024 | 0.796 | 0.487 | 0.714 | 0.915 | 5.899 |
| 100,000,000 | 8 | 16,384 | 6.373 | 3.877 | 5.236 | 7.250 | 81.535 |
| 100,000,000 | 64 | 16,384 | 6.381 | 3.871 | 5.230 | 7.258 | 87.743 |

At 100M objects, the conservative tree charge is **6.37–6.38 GiB**, about **68.4–68.5 bytes/object**.
Measured process RSS immediately after construction was **3.87–3.88 GiB**, with **5.23–5.24 GiB** peak
during construction. Accounted capacity and resident pages are different quantities; use the charge
for admission planning. These measurements exclude file names, content and inherited-grant copies.
ObjectId is 16 bytes; ObjectRef is 17 bytes.

The 8-directory-depth cases attach one explicit grant to 1% of objects, drawn from 64 shared sets.
The 64-directory-depth cases attach one grant to 10%, drawn from up to 65,536 shared sets. Every
query session has one grant. Unique or larger explicit grant sets add memory and comparison work;
this is not a worst-case ACL footprint. Directory paths share the root, with leaf fanout distributed
across 128 / 1,024 / 16,384 chains as object count grows; the largest deep case has 1,032,193
directories. Ancestors may remain hot, but queries do not all share one chain.

Production admission reserves three times builder accounting for allocation headroom. A 100M
bootstrap therefore needs roughly **22 GiB of configured peak reservation**, plus other tenants and
staging; the default 1 GiB per-tenant / 8 GiB aggregate limits fall back to FDB. The isolated benchmark
bypasses admission to measure the data structure; it does not prove a 100M FDB bootstrap/feed deployment.

## Access times

Means are the median of three aggregate passes of one million precomputed pseudorandom queries.
Percentiles use a separate 100,000 individually clocked query sample per operation and include timer
overhead (median empty timer: 22ns); they are not percentiles of the aggregate samples. ID/parent
construction is outside these timings. Every returned decision is checked. Warmup precedes each
operation. Allow and deny both verify the ancestor chain to the root.

| Objects | Depth | UUID lookup mean (µs) | Tree allow mean (µs) | Tree deny mean (µs) | Checked allow mean (µs) | Checked deny mean (µs) | Checked allow p50 / p95 / p99 (µs) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000,000 | 8 | 0.184 | 0.448 | 0.392 | 0.589 | 0.573 | 0.726 / 1.044 / 1.202 |
| 1,000,000 | 64 | 0.176 | 0.620 | 0.563 | 0.783 | 0.749 | 0.866 / 1.211 / 1.426 |
| 10,000,000 | 8 | 0.300 | 0.628 | 0.574 | 0.845 | 0.816 | 1.002 / 1.370 / 1.595 |
| 10,000,000 | 64 | 0.299 | 0.916 | 0.843 | 1.082 | 1.069 | 1.213 / 1.603 / 1.844 |
| 100,000,000 | 8 | 0.363 | 0.831 | 0.760 | 1.200 | 1.166 | 1.385 / 1.823 / 2.080 |
| 100,000,000 | 64 | 0.382 | 1.425 | 1.425 | 1.876 | 1.751 | 1.901 / 2.386 / 2.690 |

At 100M objects, a checked allow averaged **1.20µs at depth 8** and **1.88µs at depth 64**; sampled
p99s were **2.08µs** and **2.69µs**. Pure UUID lookup averaged **0.36–0.38µs**. This is roughly
0.53–0.83 million individually checked allows/second on one benchmark thread, without RPC/FDB work.

Search-style candidate filtering uses `TenantTree::authorize` in batches of 256, including the lock,
proof, result-vector allocation and decision checks. It does not execute a search engine.

| Objects | Depth | Allowed candidate (µs) | Denied candidate (µs) |
| ---: | ---: | ---: | ---: |
| 1,000,000 | 8 | 0.414 | 0.374 |
| 1,000,000 | 64 | 0.601 | 0.585 |
| 10,000,000 | 8 | 0.628 | 0.579 |
| 10,000,000 | 64 | 0.915 | 0.872 |
| 100,000,000 | 8 | 0.793 | 0.785 |
| 100,000,000 | 64 | 1.426 | 1.430 |

The precomputed query vector uses 33 MiB, reported separately from tree memory. RSS after query
allocation is also recorded in the raw output; the memory table above is sampled before allocation.

```sh
cargo build --release -p dfs-core --example tree_scale
# NODES DEPTH GRANT_EVERY DISTINCT_SETS PATHS
./target/release/examples/tree_scale 100000000 64 10 65536 16384
```

Binary SHA-256: `e810a3b8e11ab0cbb1e9d5addfc462827cb2b0fb1646ae966eaae98c65eb7e10`.
Raw report: `/var/log/dfs-bench/v5/tree-access-20261007-b/run.json` on dfs-v2-spolu-workload.
The driver is `/tmp/dfs-v5-tree-access-driver.py` on that VM. Each case has a separate JSON report.
The earlier single-chain results below are retained for comparison; their throughput included ID
generation, and their paths stayed hotter, so they are not directly interchangeable with this table.

# Earlier shared-chain measurements

Synthetic measurements on 2026-10-07, using the real `dfs-core` Builder and Tree evaluator. All six cases completed, verified two million allow/deny decisions each, and restored prior interactive service states.

Each case ran as a fresh x86-64 process on the dust-dev workload VM (n2-standard-8, 32 GiB). Containers had no network and a 20 GiB memory limit, with no concurrent builds/tests. The single-threaded benchmark uses deterministic, unique UUIDv4-shaped fixture IDs; production IDs remain random UUIDv4.

The topology is one directory chain plus leaf fanout. Shallow cases attach grants to 1% of nodes, using up to 64 shared explicit sets. Deep cases attach grants to 10%, using up to 65,536 sets. Every allow query must reach the root grant; deny queries also walk the chain. Shared ancestors stay hot, so these figures do not predict arbitrary-tree or RPC throughput. Timings include deterministic query-ID generation.

| Nodes | Directory chain | Grant density | Tree accounted (GiB) | Builder accounted (GiB) | Peak process RSS (GiB) | Build + validate (s) | Allow checks/s | Deny checks/s | Index occupancy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000,000 | 8 | 1% | 0.085 | 0.091 | 0.095 | 0.441 | 2,297,071 | 2,370,529 | 54.5% |
| 1,000,000 | 64 | 10% | 0.093 | 0.099 | 0.099 | 0.484 | 1,637,708 | 1,716,261 | 54.5% |
| 10,000,000 | 8 | 1% | 0.787 | 0.906 | 0.684 | 5.226 | 1,700,248 | 1,702,912 | 68.1% |
| 10,000,000 | 64 | 10% | 0.796 | 0.915 | 0.714 | 5.631 | 1,238,835 | 1,261,631 | 68.1% |
| 100,000,000 | 8 | 1% | 6.373 | 7.250 | 5.237 | 64.816 | 1,262,176 | 1,289,749 | 85.1% |
| 100,000,000 | 64 | 10% | 6.381 | 7.258 | 5.230 | 67.458 | 961,456 | 1,017,340 | 85.1% |

ObjectId is 16 bytes and ObjectRef is 17 bytes in every run. Occupancy uses the Rust HashMap-reported usable capacity, not its internal bucket count. Accounted bytes include spare vectors/index capacity and conservative overhead; process RSS includes allocation and builder history. The peak includes construction and graph validation. This is an in-memory bootstrap measurement, not a 100M-object FDB ingestion/feed benchmark.

The measurement deliberately bypasses the server admission limit to characterize large trees inside the container limit. Production bootstrap reserves conservative reallocation headroom (three times current builder accounting), so a 100M-node tree needs a substantially larger configured tenant/global peak budget than its steady tree size. The default 1 GiB tenant peak intentionally falls back to FDB for such trees. This table does not establish support for 100M nodes under default server admission settings.

The service algorithms used by the primary local/GCP benchmark are unchanged. A read-only `Tree::index_capacity` diagnostic and this example were added afterward; the original benchmark source/binary hashes continue to identify those measured builds.

```sh
cargo build --release -p dfs-core --example tree_scale
./target/release/examples/tree_scale 100000000 64 10 65536
```

Measurement binary SHA-256: `95743bcf6747922084b7f4897097c5e4609b1aeef9c62c8e16eb3b7757b5b3a9`.
Raw report: `/var/log/dfs-bench/v5/tree-scale-20261007-a/run.json` on dfs-v2-spolu-workload. Each case also has its own JSON report. The operator driver is `/var/log/dfs-bench/v5/tree-scale-driver.py`.
