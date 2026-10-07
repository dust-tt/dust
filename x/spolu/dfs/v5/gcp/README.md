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

## Search and durable scale fixture

[Search measurements](../bench/SEARCH.md) record the separate ES-backed RPC benchmark and filesystem
runs with indexing enabled. `bench/search.py` verifies an empty FDB work queue and exact live ES
document count through an operator helper; there is no GetIndexStatus RPC.

`gcp/scale.py` loads actual files, content, directories and grants into a dedicated FDB prefix. It
then invokes the production permission bootstrap in a new process for each tenant. This empties
process memory but retains FDB/OS caches. It preserves private manifests and resumes committed
batches after interruption. Builds, benchmarks and warmups must run sequentially on the workload VM.
The current scope is 1M and 10M; the user deferred the 100M benchmark before its population started.
The `dfs-v5-resume-20261007-i` unit owns population, warmups and final service verification after
runtime h validation/repair. Inspect its live state before running any manual command below; those commands
are for use after it has stopped. Logs and its phase record live under
`/var/log/dfs-bench/v5/resume-20261007-i`. Earlier validation and repair logs remain under
`/var/log/dfs-bench/v5/finalize-20261007-h`.

```sh
CLOUDSDK_CORE_ACCOUNT=spolu@dust.tt v2/gcp/run ssh workload sudo python3 \
  /opt/dfs/v5/gcp/scale.py \
  --work /var/log/dfs-bench/v5/scale-20261007-c \
  --prefix dfs-v5-scale-20261007-a --workers 16 --concurrency 4 --sizes 1m 10m
```

The selected fixtures have 1M/10M files plus 10K/100K directories and a root per tenant. Sixteen
top-level directories branch four ways; files are distributed across directory depths 2–7 and 2–9.
Content is UTF-8 text, 128 bytes normally and 4096 bytes for every thousandth file. UUIDs are dense
version-4 values. Grants include a root owner and explicit team grants on selected folders/files.
This measures a realistic tree shape; it does not model large document payloads or report loader
throughput as ordinary filesystem throughput.

After both measurements pass, the service helper can create the persistent loopback server:

```sh
CLOUDSDK_CORE_ACCOUNT=spolu@dust.tt v2/gcp/run ssh workload sudo python3 \
  /opt/dfs/v5/gcp/serve_scale.py \
  --work /var/log/dfs-bench/v5/scale-20261007-c
```

It requires a complete, verified scale report, copies immutable binaries, starts the dedicated
`dfs-v5-scale-server` container at `http://127.0.0.1:18095`, and activates the tenants in ascending
size with a 28 GiB total tree budget / 24 GiB bootstrap peak. It verifies exact tree sizes and
authenticated root reads. ES indexing runs asynchronously; tree readiness does not claim that all
11 million files have reached ES. Other fixture services and data are preserved.

`gcp/verify_scale.py --work /var/log/dfs-bench/v5/scale-20261007-c` then checks sampled file bytes,
namespace links, MIME metadata, inherited/explicit team grants, empty-grant denial and cross-tenant
isolation through the public RPCs. It retains a private report and usable owner sessions. These RPC
checks do not independently prove RAM residency; exact tree counts come from bootstrap measurements
and the server's readiness records.

The helper writes mode-0600 session credentials and prints their paths, never their values. Sessions
expire after one hour. Renew an owner session for any tenant with the same command plus
`--session 1m` or `--session 10m`. A tree is evicted after the last local session
expires and the configured idle grace passes; the next session rebuilds it normally.

The service helper remains pending live verification until population and all warmups complete.
