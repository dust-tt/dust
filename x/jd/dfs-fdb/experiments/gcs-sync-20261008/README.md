# GCS to DFS experiment

The recorded results used the historical HTTP importer. They do not validate the current gRPC client or two-hop relay. The scripts and commands below are historical experiment artifacts, not a runnable deployment recipe for the canonical server. The source adapter now follows the current application interface, but the old provisioning, credentials, namespace and verification tooling must be replaced before a new run. No recorded result validates Redis ownership or canonical DFS session fencing.

See [measured results and cleanup evidence](RESULTS.md) for the completed run.

This experiment exercises generated GCS-shaped notifications through Google's Pub/Sub emulator, the actual standalone front worker processing and transport code, the DFS HTTP importer, and real FoundationDB. Only the source-object adapter is simulated. Native GCS notification delivery and cloud IAM were unavailable; the user explicitly approved the emulator fallback.

The final workload uses 100,000 object names across 64 isolated DFS tenants. Ten source transitions per name produce 1,000,000 source operations: 100,000 creates, 400,000 overwrites, 475,000 metadata updates and 25,000 deletes. Overwrites add 400,000 archive notifications, and a 1% duplicate injection adds 10,000 messages, for 1,410,000 published messages. Archive/finalize ordering is deliberately reversed for half the names. Generation values alternate between large and small integers, including values beyond JavaScript's safe integer range. This tests identity equality and compare-and-swap rather than an invalid assumption that GCS generations increase.

The source advances one phase only after all phase messages are acknowledged and the expected number of actual DFS publications has returned successfully. The publisher's `completed` flag is not the final correctness oracle: `verify_gcs_simulation` independently opens FDB and checks every expected cursor, every live file's contents, deleted namespace entries, and denial of every live file to a different tenant's reader.

The final expected corpus has 75,000 live files and 25,000 tombstones. Bodies are deliberately small deterministic strings. This is a high-operation-count correctness experiment, not a large-object bandwidth benchmark or a production GCS/Pub/Sub throughput measurement.

## Runtime

- Project: `dust-dev`; VM: `gcs-dfs-jd-20261008`, `us-central1-a`.
- Compute: `e2-standard-8`, 100 GB persistent SSD, Debian 12.
- FoundationDB: 7.3.69, single SSD process, loopback port 4500.
- Rust: 1.99.0; Node: 24.16.0; Java: OpenJDK 17.0.20.1.
- Google Pub/Sub emulator: 0.8.34, loopback port 8085, JVM heap limit 8 GiB.
- DFS: release build, RPC on loopback 7543 and importer on loopback 7544.
- Volume workers: four independent Node processes sharing one subscription, 32 concurrent handlers each. The importer admits at most 128 requests.

All services share this VM. The test does not isolate their CPU, disk, network or memory costs. Tokens are generated on the VM into mode-0600 files; they are never included in results. Pub/Sub emulator access is deliberately unauthenticated and restricted to loopback. This does not validate cloud service-agent IAM.

## Reproduction

Use new resource names and record them before creating anything. `resources.json` records this run's exact targets; `cleanup.py` refuses an unexpected project or VM. `provision.sh` records the native cloud messaging setup attempt, which stopped at the first IAM grant. It is not a complete VM provisioner. `startup.sh` records the VM's FDB, Rust and Node bootstrap. Install OpenJDK 17 and the Google Cloud CLI `pubsub-emulator` component separately, then copy its platform directory to `/opt/gcs-dfs/pubsub-emulator`.

From the Dust worktree, build the experiment entrypoint:

```sh
npm exec -- esbuild x/jd/dfs-fdb/experiments/gcs-sync-20261008/simulate.ts \
  --bundle --platform=node --target=node22 --alias:@app=./front \
  --packages=external --outfile=/tmp/gcs-dfs-simulate.js
```

Copy the DFS source directory to `/opt/gcs-dfs/dfs-fdb` on the isolated VM and the bundle to `/opt/gcs-dfs/app/simulate.js`. In that app directory, install `pino@8.21.0`, `zod@3.25.76` and `google-auth-library@9.15.1`, `@grpc/grpc-js@1.14.5` and `protobufjs@7.6.6`, matching the repository lockfile used in this run. With FDB running:

