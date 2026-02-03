# Northflank sandbox benchmarks

Convenience wrappers + notes for running Northflank sandbox benchmarks from this repo.

The benchmark implementations live in:
- `front/admin/bench_sandbox.ts` (cold start: create → exec readiness → delete)
- `front/admin/bench_sandbox_attach_after.ts` (repro: attach volume after ready → exec)

## Prereqs

- Node installed (recommended: `nvm use` from repo root)
- `NORTHFLANK_API_TOKEN` set
- Optional: `NORTHFLANK_PROJECT_ID` (defaults to `dust-sandbox-dev` in the scripts)

## Bench: cold start latency

From repo root:

```bash
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox.sh nf-compute-20 -n 25
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox.sh nf-compute-20 -n 25 --no-delete-between-runs
```

## Bench: attach-after-ready pattern

From repo root:

```bash
./x/henry/sandbox-benchmarks/northflank/run_bench_sandbox_attach_after.sh nf-compute-20 nf-compute-100-2 nf-compute-200
```

