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
Both fixtures and their warmups completed on 2026-10-07: 15.759 s for 1,010,001 nodes and 147.669 s
for 10,100,001 nodes. The complete report is `/var/log/dfs-bench/v5/scale-20261007-c/run.json`.
The population/warmup/service pipeline `dfs-v5-resume-20261007-i` and subsequent storage job
`dfs-v5-size-20261007-k` both completed; their state files and logs remain under matching directories
in `/var/log/dfs-bench/v5`. Earlier validation and repair logs remain under `finalize-20261007-h`.

To reproduce population/resume and warmup, with no other builds/tests/timings running:

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

The persistent loopback server is running and verified. This command starts or verifies it again:

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

Live verification passed for both tenants; the private report is
`/var/log/dfs-bench/v5/scale-20261007-c/verification-1791382534760121244.json`.

The helper writes mode-0600 session credentials and prints their paths, never their values. Sessions
expire after one hour. Renew a 10M owner session with the following command; substitute `1m` for
the smaller tenant:

```sh
CLOUDSDK_CORE_ACCOUNT=spolu@dust.tt v2/gcp/run ssh workload sudo python3 \
  /opt/dfs/v5/gcp/serve_scale.py \
  --work /var/log/dfs-bench/v5/scale-20261007-c --session 10m
```

To create a session and list the 10M tenant's root in one command, run from the DFS repository:

```sh
CLOUDSDK_CORE_ACCOUNT=spolu@dust.tt v2/gcp/run ssh workload sudo python3 - <<'PY'
import json
from pathlib import Path
import sys

sys.path.insert(0, '/opt/dfs/v5/gcp')
from serve_scale import client, run, session

run('bash', '/opt/dfs/v2/gcp/verify-host.sh')
work = Path('/var/log/dfs-bench/v5/scale-20261007-c')
owner = session(work, '10m')
listing = client(work, Path(owner['session_key_file']), 'list',
                 {'directory_id': owner['root_id'], 'limit': 32})
print(json.dumps(listing, indent=2))
PY
```

This uses the immutable CLI at `/reports/scale-20261007-c/runtime/dfs` inside `dfs-v5-gcp-dev-1`,
with endpoint `http://127.0.0.1:18095` and a private `--key-file`. A tree is evicted after the last
local session expires and the 60-second idle grace passes; the next session rebuilds it normally.

ES backfill continues separately. At 14:20:44 UTC on 2026-10-07 the index contained 199,680 documents;
the 1M tenant returned Search hits, while 10M's initial backfill had not yet published results.
Each tenant's initial scan finishes before its indexing jobs publish. The filesystem data and
permission trees are complete; full ES drain for these large fixtures is not measured here.

The separate read-only `fixture_size` helper passed GCP clippy/build after all timed runs. It measured
0.739 GiB / 7.525 GiB of logical FDB data at 14:16:56 UTC without changing measured runtime binaries.
The binary is available; repeat a storage estimate with:

```sh
CLOUDSDK_CORE_ACCOUNT=spolu@dust.tt v2/gcp/run ssh workload sudo docker exec \
  dfs-v5-gcp-dev-1 /target/release/examples/fixture_size \
  --fdb-prefix dfs-v5-scale-20261007-a --tenant scale-1m
```

Repeat with `--tenant scale-10m`. The helper requires an existing format-6 scale deployment and
tenant; it never initializes or writes data. It reports FDB's byte-sample estimate of logical
key/value bytes, including content, metadata and durable indexes within that tenant. This excludes
physical replication/log overhead, ES and RAM. Retain the measurement time because background
indexing and GC can change the stored indexes. Permission-tree accounting and RSS remain separate
warmup measurements.
