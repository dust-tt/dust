# MCP tool-search BM25 harness

A small diagnostic to check that internal MCP tool descriptions are
**retrievable** by a lexical (BM25) tool-search index. When tools are deferred
and surfaced on demand, a search matches the user's intent against each tool's
**name + description + input schema** only (no server-level instructions). This
harness scores realistic queries against the live tool metadata and reports
whether the intended tool ranks first.

## Run

```sh
# from front/
npx tsx scripts/mcp_bm25/run.ts
```

Output is one row per query with the rank of the expected tool, a `<-- MISS`
marker when it falls outside the allowed rank, and a top-1 summary.

## Files

- `bm25.ts` — BM25 ranker (k1=1.2, b=0.75) and the tokenizer.
- `corpus.ts` — builds the document corpus from live server metadata. Each tool
  becomes one document = name + description + every description / property key /
  enum value in its input schema.
- `queries.ts` — labeled queries (`query` -> server-qualified `expected` tool).
- `run.ts` — wires the registered servers and queries together and prints the
  report.

## Adding a server

1. Import its metadata in `run.ts` and add it to `SERVERS`.
2. Add a block of realistic queries for it in `queries.ts`.

## Reading the results

A miss usually points to one of:

- **Missing intent vocabulary** — the description uses one verb ("get") while
  users type another ("read", "open"). BM25 has no synonyms, so add the words
  people actually use.
- **Sibling / cross-server collision** — two tools share too much wording (e.g.
  two search tools, or `copy_file` in two servers). Give each tool its own
  discriminating vocabulary and a platform token; avoid cross-referencing
  another tool by name, which bleeds its keywords in.
- **Oversized parameter descriptions** — a very long input schema (e.g. a query
  field with pages of syntax help) dilutes the tool's term weights via BM25
  length normalization and pushes it down the ranking.

## Caveats

The harness approximates a real index: it weights name, description, and input
schema equally and uses crude singularization rather than full stemming.
Treat the ranks as directional signal, not ground truth.
