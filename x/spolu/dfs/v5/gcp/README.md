# v5 on the existing dust-dev fixture

Use only the allowlisted nodes in [v2's fixture](../../v2/gcp/README.md), with explicit
`--project=dust-dev` and `--account=spolu@dust.tt`. Run `sudo bash /opt/dfs/v2/gcp/verify-host.sh`
before host mutations (the existing file need not have an executable bit). Preserve
all existing FDB settings, corpora, v2/v3/v4 sources and binaries. No resource provisioning is needed.

Deploy sources to `/opt/dfs/v5`, build using this directory's Compose file with `/target/v5`, and
keep generated reports and credentials in `/var/log/dfs-bench/v5` (`/reports` in the container).
Use `v2/gcp/run ssh workload COMMAND ...` for argument-preserving IAP SSH.

Build, test and validate mounted behavior before timing. Run the same `v5/bench/run.py` corpus,
untar and jd workload suite as local. Record source identity, binary hashes, actual configuration,
FDB topology, application restart/cache scope, durable drain and correctness outcomes with the table.
Do not overlap builds/tests and timed benchmarks.

Capture the current states of `dfs-play-mount`, `dfs-play-server`, `dfs-v3-play-mount` and
`dfs-v3-play-server`, pause active services during timing, then restore their prior states on success
or failure. Additional interactive v4/v5 services, if present, require the same treatment.

The full remote suite passed on 2026-10-07; see [RESULTS.md](RESULTS.md) for the table, topology,
validation, memory peaks and comparison with local/v4. Interactive services were restored.
