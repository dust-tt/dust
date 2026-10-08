# dfs-bench

Real-world test bench for DFS implementations: a temporary GKE cluster on `dust-dev`
(us-central1, 3 zones) with a multi-host FoundationDB, DFS server replicas, and E2B sandboxes
(US cluster) mounting subtrees. Everything is created per run and destroyed after.

## Usage

```bash
bin/bootstrap       # once: GCS bucket for Terraform state, FDB backups and results
bin/up              # ~15 min: cluster + FDB operator + healthy triple-replicated FDB
bin/status          # nodes, FDB status, sandbox count
bin/clear           # ~5 min: back to empty (new FDB, no sandboxes), keeps the cluster
bin/down            # teardown; fails loudly if anything is left
```

`bin/up` refuses to start while another run is up, and runs `bin/sweep` first.
`bin/sweep` tears down runs older than 6 h, cleans resources of runs whose cluster is gone, and
kills bench sandboxes older than 3 h. Run it whenever in doubt.

Scripts run as the dust-dev service account (`~/.config/dust-dev/sa-key.json`) from an
isolated gcloud config in `.state/`, so they work whatever your active gcloud login is.

## Benchmarking an implementation

```bash
impls/henry/build     # amd64 image pushed to Artifact Registry, dfs-mount kept in .state/
impls/henry/deploy    # 3 servers (one per zone) behind a load balancer, one provisioned tenant
bin/bench henry       # one `basic` round on 2 E2B sandboxes; results in .state/results/ and GCS
```

A `basic` round: both sandboxes time round trips to an in-cluster echo service (the network floor of
an RPC), sandbox A untars jd's 10k-file corpus (the one behind `x/henry/dfs/DESIGN.md` numbers,
checked by manifest hash) into its mount, sandbox B reads it all back through its own mount and
checks digests, then B measures how long A's new files take to show up (the 1 s freshness bound).
`BENCH_CORPUS=scatter` swaps in a metadata stress instead: ~1.8 files per directory over ~5.5k
directories in random order, not comparable with other numbers. It only counts as valid if both mounts exit with no dropped ops and no
missed commit windows. `bin/clear` wipes the deployment too: re-run `deploy` after it.

`bin/bench henry git` runs the `git` round instead: A clones dust from GitHub natively and into its
mount and times `git status`; B runs `git status` on A's clone through its own mount and checks every
tracked file against its blob.

The load balancer is open to all: plain TCP with a tenant token, fine for synthetic data. Sandboxes
reach it through E2B's egress proxy (a TCP connect from a sandbox succeeds to any address, so only
a real request proves reachability).

## Layout

- `terraform/`: regional GKE Standard cluster, node pools `fdb` (2 × n2-standard-8 per zone),
  `server` (1 × n2-highmem-8 per zone), `tools` (1 × n2-standard-4 per zone). State lives in
  `gs://dust-dev-dfs-bench/runs/<run_id>/tfstate`.
- `k8s/`: namespaces, labeled `pd-ssd` storage class, FDB cluster (7.3, triple, redwood,
  6 storage / 4 log / 5 stateless processes) managed by the fdb-kubernetes-operator.
- `bin/`: up, down, clear, status, bench, leak-check, sweep, bootstrap.
- `impls/<impl>/`: how to build and deploy an implementation. `orchestrator/impls.ts`: how to
  mount it in a sandbox.
- `orchestrator/`: the E2B side (Node 24 runs the TypeScript directly). `orchestrator/template.ts`
  builds the `dfs-bench` sandbox template, modeled on prod's `dust-base` (Ubuntu noble, Python
  3.14, Node 24, the same search tools, 2 vCPU / 2 GB, no sudo) plus fuse3. `workloads/`: what
  runs inside sandboxes.

## Cost

About $5–6/h while up (VMs + pd-ssd + GKE fee). Zero when down, apart from the bucket.

## Defaults to revisit

- One cluster per run (clean slate, ~10 min to create) rather than a long-lived cluster.
- FDB on pd-ssd. Local NVMe is closer to prod but needs a local volume provisioner; next step.
