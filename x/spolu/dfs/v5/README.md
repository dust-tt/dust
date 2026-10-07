# dfs:// v5

[Design](DESIGN.md) · [Implementation and validation progress](PLAN.md) · [Local benchmark](bench/RESULTS.md) · [GCP benchmark](gcp/RESULTS.md)

The v5 runtime passes Rust and real-FDB tests, unprivileged mounted checks, and the full local
benchmarks locally and on GCP: all 24 timed checks, content verification and cleanup. See the plan
for the final audit of additional design validation. Implementation changes are uncommitted.

The isolated Linux/FDB development fixture uses `v5/local/run up` and
`v5/local/run exec COMMAND ...`. Sources are mounted at `/dfs/v5`. Existing v4 data and binaries are
preserved. Generated logs, reports, corpus files and credentials remain outside version control.
