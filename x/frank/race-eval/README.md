# RACE Eval Harness

Evaluates web-search providers for AI research agents, two ways:

1. **End-to-end (RACE)**: run a research agent (a Dust agent backed by a given search provider,
   or the Parallel Task API directly) on a set of web research tasks, then grade each generated
   report against a reference report using the RACE method (Reference-based Adaptive
   Criteria-driven Evaluation).
2. **Search-layer unit test**: call each search provider's API directly with agent-style
   queries and judge the raw result sets — isolating retrieval quality from agent synthesis
   (in the E2E test, the shared model + browse pipeline dominates).

## RACE scoring

For each task, a judge model generates task-specific criteria across five dimensions —
comprehensiveness, insight, instruction_following, readability, and source_quality (citation
density, source authority, freshness, traceability) — then scores the target report and the
reference report on each criterion. The RACE score is
`target_total / (target_total + reference_total)`: 0.5 means the target matches the reference,
above 0.5 beats it. Judge prompts inject today's date so freshness is judged against reality
rather than the judge model's training cutoff.

## Setup

```bash
bun install
```

## Environment

- **Dust API**: `DUST_API_KEY` + `DUST_WORKSPACE_ID` (or `--api-key` / `--workspace-id`).
  When running inside a Dust dev environment with `FRONT_DATABASE_URI` set, the seeded dev
  workspace credentials resolve automatically.
- **Judge**: `OPENAI_API_KEY` (or `DUST_MANAGED_OPENAI_API_KEY`).
- **Provider keys** (search unit test + direct Parallel Task runs): `FIRECRAWL_API_KEY`,
  `PARALLEL_API_KEY` (or their `DUST_MANAGED_*` variants, which take priority).
- **Base URL**: `--base-url`, falling back to `DUST_FRONT_API`, then
  `NEXT_PUBLIC_DUST_API_URL`, then `https://dust.tt`.

## Dataset

A CSV with columns: `id`, `category`, `task`, `reference_report`. Each row is one research
task; `reference_report` is the baseline report the target output is judged against. The CSV
parser handles long reference reports (`max_record_size=10_000_000`).

## Commands

### Full pipeline (criteria → run variants → score → summary)

```bash
bun run src/cli.ts run-all \
  --csv tasks.csv \
  --output-prefix out/myrun \
  --variants firecrawl,parallel,parallel_task \
  --concurrency 8 \
  --judge-concurrency 8
```

Variants `firecrawl` / `parallel` run through Dust agents (one agent per variant, each
backed by a different websearch provider; set the agent sIds with `--dust-agent-id` and
`--parallel-agent-id`). The `parallel_task` variant calls the Parallel Task
Group API directly — batch submit + poll — because its multi-minute per-task synthesis exceeds
agent streaming timeouts.

**Search guard**: a variant aborts if any task completes without at least one successful
websearch (verified against the front DB when available, since streamed action lists proved
unreliable), or if >25% of searches fail across the run. This prevents silently grading
reports written from model memory instead of search results. Override with
`--allow-failed-search`.

Partial results are written to `<prefix>_<variant>_run_results.partial.json` after every task,
so progress is visible mid-run. One failed variant does not lose the others' results.

### Search-layer unit test

```bash
bun run src/cli.ts search-eval \
  --csv tasks.csv \
  --output out/search_eval_results.json \
  --output-csv out/search_eval_summary.csv \
  --providers firecrawl,parallel \
  --num 10
```

Generates one agent-style query per task (judge model), calls each provider directly, and
scores the raw result sets on relevance, coverage, freshness, authority, and content richness.
Per provider it also records latency, result counts, snippet sizes, publish-date coverage, and
errors.

### Individual steps

```bash
# Run one Dust agent variant
bun run src/cli.ts run-targets \
  --csv tasks.csv --agent-id <agent_sid> --tool firecrawl --output out/run.json

# Run the Parallel Task API directly (batch submit + poll)
bun run src/cli.ts run-parallel-task \
  --csv tasks.csv --output out/ptask.json --processor pro

# Generate per-task grading criteria
bun run src/cli.ts generate-criteria --csv tasks.csv --output out/criteria.json

# Score one variant's run results against the references
bun run src/cli.ts score-agent \
  --csv tasks.csv --criteria out/criteria.json --run-results out/run.json \
  --raw-output out/raw.json --task-output out/scores.json --cost-detail-csv out/cost.csv

# Combine per-variant task scores into a summary CSV
bun run src/cli.ts summarize \
  --parallel out/scores_parallel.json --parallel-task out/scores_ptask.json \
  --firecrawl out/scores_firecrawl.json \
  --output-csv out/summary.csv
```

### Smoke test

```bash
bun run src/smoke.ts
```

Live single-call validation of provider APIs (skipping providers without keys), query
generation, search judging, and criteria generation.

## Concurrency

All long-running commands accept `--concurrency` (and `run-all` additionally takes
`--judge-concurrency`). Defaults: 6 parallel agent conversations, 8 parallel judge calls.
Use `--from` / `--to` to run task ranges.

## Notes

- Token usage prefers Dust's returned `usage`; if absent it falls back to `1 token ~= 4 chars`
  estimates (flagged per task via `usage_source`).
- Tool action counts match the Dust tool names (`websearch` / `webbrowser`), which are
  provider-agnostic. Run results persist an `action_summary` per task as evidence of which
  tools actually ran.
- Criteria files generated before the source_quality dimension was added are incompatible —
  regenerate with `generate-criteria` before scoring.

## Parallel API notes

- `parallel` variant: Search API (`POST /v1/search`, `x-api-key` auth, `objective` +
  `search_queries` body; result `excerpts` are used as snippets).
- `parallel_task` variant: Task Group API (`POST /v1/tasks/groups`, batch run submit, poll
  group status, fetch per-run output via SSE events). Flat cost per run by processor tier;
  defaults to `pro`.
