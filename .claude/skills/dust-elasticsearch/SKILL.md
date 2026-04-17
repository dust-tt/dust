---
name: dust-elasticsearch
description: Create, migrate, or query Elasticsearch indices in `front`. Use when adding a new front Elasticsearch index, changing mappings or settings, wiring indexing logic, or exposing Elasticsearch-backed analytics/search endpoints.
---

# Front Elasticsearch

Use this skill when working on Elasticsearch-backed features in `front`. Keep `SKILL.md` focused on
the workflow and navigation; load the supporting reference file when you need the full examples,
curl commands, mappings, settings, or relocation details.

## Workflow

1. Read [reference.md](reference.md) before changing an existing index pattern or introducing a new
   one.
2. For environment prerequisites, current architecture, and existing index conventions, start at
   `## Prerequisites` and `## Overview of Current Architecture`.
3. For schema design, mappings, analyzers, and regional settings, use
   `## Step-by-Step: Creating a New Index`.
4. For indexing helpers, async indexing, and Temporal integration, use
   `## Step-by-Step: Indexing Data`.
5. For aggregations, query helpers, and endpoint examples, use
   `## Step-by-Step: Querying Data`.
6. If the index is workspace-scoped and must survive regional moves, use
   `## Workspace Relocation Support`.

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

## Additional Resources

- Full migrated runbook: [reference.md](reference.md)

