# v1: minimal high availability

**Proposal — 2026-10-04.** Keep one writer per shard, with one standby in another zone and GCS as
shared storage. Budget **8–12 engineer-weeks** for a minimal, tested implementation. Ship transparent
planned handoffs first; crash transparency requires a separate durability decision. This retains a
small storage footprint, but ownership, sessions, retries, and failure testing become ours.

**What exists.** [v1](DESIGN.md) runs SlateDB 0.17.0 over GCS; local SSDs are disposable read caches,
not authoritative disks (`--local-store` is test-only). RPCs and `fsync` acknowledge server memory;
crashes can lose acknowledged writes. Recovery discards caches and sessions; FUSE stops on session loss
and retains ambiguous write errors. Shutdown already drains RPCs, stops search, and flushes SlateDB.

**Minimal topology.** Two full-capacity servers, a stable HA gRPC endpoint, and an ownership lease in
the existing HA orchestrator (otherwise additional infrastructure work). Only the owner serves requests
and runs the LanceDB worker. Standby startup must not open a writable `Db`: that fences the current
writer. Optional `DbReader` warming needs cache lifecycle work; promotion still opens a new `Db` and
replays WAL. SSD loss increases GCS reads and latency, without requiring a full database copy.
See SlateDB's [readers](https://slatedb.io/docs/design/readers/) and
[fencing protocol](https://slatedb.io/rfcs/0030-pluggable-wal/).

Ownership loss closes admission and stops background work; SlateDB fencing/errors withdraw readiness.
Before promotion, confirm the old process stopped or fence its VM. Lease expiry/failed health checks
alone are insufficient: SlateDB fencing does not immediately stop memory acknowledgements or LanceDB
commits. If fencing cannot be proven, remain unavailable. Recovered nodes rejoin as standby.

**Client continuity is required.** Store sessions, expiry, and revocation in SlateDB. Add stable request
IDs, payload hashes, and results recorded atomically with mutations, including namespace/admin
operations. Authenticate retries and resolve receipts before version checks, preserving live
authorization. Bound retention to the retry window; reject expired retries. Clients reconnect
with bounded queues/backoff, retaining operation IDs and expected versions. Lost replies must not
duplicate mutations or poison FUSE writeback. Conflicts, expired sessions, and exhausted deadlines still
fail. Extend today's 30-second RPC budget to cover recovery. Preserve mount identity, recovery epoch,
and dirty-page versions through clean handoff.

**Deployment sequence.** Start and preflight the new version as standby; require compatible protocol,
stored data, and receipts. Hold new calls in clients; drain accepted RPCs, stop the search worker, flush
SlateDB, and close the old writer. Transfer ownership, open the replacement, recover sessions/receipts,
refresh search caches, then publish readiness and resume calls. Replace the old standby. Abort before
takeover if drain fails; afterward, rollback uses another handoff. Cached reads continue while RPCs
stall: “no downtime” means no errors/remounts within the recovery budget. Target **5–15 seconds** added
latency, to validate under load; the [benchmark](bench/RESULTS.md) already measured a **5.57-second**
persistence drain before reopen costs.

**Node failure: choose the guarantee.** Detect loss, fence the former owner, recover the standby from
GCS, then switch routing. Target **10–60 seconds**, plus slower cold reads. Slow fencing, GCS, or overload
can exceed these unmeasured targets.

| Mode | Crash behavior | Performance consequence |
| --- | --- | --- |
| Preserve memory acknowledgements | Lose an acknowledged suffix, unbounded during GCS trouble. Advance a recovery epoch and reject pre-crash mounts before processing requests; reconcile/remount because cached versions cannot safely survive rollback. | Retains the fast path. Planned handoffs can be transparent; crashes are not. |
| **Recommended for transparent crashes** | [Await GCS WAL durability](https://docs.rs/slatedb/0.17.0/slatedb/struct.WriteHandle.html#method.await_durable) for mutations, sessions, revocations, and receipts; expose only durable state. No acknowledged server state lost on node failure. | Adds WAL batching/upload latency. Client-only buffered data remains non-durable. Rebenchmark the advantage over FDB. |

Synchronous replication to another server could preserve lower write latency, but adds a replicated
log, catch-up, and recovery protocol; exclude it. Search asynchronously replays its durable queue after
takeover, with only one index writer.

**Work estimate.** Engineering judgment, assuming existing deployment/LB/control-plane infrastructure:

| Workstream | Engineer-weeks |
| --- | ---: |
| Roles, lease/routing, infrastructure fencing, health/progress checks | 1–2 |
| Persisted sessions, atomic receipts, reconnect/retry and FUSE semantics | 2–3 |
| Deployment drain/promotion, search/cache lifecycle, compatible rollback | 1–2 |
| Durable acknowledgements and consistent durable read visibility | 1–2 |
| Failure injection, load measurements, alerts and recovery runbooks | 2–3 |

Allow roughly **6–8 elapsed weeks with two engineers**; revisit after a first-week fencing/recovery
spike. An early deployment-only milestone, including handoff tests, is roughly **4–6 engineer-weeks**.
Test lost replies, crashes during flush/handoff, partitions/zombie owners, SSD loss, search commits,
and surviving mounts.

Expect approximately **2× server/RAM/SSD capacity per shard**, plus cache warming/GCS traffic and
failover drills. FDB supplies storage replication, transactional concurrency, and recovery; session/client
work remains. Current v1 memory-ack timings and [v2's durable commits](../v2/gcp/README.md) are different
guarantees. Multi-region recovery, GCS/control-plane outages, resharding, and backup/PITR are excluded.
Implementation must revise existing
[contracts](CONTRACTS) for sessions, memory acknowledgements, retries, and cache lifecycle; current
behavior is unchanged by this proposal.
