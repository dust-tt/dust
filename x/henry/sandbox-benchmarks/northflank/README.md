# Northflank sandbox benchmarks

Bench scripts + convenience wrappers for measuring sandbox behavior on Northflank.

These scripts are intentionally colocated under `x/henry/` so they can evolve without impacting production code.

## Prereqs

- Node installed (recommended: `nvm use` from repo root)
- `NORTHFLANK_API_TOKEN` set
- Optional: `NORTHFLANK_PROJECT_ID` (defaults to `dust-sandbox-dev`)

All commands are run from `front/` so dependencies like `@northflank/js-client` and `tsx` are available.

## Cold start latency (create -> exec readiness)

From repo root:

```bash
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox.sh nf-compute-20 -n 25
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox.sh nf-compute-20 -n 25 --no-delete-between-runs
```

You can also run directly:

```bash
cd front
NORTHFLANK_API_TOKEN=xxx npx tsx ../x/henry/sandbox-benchmarks/northflank/bench_sandbox.ts nf-compute-20 -n 25
```

## Attach-after-ready pattern (volume attach -> immediate exec)

From repo root:

```bash
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox_attach_after.sh nf-compute-20 nf-compute-100-2 nf-compute-200
```

Direct:

```bash
cd front
NORTHFLANK_API_TOKEN=xxx npx tsx ../x/henry/sandbox-benchmarks/northflank/bench_sandbox_attach_after.ts nf-compute-20
```