```sh
cd /opt/gcs-dfs/dfs-fdb
export FDB_CLIENT_LIB_PATH=/opt/gcs-dfs/fdb/bin
export LD_LIBRARY_PATH=/opt/gcs-dfs/fdb/bin
export DFS_FDB_TEST_CLUSTER_FILE=/opt/gcs-dfs/fdb/fdb.cluster
/root/.cargo/bin/cargo build --release --bin dfsd-fdb --example verify_gcs_simulation
/root/.cargo/bin/cargo test --release --test import --test engine --test storage -- --include-ignored
sudo systemd-run --unit=gcs-dfs-emulator --setenv=JAVA_OPTS=-Xmx8g \
  /opt/gcs-dfs/pubsub-emulator/bin/cloud-pubsub-emulator --host=127.0.0.1 --port=8085
sudo bash experiments/gcs-sync-20261008/run-simulation.sh cas-volume 100000 4
```

The launcher refuses an existing runtime directory and creates fresh credentials, FDB namespace and emulator topic/subscription names. Only run one launcher at a time because server ports are fixed. Start with 1,000 documents and one worker for a smoke test; stop those server/worker units before the volume run. Inspect publisher status and `result.json`, then verify:

```sh
sudo env LD_LIBRARY_PATH=/opt/gcs-dfs/fdb/bin \
  target/release/examples/verify_gcs_simulation \
  --cluster-file /opt/gcs-dfs/fdb/fdb.cluster \
  --namespace gcs-dfs-cas-volume --runtime /opt/gcs-dfs/cas-volume
```

`progress-*.json` counts successful acknowledgement calls, successful applied publication responses, server-side no-op responses (`stale`), staged bytes including repeated staging, and sampled peak worker RSS. No-op observations skipped before publication are not included in `stale`. The sum of sampled per-process peaks is not a simultaneous machine memory peak. `phases.json` includes publishing and backlog-drain time for each phase. The corpus hash identifies the deterministic generator inputs, not a cryptographic inventory of every stored file.

The standalone production entrypoint is `front/start_gcs_dfs_worker.ts`; the experiment imports the same `runWorker`, `GoogleTransport` and `DfsProjection` while substituting `SimulatedSource`. Build the production entrypoint with `npm -w front run build:gcs-dfs-worker`, set `GCS_DFS_WORKER_CONFIG_PATH`, and use `npm -w front run start:gcs-dfs-worker`. The mounted JSON configuration follows `front/workers/gcs_dfs/protocol.ts`; omit `pubsubEmulatorHost` for real Pub/Sub and supply ADC. Trusted reader mappings remain an operator-controlled prototype configuration.

## Checks and interpretation

Front checks are isolated worker Vitest tests, the front TypeScript check, targeted lint/format checks, and the worker build. FDB checks include importer authentication, multi-frontend compare-and-swap races, decreasing generations, same-generation metadata changes, reader revocation, delete/recreate identity, incorrect chunk hashes, and a file spanning more than 256 chunks, plus existing engine/storage tests.

Rust formatting and release compilation pass. Strict Clippy on Rust 1.99 encounters two existing warnings in unchanged `src/mount_cache.rs`: `manual_saturating_arithmetic` and `collapsible_if`. Clippy passes with only those categories allowed on the command line; no source suppressions or unrelated edits were added.

Cloud GCS delivery, native gzip/object-mode behavior, service-agent IAM, dead-letter forwarding, production latency and regional quota behavior still require a cloud test. Backfill, periodic reconciliation, production permission-change propagation, health endpoints, and content/staging garbage collection remain deployment work described in the design.

After the volume run drains, `capture-results.py` captures the source-operation and acknowledgement counters before further probes. `outage-replay.mjs` requires that exact completed run, suspends the DFS server for 25 seconds, publishes 100 historical delete notifications, checks that acknowledgements remain unchanged during suspension, and resumes DFS. Replay must drain without new applied mutations. Run the full verifier afterward. This tests a temporary daemon suspension; it does not simulate loss of the FDB cluster or test production disaster recovery.

Capture results before cleanup. Stop the experiment services, run `python3 experiments/gcs-sync-20261008/cleanup.py` locally, and inspect `cleanup-results.json`. The script verifies resource absence and the boot disk after deletion. Stop the `gcs-dfs-sync` hive without removing its worktree so the implementation remains available.
