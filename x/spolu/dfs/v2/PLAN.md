# v2 implementation

Implement [DESIGN.md](DESIGN.md) in small, tested milestones; commit and push each completed group.
Keep v1 and its results intact. The local implementation, failure tests, Linux FUSE validation, and
benchmarks are complete; see [bench/RESULTS.md](bench/RESULTS.md). The next phase uses the manually
provisioned `dust-dev` fixture in [gcp/README.md](gcp/README.md).

**Constraints:** FDB must remove the single-writer requirement, including within one workspace.
Exclusive workspace owners are rejected. The server-writeback project permits bounded RAM
acknowledgment, with normal transactional persistence and durable file fsync.
Keep the exact API; the approved xattrs project may change the shared v1 FUSE client. Compound/bulk
RPCs and new client batching are out of scope. File RAM acknowledgment is explicitly scoped in the
server-writeback project; namespace operations retain synchronous durability. See [design constraints](DESIGN.md#non-negotiable-constraints).

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

## 12. Local v2 baseline before the networked experiment

- [x] Keep commit-version reuse removed and restore FDB's default 5 ms GRV batching timeout in
      server/Compose defaults. Preserve the other four settings and overlapping metadata reads.
- [x] Rebuild and rerun the full filesystem benchmark, including 10,000-file untar, plus the
      independent-writer checks. Record the current configuration and retain historical tables.
- [x] Publish a latest filesystem table at the top of `bench/RESULTS.md`.
- [x] Run the current server against 100,000 files with the same directory topology and file sizes;
      preserve the 10,000-file baseline and publish the full validated table and untar timing.
      Raise only the FUSE live inode cap to 1,000,000; the first traversal exhausted the former
      100,000-entry limit because it also counts directories and mount entries.

## 13. Networked dust-dev validation

- [x] Manually provision isolated private networking, three FDB hosts in distinct zones, and a
      workload VM. Scripts must not create or delete cloud resources; always target `dust-dev`.
- [x] Install pinned FDB 7.3.69 with double replication, three coordinators, local SSDs, and GCP-zone
      failure domains. Verify healthy replication and expanded boot filesystems.
- [x] Install the Linux FUSE development container and single-node ES on the workload host.
- [x] Run Rust/filesystem/search tests and independent-server writer checks against networked FDB.
- [x] Verify acknowledged data and new commits with each FDB host stopped in turn; restore health.
- [x] Run 10,000 files, retain the corpus, then repeat with another 10,000 files in a separate
      workspace on the same cluster. Publish both full tables, untar/writeback, normalized comparison,
      and topology/cache-aware findings in `gcp/RESULTS.md`.
- [x] Restart the three FDB services without latency tuning and repeat the 10,000-file suite with
      client defaults, retaining existing corpora. Record cache/data differences and restore tuning.
      Untar: 505.715 s versus 529.947 s tuned; all checks passed, original settings restored.
      Proxy placement also changed, so this does not isolate the knobs' causal effect.
- [x] Adopt native FDB latency defaults for the server, local/GCP launch configuration, and benchmark
      metadata; keep historical results and explicit ablation profiles. Apply to the live cluster.
- [ ] Run 100,000 files on the live cluster (deferred at user request).

## 14. Networked read scheduling and transaction-role locality

- [x] Overlap create UUID collision checks with the first metadata/authorization wave; prefetch one
      requested content block in that same transaction and preserve validation/error ordering.
- [x] Add bounded, workspace-scoped name-to-ID hints; overlap hinted child reads with the live index
      and reject stale hints on moves, replacement, deletion, or revoked access.
- [x] Validate contracts, Rust regressions, Linux FUSE behavior, and independent writers.
- [x] Run the unchanged 10k untar and full filesystem suite before changing FDB topology.
      Untar 593.898 s; all 24 DFS/local checks passed, with unchanged proxy placement during the run.
- [x] Manually provision the preferred transaction VM in zone `a`, leaving FDB uninstalled.
- [x] After the first benchmark, join six preferred GRV/commit/master/resolver processes to the
      existing replicated cluster.
- [x] Verify actual recruitment, durable commits, independent writers, transaction-node loss, and
      whole-zone loss; keep the three durable nodes/coordinators and native latency defaults.
      All five service-failure cases passed; all preferred roles returned to the new node.
      Two independent servers completed 100 verified same-workspace writes in 0.352 s.
- [x] Rerun the identical 10k suite with the same binaries, retain both corpora and prior results,
      and publish complete tables, topology/cache context, and RPC comparisons in `gcp/RESULTS.md`.
      Untar 593.898 → 416.984 s; full read/hash 104.227 → 76.366 s. Both runs passed all 24
      DFS/local checks. The new VM also increases actual commit proxies from two to three;
      this single comparison does not isolate locality from resources, caches, or retained data.

## Project: xattrs (complete)

The previous 10k population produced 27,323 FUSE `getxattr` callbacks and 27,324 server `Stat`
RPCs (93.8 s cumulative RPC time). All probes were unsupported `security.capability` requests.

- [x] Trace xattr names during a small untar to distinguish tar requests from kernel probes.
      The 100-file untar made no xattr syscalls; all 270 FUSE probes were `security.capability`.
      Early filtering left only the mount-start Stat RPC.
- [x] Reject unsupported xattr namespaces before fetching metadata from the server.
- [x] Add a bounded, mount-scoped cache for supported xattrs, including absent attributes and
      listings. Use the same timeout as the inode attribute cache, sourced from the same setting,
      for all three. Keep aliases coherent after local mutations; follow the existing policy
      allowing cached reads after remote edits/revocation. Never advance dirty-file base versions
      on a fill.
- [x] Update client caching contracts and native tests for filtering, expiry, bounds, cached absence,
      invalidation, and error propagation. Nine native FUSE tests and Clippy pass.
- [x] Run Linux regressions (`tests/xattrs.py` with cache budgets 0 and 16 MiB, plus `fuse_e2e.py`)
      for alias coherence, rename/unlink, and retained write versions after xattr fills.
- [x] Benchmark filtering alone and filtering plus caching. Retain existing result tables and
      identify these runs as client changes with the same API; record FUSE hashes/cache budgets.

Native/Linux Rust tests, Clippy, the dedicated xattr regressions, and the full two-mount FUSE suite
pass. The 200-round xattr read test used 2 Stat RPCs / 0.045 s with caching versus 801 / 2.190 s with
filtering only. Full 10k suites passed in both modes: untar 304.889 s / 275.600 s versus the previous
416.984 s. Both new untars made 50,539 RPCs, including just one Stat. Neither exercised supported
xattr caching; do not attribute their timing difference to caching. All corpora remain; full tables
and comparison limits are in [GCP results](gcp/RESULTS.md#xattrs-client-filtering-and-caching).
See [reproduction](gcp/README.md#xattrs-project).

## Project: server writeback (completed)

Writes acknowledge server-memory acceptance. Debounce background persistence to coalesce writes
into bounded FDB transactions. Explicit fsync bypasses the debounce and waits for all preceding
writes in its scope, including dependent metadata, to commit durably; deferred errors must surface.
Ordinary close does not impose this durability barrier. A server crash may lose acknowledged writes
that have not persisted, but never leave inconsistent persisted state or lose a successful fsync.
Allow concurrent content/metadata overwrites instead of rejecting every stale object version.
Independent server writers remain required; no exclusive workspace owner.

### 1. Scope and contracts

- [x] Buffer positioned file writes and file metadata updates, including truncation and xattrs.
      Keep create/mkdir, rename/remove, grants, directory updates, and append synchronous initially.
      The unchanged client's directory fsync sends no RPC, so namespace publication stays durable.
- [x] Define accepting-server visibility versus committed visibility through other servers. Retain
      fresh existence/authorization checks on foreground requests and in committing transactions.
- [x] Reconcile durable-ack/no-RAM-overlay and strict mutation-version contracts with the approved
      overwrite semantics. Keep the wire API and shared FUSE client unchanged.
- [x] Define collision-free object version tokens for provisional states from independent servers.
      Read-version equality MUST still distinguish different states, including rebased writes;
      there is no workspace-wide coherence version.
      Storage-issued tokens replace numeric increments; independent allocators reserve disjoint
      ranges durably. The format-2 foundation passes Rust/backend tests, Clippy, and Linux two-mount
      FUSE/restart validation. The bounded buffer and durable fsync barrier are implemented.

### 2. Bounded memory acceptance and reads

- [x] Retain ordered byte-range writes, truncations, and field/xattr changes per workspace/object.
      Store semantic operations instead of stale whole-object replacements; never buffer an entire
      large file as a prerequisite for accepting a bounded write.
- [x] Make stat/lookup/list/read through the accepting server reflect pending edits while preserving
      authorization and read-version checks. Keep independent servers free to commit concurrently.
- [x] Bound queued bytes, objects, operations, and retained errors; apply backpressure at capacity.
      Preserve accepted work after RPC cancellation and order local edits to one object.

### 3. Debounced FDB persistence

- [x] Add configurable debounce, maximum dirty age, byte/count flush thresholds, and worker
      concurrency. Batch independent files while keeping transactions within FDB limits.
- [x] Reapply ordered operations against current FDB records with normal conflict tracking.
      Commit order resolves concurrent overlapping writes/fields; preserve untouched bytes/fields,
      current parents/grants, and truncation zero-fill semantics. Never resurrect an unlinked file.
- [x] Atomically commit final blocks, metadata, and coalesced search work. Search continues to index
      committed FDB state; index status must account for local pending publication.
- [x] Order synchronous operations against affected local pending writes without draining unrelated
      files. Retry only known-uncommitted attempts; never replay an ambiguous commit automatically.

### 4. Durability barriers and deferred errors

- [x] Have file fsync freeze a finite preceding prefix through the fair publication gate and
      flush/wait for queued and in-flight operations, including metadata. Later writes cannot extend it.
- [x] Retain deferred failures until they can be reported to the originating session's fsync or
      subsequent operations. Do not report success after silently dropping accepted writes.
- [x] Drain accepted work on graceful session/server shutdown. A crash before fsync may lose RAM
      edits; successful fsync must survive restart. Do not wait for ES indexing at this boundary.

### 5. Correctness and resource validation

- [x] Test independent servers with disjoint/overlapping writes, partial blocks, truncation and
      re-extension, metadata updates, append, moves/unlink, and grant changes.
- [x] Test fixed-prefix fsync during continued writes, deferred/ambiguous failures, queue pressure,
      cancellation, graceful shutdown, and crash/restart durability through the unchanged client.
- [x] Verify search outbox atomicity, workspace isolation, and bounded memory for large files.

Rust/backend tests, Clippy, Linux FUSE crash/two-server tests, and ES fault regressions pass.
The lost-reply test commits to real FDB before injecting the ambiguous response; fsync reports the
error without replay. The shared client/protocol is unchanged.

### 6. Benchmark

- [x] Rerun the same deep-path 10k untar and full filesystem suite on the existing GCP fixture.
      Record foreground time separately from remaining client writeback and server durable drain.
- [x] Report FDB transaction count, operations/bytes per batch, retries, and peak queued memory.
      Keep previous tables and corpora. Compare against the completed xattrs baseline.

The full 10k suite passed: untar 309.769 s + 0.058 s remaining persistence versus the previous
275.600 s. The deep granted-subtree import took 384.546 s + 0.028 s; all hashes passed after restart.
No publication failures; both corpora remain. This iteration did not improve untar performance.
See [GCP results](gcp/RESULTS.md#server-writeback) for full tables, batch counters, and comparison limits.

Fresh FDB reads and synchronous namespace commits remain on the foreground path. The project removes
commit waits for file writes/updates, not all network latency; speedup must be measured.

## Project: per-object publication locks

- [x] Replace the process-local workspace gate with sorted object locks. Keep xattrs, FUSE/API,
      batching/debounce, FDB conflict checks, and native FDB/kernel settings unchanged.
- [x] Protect RAM/FDB read handoff from before the snapshot; revalidate newly discovered lookup/list
      targets. Keep file fsync finite, and coordinate synchronous mutations only with participants.
- [x] Prove a paused file publication permits sibling create/read/write/fsync, including deep paths;
      test publication during listing discovery and retain independent-writer/error/crash tests.
- [x] Handle exhausted, definitely uncommitted FDB conflicts by splitting multi-file publication
      batches. The first GCP attempt exposed parent-record contention; never split ambiguous outcomes.
- [ ] Run the existing GCP 10k full suite and deep
      untar sequentially. Keep prior corpora/results and compare retries, batches, and remaining drain.

## Future work: after the networked experiment

- [ ] Add replicated ES and production authentication/TLS beyond the isolated private fixture.
- [ ] Configure backups/recovery, observability, and production resource budgets.
- [ ] Repeat workloads in GCP and evaluate contention, cost, and scaling across many workspaces.
- [ ] Add multi-server deployment/shared session routing, indexer scheduling, online index replacement,
      tombstone cleanup, and large-workspace shard distribution when needed. Independent-writer
      correctness is already required; workspace writer ownership is not a future option.
