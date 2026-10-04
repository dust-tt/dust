# v2 implementation

Implement [DESIGN.md](DESIGN.md) in small, tested milestones; commit and push each completed group.
Keep v1 and its results intact. The local implementation, failure tests, Linux FUSE validation, and
benchmarks are complete; see [bench/RESULTS.md](bench/RESULTS.md). Cloud work remains out of scope.

**Constraints:** FDB must remove the single-writer requirement, including within one workspace.
Exclusive workspace owners and RAM acknowledgment with asynchronous FDB publication are rejected.
Keep the exact API and unchanged v1 client: compound/bulk RPCs, client batching, and additional
deferred publication are out of scope. See [design constraints](DESIGN.md#non-negotiable-constraints).

## 0. Scope and contracts

- [x] Define the v1 compatibility boundary, `/shared` change, FDB/ES architecture, and localhost scope.
- [x] Create the v2 Rust server workspace; reuse the unchanged v1 protocol/client/FUSE crates.
- [x] Port relevant contracts, replacing SlateDB/LanceDB assumptions with transaction, isolation,
      search-publication, and `/shared` requirements. Preserve client contracts and RPC error details.
- [x] Add configuration for FDB cluster file/subspace and ES URL/index; no v2 GCS dependency.

## 1. Reproducible local services

- [x] Pin FDB server/native-client/Rust-binding and ES versions; verify host/container architecture.
- [x] Provide one-command local FDB/ES startup, initialization, readiness, logs, and stop commands.
- [x] Use one FDB node and one ES node, persistent volumes, configurable budgets, and local-only access.
- [x] Verify advertised FDB addresses from dfs-server and connectivity from the Linux FUSE container.
- [x] Add isolated per-test FDB prefixes/ES indexes and explicit fixture reset; preserve other data.
- [x] Smoke-test FDB transaction/restart persistence and ES bulk/search/refresh before filesystem work.

## 2. FoundationDB storage

- [x] Port workspace-prefixed key families, ordered scans/cursors, format marker, and 64 KiB blocks.
- [x] Keep compact Postcard metadata in one FDB value; cover maximum binary xattrs without new API limits.
- [x] Implement short read views and transaction-scoped writes; bound lifetime, bytes, and conflicts.
- [x] Implement bounded retries for known aborts; preserve expected versions and surface unknown commits.
- [x] Add atomic range clears for content, tail trimming, and bounded reverse-grant cleanup.
- [x] Test snapshot consistency, rollback, size/time boundaries, and durable reopening after process loss.

## 3. Filesystem API and projections

- [x] Port workspace/session creation, expiration/closure, workspace keys, and grant administration.
- [x] Port stat/lookup/list, create, rename/remove, metadata/xattrs, read/write/append/truncate, and fsync.
- [x] Keep authorization/preconditions in the committing transaction; preserve session-close coordination.
- [x] Remove `/shared` ancestor-reachability suppression in both list and lookup; retain direct-grant
      eligibility, ID deduplication/cursors, reserved `shared`, and workspace-root exclusion.
- [x] Test entries visible in both root and `/shared`, granted ancestors plus descendants, multi-grant
      duplicates, moves, revocation, pagination, hidden ancestry, and cross-workspace isolation.
- [x] Test competing writers, independent-file progress, sparse files, shrink/re-extension, unlink,
      failed commits, and exact v1 gRPC compatibility before adding search.

## 4. Elasticsearch schema and pending work

- [x] Create a shared index with strict mappings, mandatory workspace routing, and composite document IDs.
- [x] Match token-search/filter semantics; map metadata, exact timestamps, xattr keys/equality digests,
      excerpts, extraction status, and internal deletion tombstones.
- [x] Atomically enqueue/coalesce file work in every relevant FDB mutation, including rename replacement.
- [x] Port status and resumable initial/rebuild backfills; no descendant work for directory grants/moves.
- [x] Test enqueue rollback, workspace separation, unchanged RPC limits, large/binary xattrs, and analyzers.

## 5. In-process indexing

- [x] Read version/token-checked chunks in short FDB transactions; remove source durability polling.
- [x] Preserve bounded parallel extraction, skips, and count/serialized-byte bulk budgets.
- [x] Add ordered conditional ES writes, tombstones, per-item handling, and refresh-before-completion.
- [x] Complete only matching FDB job tokens; retain failures with backoff and fair workspace scheduling.
- [x] Test old completions, delayed/ambiguous bulk results, partial bulk failures, crashes between ES
      and FDB, ES downtime, and rebuild without duplicate backfill work.
- [x] Exercise content edits/unlink during multi-chunk extraction.
- [x] Record extraction, ES commit/refresh, retry, queue lag, and completion timings; bound shutdown.

## 6. Search API and live grants

- [x] Translate existing typed filters into ES queries with mandatory workspace and live-document filters.
- [x] Implement bounded PIT/search-after candidate expansion, deterministic tie-breaking, and PIT cleanup.
- [x] Authorize/version-check candidates in FDB with per-search memoization; verify xattr predicates.
- [x] Handle expired FDB views without mixing snapshots; retain partial/error and session-check semantics.
- [x] Exercise FDB view expiry during candidate expansion and partial ES shard/bulk failures.
- [x] Serve unchanged SearchFiles/GetIndexStatus responses and test through the existing CLI/client.
- [x] Port search regressions: live ancestor grants, moves, stale/deleted files, selective permissions,
      512 grants, metadata/MIME/xattrs, budget exhaustion, index unavailability, and workspace isolation.

## 7. Local end-to-end validation and benchmarks

- [x] Run Rust checks and existing transport/filesystem/search tests against real local FDB and ES.
- [x] Run Linux two-mount tests with the unchanged v1 client, including kernel caching/writeback,
      aliases, revocation, conflicts, fsync errors, unlink, and server restart/session loss.
- [x] Test FDB/ES process restarts and interrupted commits/indexing; preserve acknowledged FDB data.
- [x] Adapt jd's unchanged filesystem workload and 10,000-file search harness to v2 configuration.
- [x] Measure cold/warm filesystem/search performance, client drain, FDB commits/retries, index drain,
      grants, `/shared`, and simultaneous/idle workspaces; verify results before recording timings.
- [x] Document cache state separately for dfs-server, FDB, ES, and OS. Restart before each cold case;
      label backend-warm tests honestly and record any inability to clear backend/OS caches.
- [x] Publish v2 benchmark tables, versions, hardware/resources, setup/reproduction commands,
      and limitations. Keep original v1 measurements and distinguish their GCS topology/durability.
- [x] Audit API/client compatibility and contracts; complete local setup, tests, and benchmarks before
      starting the cloud phase.

## 8. Filesystem ancestry read hints

- [x] Keep bounded, workspace-scoped directory/parent ID hints; populate reads and new directories.
- [x] Prefetch live ancestor records/grants in bounded windows and verify the actual chain in the
      same FDB transaction; preserve fallback, conflict detection, and expected versions.
- [x] Test deep paths, cache bounds/isolation, and moves/revocations from another server, including
      changes between a write's authorization reads and its commit.
- [x] Rerun unchanged Linux FUSE/filesystem workloads; retain baseline tables and record comparisons.

## 9. Write performance with the exact existing API

- [x] Profile untar transaction phases: read-version acquisition, authorization/precondition reads,
      block preparation, commit, retries, and local lock waits; measure background indexing impact.
- [x] Parallelize independent create checks and other independent reads within each transaction,
      retaining conflict tracking and existing error behavior.
- [x] Skip old-block reads only when live metadata proves no existing bytes need preservation;
      parallelize partial-block reads with bounded concurrency.
- [x] Use the profile to remove redundant server work without changing object-version increments,
      publication boundaries, or public semantics; avoid root-specific optimizations.
- [x] Verify changes against independent server writers, including concurrent moves/grant changes,
      conflicting writes, sparse writes, and truncate/re-extension.
- [x] Rerun untar and the unchanged filesystem workloads; retain prior results and document gains
      with the same client, API, and durable acknowledgment boundary.

## 10. Sequential latency milestones

Implement and benchmark each group before starting the next. Preserve full tables in `bench/RESULTS.md`,
with the unchanged client/workload and normal durable commits. Keep generated JSON reports local;
retain text reports.

- [x] Tune FDB read-version/commit batching and short timer waits; validate independent writers and
      record the full filesystem benchmark, including untar.
- [x] Reuse a recent successful commit version for the first mutation attempt; refresh rejected,
      conflicting, expired, or read-only attempts. Verify cross-server freshness and record a new run.
      Removed in section 11: the measured benefit did not justify the extra transaction logic.
- [x] Start independent lookup/authorization reads earlier using bounded advisory hints; preserve
      snapshot checks/error ordering, verify deep moves/grants, and record a third full run.

Results: [full tables](bench/RESULTS.md). Untar: **197.439 → 44.301 → 43.066 →
36.421 seconds**. All three milestones retain the API/client and normal durable commits. The
30-second untar target remains unmet; these are single-run local measurements.

## 11. Simplify transactions and isolate FDB tuning effects

- [x] Remove commit-version reuse and its fallback logic; obtain fresh read versions on every attempt.
- [x] Re-run the full filesystem suite and independent-writer benchmark; preserve previous results.
- [x] Compare all defaults, all tuned, each setting alone, and each setting removed from all tuned.
      Treat client/server busy-wait as separate settings; repeat deep-folder untars and record exact
      configuration, validation, CPU, and timing results. Restore the normal local configuration.
- [x] Publish the ablation results and identify interactions without claiming production scalability.

Recorded 36 deep-folder untars (12 configurations × 3 repeats), 12 independent-writer checks,
and full 10,000-file suites after removing reuse and for the GRV/default versus tuned comparison.
All passed; original local FDB settings restored. The first no-reuse untar was 35.563 s; later
full runs measured 38.346 s tuned and 40.265 s with default GRV. The short ablation showed no clear
GRV-cap benefit, so that setting's effect remains workload-dependent/uncertain. See
[all results](bench/RESULTS.md); the other four settings have larger demonstrated effects.

## 12. Current v2 baseline

- [x] Keep commit-version reuse removed and restore FDB's default 5 ms GRV batching timeout in
      server/Compose defaults. Preserve the other four settings and overlapping metadata reads.
- [x] Rebuild and rerun the full filesystem benchmark, including 10,000-file untar, plus the
      independent-writer checks. Record the current configuration and retain historical tables.
- [x] Publish a latest filesystem table at the top of `bench/RESULTS.md`.
- [x] Run the current server against 100,000 files with the same directory topology and file sizes;
      preserve the 10,000-file baseline and publish the full validated table and untar timing.
      Raise only the FUSE live inode cap to 1,000,000; the first traversal exhausted the former
      100,000-entry limit because it also counts directories and mount entries.

## Future work: after the local benchmark

- [ ] Deploy shared FDB/ES clusters and dfs-server to `dust-dev` with private access and credentials.
- [ ] Configure replication, storage, backups/recovery, observability, and resource budgets.
- [ ] Repeat workloads in GCP and evaluate contention, cost, and scaling across many workspaces.
- [ ] Add multi-server deployment/shared session routing, indexer scheduling, online index replacement,
      tombstone cleanup, and large-workspace shard distribution when needed. Independent-writer
      correctness is already required; workspace writer ownership is not a future option.
