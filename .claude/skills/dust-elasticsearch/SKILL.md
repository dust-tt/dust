---
name: dust-elasticsearch
description: Create, migrate, or query Elasticsearch indices in `front`. Use when adding a new front Elasticsearch index, changing mappings or settings, wiring indexing logic, or exposing Elasticsearch-backed analytics/search endpoints.
---

# Front Elasticsearch

Use this skill when working on Elasticsearch-backed features in `front`. `SKILL.md` covers the
default path for routine work. You should only load the supporting references when you need deeper
material such as analyzer design, full curl verification, query recipes, or relocation details.

## Default Workflow

1. Decide whether you are:
   - adding a brand-new index
   - shipping a new version of an existing index
   - only changing indexing or querying logic on top of an existing alias
2. Define the document type under `front/types/...`.
   - Extend `ElasticsearchBaseDocument` for workspace-scoped indices instead of redeclaring
     `workspace_id`.
   - Keep a stable primary identifier in the document and include a migration-friendly timestamp
     such as `updated_at` when backfills or version bumps are likely.
3. Create versioned mappings and per-region settings under `front/lib/<feature>/indices/`.
   - Prefer `keyword` for ids and enums, `date` for timestamps, numeric field types for metrics,
     `nested` only when array element relationships matter, and `text` only when full-text search
     is actually required.
4. Register the stable alias and index directory in `front/lib/api/elasticsearch.ts`.
   - App code should read and write through the alias, not a concrete versioned index name.
5. Create the physical index with `tsx front/scripts/create_elasticsearch_index.ts`.
   - The normal shape is `front.<index_name>_<version>` behind alias `front.<index_name>`.
6. Add indexing helpers using deterministic document ids and alias-based writes.
   - The common pattern is `${workspaceId}_${entityId}` or an equivalent deterministic key.
   - Use `withEs(...)` and `client.index`, `client.update`, or `client.bulk`.
7. Add query helpers or endpoints.
   - Start with `bool.filter`.
   - Include `workspace_id` for workspace-scoped indices.
   - Use `size: 0` for aggregation-only queries.
8. If indexing is asynchronous or retry-prone, wire it through the shared Temporal ES queue.
9. If the index must survive workspace relocation between regions, add the relocation activity and
   workflow hook.

## Core Rules

- Keep one mappings file per index version and one settings file per region.
- Use version bumps for incompatible mapping or analyzer changes rather than mutating a live index
  in place.
- Simple analytics indices usually do not need custom analyzers or Elasticsearch plugins.
- If you need prefix search, multi-field mappings, ICU analyzers, or email-aware tokenization,
  read [references/create-index.md](references/create-index.md) before editing mappings.
- Prefer async indexing through `front/temporal/es_indexation/*` when the write path does not need
  to block on Elasticsearch freshness.
- Check relocation requirements for any workspace-scoped index that is expected to remain available
  after workspace region moves.

## Current Architecture

This skill focuses on Elasticsearch indices managed in `front`, especially analytics-style indices,
but the patterns also match the broader Dust Elasticsearch setup.

Current examples to copy from:

- `front.agent_message_analytics`
  - version `2`
  - write alias `front.agent_message_analytics`
  - basic mappings, no custom analyzers
- `core.data_sources_nodes`
  - version `4`
  - write alias `core.data_sources_nodes`
  - advanced analyzers, edge n-grams, multi-field mappings, and normalizers

The general pattern is:

- versioned physical indices such as `front.<index_name>_<version>`
- one stable alias such as `front.<index_name>` for app reads and writes
- mappings and region-specific settings stored alongside the feature code

## Primary Files

- `front/lib/api/elasticsearch.ts`
- `front/scripts/create_elasticsearch_index.ts`
- `front/lib/*/indices/*.mappings.json`
- `front/lib/*/indices/*.settings.{region}.json`
- `front/temporal/es_indexation/*`
- `front/temporal/relocation/activities/destination_region/front/es_indexation.ts`
- `front/temporal/relocation/workflows.ts`

## Existing References In Code

- `front/lib/user_search/indices/`
- `front/lib/user_search/index.ts`
- `front/lib/analytics/indices/`
- `core/src/search_stores/indices/data_sources_nodes_4.*`

## Validation

- The document type and mappings agree on field names and field kinds.
- The index has a stable alias constant and an `INDEX_DIRECTORIES` entry.
- The version in the script invocation matches the versioned mappings/settings filenames.
- Writes target the alias constant rather than a concrete versioned index name.
- Query helpers filter by `workspace_id` when the index is workspace-scoped.
- Aggregation-only queries use `size: 0`.
- Temporal integration exists when indexing is asynchronous or needs retries.
- Relocation support exists when the index must be rebuilt in a destination region.

## Supporting References

- Environment setup and plugin checks:
  [references/overview.md](references/overview.md)
- Full index creation and migration details, including analyzers and curl verification:
  [references/create-index.md](references/create-index.md)
- Indexing helper and Temporal examples:
  [references/indexing.md](references/indexing.md)
- Query and aggregation patterns:
  [references/querying.md](references/querying.md)
- Workspace relocation support:
  [references/relocation.md](references/relocation.md)
