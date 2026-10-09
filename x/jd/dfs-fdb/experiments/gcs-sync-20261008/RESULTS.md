# GCS to DFS measured results

On 8 October 2026, the emulator experiment completed **1,000,000 simulated source operations**, resulting in **1,000,000 applied DFS publications** and **1,410,000 acknowledged notifications** across 100,000 object names. Independent verification checked all final source cursors, all 75,000 live files' bytes, all 25,000 deleted entries, and denial of every live file to a different tenant's reader. All checks passed.

The source adapter was simulated, Pub/Sub was Google's emulator, and the standalone front worker, authenticated DFS HTTP importer, and FoundationDB were real. This establishes correctness for the exercised workload. It does not measure native GCS notification delivery, cloud IAM, production Pub/Sub throughput or large-object bandwidth.

## Measured run

| Measurement | Result |
| --- | ---: |
| Object names / DFS tenants | 100,000 / 64 |
| Source operations / applied publications | 1,000,000 / 1,000,000 |
| Published / acknowledged notifications | 1,410,000 / 1,410,000 |
| Generator start through final phase drain | 2,611.705 seconds (43m 32s rounded) |
| Average applied source operations | 382.89/second |
| Average acknowledged notifications | 539.88/second |
| Worker processes / concurrent handlers each | 4 / 32 |
| Sum of sampled peak worker RSS | 1.246 GiB |
| Staged bytes, including repeated staging | 44,267,521 |
| Final live bytes independently verified | 2,841,668 |
| Final-state verification duration | 170.484 seconds |

The VM was `e2-standard-8` with a 100 GB persistent SSD in `dust-dev/us-central1-a`. It ran one FoundationDB 7.3.69 SSD process, the DFS release build, Pub/Sub emulator 0.8.34 on Java 17, and Node 24.16.0. All services shared this VM. The sum of worker peaks is not a simultaneous VM memory peak; at capture, the emulator's RSS was approximately 9.45 GiB and FDB's approximately 2.95 GiB. The complete FDB data directory, including preliminary smoke/test namespaces, occupied approximately 2.6 GiB. Neither the disk figure nor the process RSS snapshot isolates this namespace's cost.

The workload contains 100,000 creates, 400,000 overwrites, 475,000 metadata updates and 25,000 deletes. Overwrites add 400,000 archive notifications, with archive/finalize order reversed for half the names. An additional 10,000 messages deliberately duplicate notifications. The final 410,000 non-mutating deliveries consist of 409,476 server no-op responses and 524 equal-current observations skipped by the worker.

Generations deliberately decrease as well as increase, including values beyond JavaScript's safe integer range. Google documents generation uniqueness without guaranteeing monotonicity. The worker therefore reads the DFS cursor, observes current live GCS state, and publishes with compare-and-swap; a conflict forces fresh observations. Historical delete/archive messages cannot directly delete a live replacement. [GCS generation semantics](https://docs.cloud.google.com/storage/docs/metadata#_GenerationNumbers)

Four startup subscription lookups returned 404 before the publisher created the emulator subscription. They recovered automatically. No message-processing failure was logged during the completed volume run. All phases waited for their expected applied count and acknowledgement count before advancing. A preliminary run using numeric generation ordering was discarded after the documentation review exposed that invalid assumption; its operations are excluded from these measurements.

## Phase evidence

Counts are cumulative. Duration includes publishing and backlog drain for that phase.

| Phase | Source transition | Source operations | Notifications | Seconds |
| --- | --- | ---: | ---: | ---: |
| 0 | Create | 100,000 | 101,000 | 212.089 |
| 1 | Metadata | 200,000 | 202,000 | 138.846 |
| 2 | Overwrite plus archive | 300,000 | 403,000 | 356.449 |
| 3 | Metadata | 400,000 | 504,000 | 154.782 |
| 4 | Overwrite plus archive | 500,000 | 705,000 | 312.568 |
| 5 | Metadata | 600,000 | 806,000 | 194.870 |
| 6 | Overwrite plus archive | 700,000 | 1,007,000 | 409.075 |
| 7 | Metadata | 800,000 | 1,108,000 | 213.035 |
| 8 | Overwrite plus archive | 900,000 | 1,309,000 | 403.730 |
| 9 | Metadata and delete | 1,000,000 | 1,410,000 | 216.190 |

## Failure and access checks

After the benchmark, the probe suspended the DFS daemon for 25 seconds and published 100 historical delete events. Acknowledgements stayed at 1,410,000 throughout suspension. After resume, all 100 events were acknowledged, and the applied-publication counter remained 1,000,000. The probe completed in 26.081 seconds. This tests temporary daemon unavailability and safe replay; it is not an FDB outage or disaster-recovery test.

The worker and daemon were then stopped. A fresh verifier process opened the existing FDB namespace and independently validated all 100,000 final records. It verified 75,000 exact file bodies and 75,000 cross-tenant read denials, with 25,000 deleted paths absent. The expected state was 75,000 live files and 25,000 tombstones; no sampled subset was used.

Fourteen front worker tests pass, including publication-before-acknowledgement, source-read failure handling, decreasing generations, cursor conflicts, historical deletes, chunk boundaries, truncated content, unknown ownership and lease renewal. The front TypeScript check, worker build, targeted lint and formatting checks pass. Seventeen real FDB integration tests pass: three importer tests and fourteen existing engine/storage tests. Coverage includes concurrent frontends, wrong-tenant access, reader revocation, tombstone resurrection rejection, delete/recreate identity, corrupt chunk rejection, and a file spanning more than 256 chunks.

Rust release compilation and formatting pass. Strict Clippy on Rust 1.99 encounters two existing warnings in unchanged `src/mount_cache.rs`; Clippy passes with `manual_saturating_arithmetic` and `collapsible_if` allowed on the command line. No source-level suppressions or unrelated fixes were added.

## Cleanup and remaining scope

All recorded cloud resources were deleted: source bucket, source/dead-letter topics and subscriptions, VM, boot disk, and dedicated service account. No GCS notification or IAM binding was created. The service-account delete succeeded; because the subsequent describe returned a permission-masked absence, an authenticated project inventory confirmed that no matching active account remained. The `gcs-dfs-sync` hive is stopped and its worktree is preserved.

Native GCS events, publisher/dead-letter IAM, soft-delete/restore and bucket-mode behavior, compressed source downloads, and production regional capacity remain cloud-validation work. Reader mappings are trusted operator allowlists; automatic Dust permission propagation, backfill, periodic reconciliation, health endpoints, and staging/content garbage collection remain deployment work. The prototype bounds individual objects to 256 MiB. Infrastructure changes remain documentation only.

## Reproduction and raw evidence

- [Reproduction instructions](README.md)
- [Volume counters, phases, process snapshot and failures](results/volume.json)
- [Full final-state verification](results/verification.json)
- [Outage and replay proof](results/outage-replay.json)
- [Final FDB tests](results/final-fdb-tests.log), [front tests](results/front-tests.log), [front typecheck](results/front-typecheck.log)
- [Source hashes and executed bundle hash](results/source.json), [VM configuration](results/vm.json)
- [Resource manifest](resources.json), [verified cleanup](cleanup-results.json), [original deletion responses](cleanup-first-attempt.json)

The corpus hash is `db653f29965fd2f86e79b10481786ef2b7bf2984d753f02ac2df178961656720`. It identifies deterministic generator inputs; byte correctness comes from the independent full verifier.
