# Qdrant shard rebalancing suggestions

Run from `core/` with `QDRANT_CLUSTER_0_URL` and `QDRANT_CLUSTER_0_API_KEY` set.
The script reads the cluster and prints suggestions. It never executes moves.

## Point mode

```sh
cargo run --bin qdrant_shard_rebalance_suggestions -- --max-moves 10
```

Point mode chooses the admissible single-replica move with the largest decrease
in point-count variance on each iteration. It has no default 10% stopping target.
Use `--target-relative-sd 0.05` to stop at 5% SD / mean, or
`--min-relative-improvement 0.01` to require at least a 1% variance reduction per move.

## Memory mode

Choose one source of replica weights:

```sh
# Preferred: use per-replica component RAM reports.
cargo run --bin qdrant_shard_rebalance_suggestions -- \
  --replica-memory-reports /tmp/replica-memory.json

# Explicit fallback: estimate replica RAM from each source peer's point distribution.
cargo run --bin qdrant_shard_rebalance_suggestions -- --estimate-memory
```

Both modes fetch fresh allocator-resident telemetry from every peer. Missing
statistics or mismatched peer identities stop memory planning. The default maximum
age for placement, telemetry, and imported measurements is 300 seconds. Change it
with `--memory-max-age-seconds`.

Memory mode recommends **at most one move**. Execute it only after checking current
state and capacity. Wait for completion, then rerun the script. Point-mode stopping
flags cannot be used in memory mode.

The planner first prefers the most pressured peer that has an admissible improving
move. It then chooses the largest decrease in the source/destination pair's maximum
pressure. Without capacity data, pressure means allocator-resident bytes. With
cgroup data, pressure means physical cgroup usage divided by its memory limit.
Point variance may increase.

### Per-replica component reports

`--replica-memory-reports` takes a JSON array. Include exactly one entry for every
replica in the current placement, across all collections. Replace the example
timestamp and values with fresh measurements.

```json
[
  {
    "collection": "c_openai_text-embedding-3-large-1536",
    "shard_id": 47,
    "peer_id": 8362043103170564,
    "observed_at": "2026-10-03T12:00:00Z",
    "ram_bytes": 12500000000
  }
]
```

`ram_bytes` is the replica's total non-evictable component RAM, excluding cached
bytes. Obtain local-replica reports through Qdrant Support or the internal
`GetShardMemoryReport` service, then normalize their totals into this format.
A collection-wide `/memory` report cannot be used as a replica report.

The script rejects missing, duplicate, stale, future-dated, or unknown replicas.
It also rejects component totals exceeding the peer's measured allocator-resident
memory. It leaves the difference between component totals and process memory on
the source when estimating a move. It never fills missing reports with point-based
estimates.

### Proportional estimates

`--estimate-memory` uses:

```text
replica bytes = source allocator-resident bytes × replica points / source total points
```

This assumes equal bytes per point within a peer and allocates shared process
overhead to replicas. The output labels the weights as estimates. A peer with
replicas but zero total points cannot be estimated and requires component reports.
Peers with no replicas remain eligible destinations.

### Optional physical usage and capacity checks

Add `--cgroup-memory /tmp/cgroup-memory.json` to either memory mode. The file must
contain one fresh reading for every peer, using the Qdrant container's current
cgroup usage and verified memory limit, all in bytes:

```json
[
  {
    "peer_id": 8362043103170564,
    "observed_at": "2026-10-03T12:00:00Z",
    "used_bytes": 105000000000,
    "limit_bytes": 128000000000
  }
]
```

Use matching measurement scopes, such as cgroup v2 `memory.current` and
`memory.max`, or provider-supplied equivalents for the same container. Unlimited
or missing limits are unsupported. Do not substitute host RAM size for a container
limit, or allocator-resident bytes for cgroup usage. Partial coverage, invalid
limits, and cgroup usage below measured allocator memory cause an error.

The default `--transfer-overhead-ratio 0.25` reserves an extra 25% of replica RAM on
both peers. During transfer, the source keeps its existing usage plus that allowance.
The destination must fit its existing usage, the entire replica, and the allowance.
The source must stay within its supplied limit. The destination must also preserve
the free fraction set by `--memory-headroom-ratio`, which defaults to 15%.

These are advisory estimates. Source allocator memory may not fall immediately,
and additional page-cache use is not predicted. The transfer allowance is
configurable; it is not a measured upper bound. Without cgroup data, the script
still ranks heap pressure but reports physical headroom as unknown.

## Placement restrictions

Both objectives reject destinations already hosting the same collection/shard.
Peers involved in non-active replicas or transfers, and all copies of affected
shards, are excluded. Resharding or inconsistent placement views stop planning.
Measurements are gathered sequentially and do not form an atomic snapshot.
