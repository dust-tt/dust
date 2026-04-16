---
name: dust-elasticsearch
description: Create, migrate, or query Elasticsearch indices in `front`. Use when adding a new front Elasticsearch index, changing mappings or settings, wiring indexing logic, or exposing Elasticsearch-backed analytics/search endpoints.
---

# Front Elasticsearch

Create Elasticsearch indices in `front` with the same patterns used by existing analytics and
search code. Keep the skill self-contained: define the document shape, add versioned mappings and
regional settings, register the alias, wire indexing/query helpers, and validate the resulting
index.

## Core Files

Create or update the following files for a new index:

- `front/types/<feature>/<index>.ts` for the document type
- `front/lib/<feature>/indices/<index>_<version>.mappings.json`
- `front/lib/<feature>/indices/<index>_<version>.settings.local.json`
- `front/lib/<feature>/indices/<index>_<version>.settings.us-central1.json`
- `front/lib/<feature>/indices/<index>_<version>.settings.europe-west1.json`
- `front/lib/api/elasticsearch.ts` for the alias constant and `INDEX_DIRECTORIES`
- `front/lib/<feature>/<index>.ts` or similar for indexing and query helpers

Use these existing implementations as references:

- `front/lib/user_search/indices/`
- `front/lib/user_search/index.ts`
- `core/src/search_stores/indices/data_sources_nodes_4.*` for advanced analyzers

## Workflow

### 1. Define the document type

Create a TypeScript type that extends `ElasticsearchBaseDocument` from
`front/lib/api/elasticsearch`. Do not redeclare `workspace_id`; it comes from the base type.

Keep the document explicit and stable:

- include the primary business identifier, usually as a `keyword`
- include an update timestamp such as `updated_at`
- use nested objects only when element-level relationships matter

### 2. Create mappings

Add `<index>_<version>.mappings.json` under `front/lib/<feature>/indices/`.

Default mapping choices:

- `keyword` for ids, enums, and fields used for exact filters or aggregations
- `text` for full-text search
- `date` for timestamps
- `integer` / `long` / `short` for numeric values
- `nested` only when array item relationships must be preserved
- `"index": false` on large retrievable text that should not be searchable

For fields that need multiple search modes, use multi-fields:

- main `text` field for full-text
- `.edge` with edge n-grams for prefix search
- `.keyword` for exact match and sorting

If indexing email addresses, prefer a `uax_url_email`-based analyzer so the address is preserved as
one searchable token instead of being split into noisy fragments.

### 3. Create regional settings

Add settings files for `local`, `us-central1`, and `europe-west1`.

Use these defaults unless the workload justifies something else:

- local: `1` shard, `0` replicas, `1s` refresh interval
- production: `3` shards, `1` replica, `30s` refresh interval

Only add custom analyzers when the index genuinely needs search behavior beyond exact match or basic
full-text. If you do, mirror the patterns used by `data_sources_nodes` in `core`.

If you rely on ICU analyzers, make sure the Elasticsearch cluster has the ICU analysis plugin.

### 4. Register the index alias

In `front/lib/api/elasticsearch.ts`:

- export `YOUR_INDEX_ALIAS_NAME = "front.<index_name>"`
- add the index directory to `INDEX_DIRECTORIES`

This is how the index creation script locates mappings and settings for the alias.

### 5. Create the index

Use the existing script:

```bash
tsx front/scripts/create_elasticsearch_index.ts \
  --index-name <index_name> \
  --index-version <version> \
  --skip-confirmation
```

Use `--remove-previous-alias` only for migrations where the alias should stop writing to the
previous version.

The script creates:

- index `front.<index_name>_<version>`
- alias `front.<index_name>` with `is_write_index: true`

### 6. Wire indexing helpers

Add a helper module such as `front/lib/<feature>/<index>.ts`.

Follow these rules:

- generate stable document ids from workspace id plus business id
- write through `withEs(...)`
- use `client.index(...)` for full document upserts
- use `client.update(...)` only for partial updates
- use `client.bulk(...)` for batch writes with `refresh: false`

Prefer asynchronous indexing via the shared Temporal ES indexation queue when the write does not
need to block the user request.

### 7. Add query helpers

For analytics or search endpoints:

- always filter by `workspace_id`
- add the narrowest possible filters before aggregating
- use `size: 0` for aggregation-only requests
- keep query construction explicit; avoid post-filtering in application code

Common aggregation patterns:

- `terms` for breakdowns
- `date_histogram` for time series
- `avg`, `sum`, `percentiles` for metrics
- `nested` aggregations only for nested fields

### 8. Support relocation when needed

If the index stores per-workspace data that must be rebuilt during region relocation:

- add a recreation activity under
  `front/temporal/relocation/activities/destination_region/front/es_indexation.ts`
- call it from
  `front/temporal/relocation/workflows.ts#workspaceRelocateFrontEsIndexationWorkflow`

Use `recreateUserSearchIndex` as the model.

## Validation

Before considering the work complete, verify:

- the document type matches the JSON mappings
- settings exist for all three regions
- the alias constant and `INDEX_DIRECTORIES` entry were added
- the index creation script succeeds for the new version
- indexing uses stable ids and the correct alias
- query helpers always scope by workspace
- relocation support exists if the data is workspace-scoped and must survive regional moves

## Common Mistakes

- indexing ids as `text` instead of `keyword`
- using `nested` where a plain object array is enough
- forgetting the production settings files
- querying documents without a `workspace_id` filter
- writing synchronously in a hot path when Temporal would be safer
- adding custom analyzers without a concrete search requirement
