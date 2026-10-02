# v2 implementation

Implement [DESIGN.md](DESIGN.md) in small, tested milestones; commit and push each completed group.
Keep v1 and its results intact. The local implementation, failure tests, Linux FUSE validation, and
benchmarks are complete; see [bench/RESULTS.md](bench/RESULTS.md). Cloud work remains out of scope.

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
- [x] Publish v2 benchmark tables/raw results, versions, hardware/resources, setup/reproduction commands,
      and limitations. Keep original v1 measurements and distinguish their GCS topology/durability.
- [x] Audit API/client compatibility and contracts; complete local setup, tests, and benchmarks before
      starting the cloud phase.

## Future work: after the local benchmark

- [ ] Deploy shared FDB/ES clusters and dfs-server to `dust-dev` with private access and credentials.
- [ ] Configure replication, storage, backups/recovery, observability, and resource budgets.
- [ ] Repeat workloads in GCP and evaluate contention, cost, and scaling across many workspaces.
- [ ] Consider multiple API processes/shared sessions, indexer ownership, online index replacement,
      tombstone cleanup, and large-workspace shard distribution only when measurements require them.
