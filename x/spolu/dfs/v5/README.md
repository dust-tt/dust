# dfs:// v5

[Design](DESIGN.md) · [Implementation and validation progress](PLAN.md) · [Local benchmark](bench/RESULTS.md) · [GCP benchmark](gcp/RESULTS.md)

The v5 runtime passes Rust and real-FDB tests and unprivileged mounted checks. Full benchmark runs
locally and on GCP passed all 24 timed checks, content verification and cleanup; each report identifies
the measured build. See the plan for the remaining design validation audit. The recursive-cleanup
fix and its validation are recorded in [CLEANUP.md](bench/CLEANUP.md).

The isolated Linux/FDB development fixture uses `v5/local/run up` and
`v5/local/run exec COMMAND ...`. Sources are mounted at `/dfs/v5`. Existing v4 data and binaries are
preserved. Generated logs, reports, corpus files and credentials remain outside version control.

The current local demo is running in `dfs-v5-dev-1`, with its fixture stored in the persistent
target volume. Open a shell in the writable directory:

```sh
docker exec -it -w /target/demo-fixed/mount/work dfs-v5-dev-1 bash
```

The mounted files live in the separate `dfs-v5-fdb-1` database. The demo supervisor runs
`python3 /dfs/v5/local/mount.py --work /target/demo-fixed`; its log is
`/tmp/dfs-v5-demo-fixed-supervisor.log` inside the dev container. This fresh client shares the
existing demo tenant/data. The original `/target/demo/mount` client remains separate and can retain
errors from earlier failed deletions. Private fixtures remain outside the repository.
