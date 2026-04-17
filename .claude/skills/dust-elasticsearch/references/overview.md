# Elasticsearch Overview

This reference covers environment prerequisites, current architecture, and the existing `front`
and `core` index patterns that new Elasticsearch work should follow.

## Prerequisites

### Required Environment Variables

```bash
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com:9200
ELASTICSEARCH_USERNAME=your-username
ELASTICSEARCH_PASSWORD=your-password
REGION=local  # or us-central1, europe-west1
```

These are configured in `lib/api/config.ts:316-326`.

### Required Dependencies

```json
{
  "@elastic/elasticsearch": "^8.15.0"
}
```

### Elasticsearch Plugins (for Advanced Text Search)

If using custom analyzers with ICU tokenization:

- **ICU Analysis Plugin:** Required for `icu_tokenizer`, `icu_folding`, and Unicode-aware text
  processing
- **Installation:** Usually pre-installed on managed Elasticsearch services
- **Verify:** Check if ICU plugin is installed with:

  ```bash
  # Check installed plugins
  curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
    "$ELASTICSEARCH_URL/_cat/plugins?v"

  # Or test ICU analyzer availability
  curl -XPOST -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
    "$ELASTICSEARCH_URL/_analyze" \
    -H "Content-Type: application/json" \
    -d '{"tokenizer": "icu_tokenizer", "text": "test"}'
  ```

**Note:** Simple analytics indices do not require any plugins.

## Overview of Current Architecture

### Scope of This Guide

This guide focuses on Elasticsearch indices managed in the `front` codebase, particularly
analytics indices. However, the patterns and techniques documented here apply to all Elasticsearch
indices across the codebase.

**Note:** Consider consolidating all Elasticsearch index management under a shared location in the
future to centralize patterns and reduce duplication.

### Current Indices

#### Front Analytics Indices

The `front` codebase currently has one index for agent message analytics:

- **Index Name:** `agent_message_analytics`
- **Current Version:** 2 (migrated from version 1)
- **Alias:** `front.agent_message_analytics` (write-enabled alias)
- **Purpose:** Track agent performance, tool usage, costs, and user feedback
- **Complexity:** Basic mappings, no custom analyzers

#### Core Search Indices

The `core` codebase has indices for data source search:

- **Index Name:** `data_sources_nodes`
- **Current Version:** 4 (multiple migrations)
- **Alias:** `core.data_sources_nodes` (write-enabled alias)
- **Purpose:** Full-text search across connected data sources
- **Complexity:** Custom analyzers (ICU, edge n-grams), multi-field mappings, normalizers

### Key Files (front)

- **Client:** `lib/api/elasticsearch.ts` - Singleton client with error handling
- **Front Index Definitions:** `lib/your_feature/indices/` - Mappings and settings per version
- **Index Creation Script:** `scripts/create_elasticsearch_index.ts`
- **Indexing Logic:** `temporal/es_indexation_queue/activities.ts` - Shared queue for ES indexation
