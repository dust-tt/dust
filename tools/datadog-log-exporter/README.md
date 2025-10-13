# Datadog Log Exporter

Export large ranges of Datadog logs to CSV. Paginates by timestamp (newest → oldest), handles rate limits, and can resume after interruption.

Requirements

- Node 18+
- Env vars: `DATADOG_API_KEY`, `DATADOG_APP_KEY` (optional `DATADOG_SITE`, default `datadoghq.com`)

Quick Start

- `cd tools/datadog-log-exporter`
- `./run.sh --query '@connectorId:145 @action:skip_deletion' --columns 'timestamp,id,connectorId,action,message,service,host' --out logs.csv`

Columns

- Use Datadog attribute names without the leading `@` (e.g., `@http.status_code` → `http.status_code`).
- Special columns: `id`, `timestamp`.

Options

- `--query <q>`: Datadog log query (required)
- `--columns <c1,c2,...>`: CSV columns (required)
- `--out <path>`: Output CSV (default `datadog-logs.csv`)
- `--from <ISO>` / `--to <ISO>`: Time range (default last 14 days)
- `--page-limit <n≤1000>`: Page size (default 1000)
- `--target-per-window <n>`: Target logs per window (default 2000)
- `--initial-window|--max-window|--min-window <dur>`: Defaults 15m / 6h / 1m
- `--resume <true|false>`: Resume from state (default true)

Resume

- Uses `<out>.state.json`. Re-run the same command (same `--out`) to continue where it left off.

Fresh Run

- Delete the CSV and its state file to start over.
