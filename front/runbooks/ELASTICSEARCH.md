# Elasticsearch Runbook: Creating and Using New Indices

This runbook provides step-by-step instructions for creating a new Elasticsearch index in the Dust front codebase and integrating it into the application.

---

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

- **ICU Analysis Plugin:** Required for `icu_tokenizer`, `icu_folding`, and Unicode-aware text processing
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

---

## Overview of Current Architecture

### Scope of This Runbook

This runbook currently focuses on Elasticsearch indices managed in the `front` codebase, particularly analytics indices. However, the patterns and techniques documented here apply to all Elasticsearch indices across the codebase.

**Note:** Consider consolidating all Elasticsearch index management under a shared location in the future to centralize patterns and reduce duplication.

### Current Indices

#### Front Analytics Indices

The front codebase currently has one index for agent message analytics:

- **Index Name:** `agent_message_analytics`
- **Current Version:** 2 (migrated from version 1)
- **Alias:** `front.agent_message_analytics` (write-enabled alias)
- **Purpose:** Track agent performance, tool usage, costs, and user feedback
- **Complexity:** Basic mappings, no custom analyzers

#### Core Search Indices

The core codebase has indices for data source search:

- **Index Name:** `data_sources_nodes`
- **Current Version:** 4 (multiple migrations)
- **Alias:** `core.data_sources_nodes` (write-enabled alias)
- **Purpose:** Full-text search across connected data sources
- **Complexity:** Custom analyzers (ICU, edge n-grams), multi-field mappings, normalizers

### Key Files (front)

- **Client:** `lib/api/elasticsearch.ts` - Singleton client with error handling
- **Front Index Definitions:** `lib/you_feature/indices/` - Mappings and settings per version
- **Index Creation Script:** `scripts/create_elasticsearch_index.ts`
- **Indexing Logic:** `temporal/es_indexation_queue/activities.ts` - Shared queue for ES indexation

---

## Step-by-Step: Creating a New Index

### Step 1: Define Your Document Schema

Create a TypeScript interface in `types/` directory:

```typescript
// types/your_feature/your_index.ts
import type { ElasticsearchBaseDocument } from "@/lib/api/elasticsearch";

// ElasticsearchBaseDocument provides: workspace_id (for workspace isolation)
export interface YourIndexData extends ElasticsearchBaseDocument {
  your_entity_id: string; // Your primary identifier

  // Your custom fields
  status: "success" | "failed";
  metadata: {
    field1: string;
    field2: number;
  };

  // Nested arrays if needed
  nested_data: Array<{
    item_id: string;
    value: number;
  }>;

  // It is recommended to store the date at which the document was created/updated. Useful for
  // potential future migrations
  updated_at: Date;
}
```

**Note:** The `workspace_id` field is automatically provided by `ElasticsearchBaseDocument` and should not be redeclared.

**Example:** See `types/user_search/user_search.ts`.

### Step 2: Create Mappings File

Create `lib/your_feature/indices/your_index_name_1.mappings.json`:

```json
{
  "properties": {
    "workspace_id": {
      "type": "keyword"
    },
    "your_entity_id": {
      "type": "keyword"
    },
    "timestamp": {
      "type": "date"
    },
    "status": {
      "type": "keyword"
    },
    "metadata": {
      "properties": {
        "field1": {
          "type": "keyword"
        },
        "field2": {
          "type": "integer"
        }
      }
    },
    "nested_data": {
      "type": "nested",
      "properties": {
        "item_id": {
          "type": "keyword"
        },
        "value": {
          "type": "integer"
        }
      }
    }
  }
}
```

**Example:** See `lib/user_search/indices`

**Important Mapping Decisions:**

- Use `keyword` for exact-match fields (IDs, statuses, categories)
- Use `text` for full-text search (but note: can be expensive)
- Use `integer`, `long`, `short` for numeric data
- Use `date` for timestamps
- Use `nested` type when you need to preserve array element relationships
- Use `"index": false` on `text` fields if you want retrievable (to avoid roundtrip to DB) but not indexed/searchable content

#### Multi-Field Mappings with Custom Analyzers

When you need to search a field in multiple ways (exact match, prefix search, full-text), use multi-field mappings with the `fields` property:

```json
{
  "properties": {
    "title": {
      "type": "text",
      "analyzer": "standard",
      "fields": {
        "edge": {
          "type": "text",
          "analyzer": "edge_analyzer",
          "search_analyzer": "standard"
        },
        "keyword": {
          "type": "keyword"
        }
      }
    },
    "username": {
      "type": "keyword",
      "normalizer": "custom_normalizer",
      "fields": {
        "text": {
          "type": "text",
          "analyzer": "icu_analyzer"
        }
      }
    }
  }
}
```

**Multi-Field Use Cases:**

- `title` (main field): Full-text search with standard analyzer
- `title.edge`: Prefix/autocomplete search with edge n-grams
- `title.keyword`: Exact match, sorting, aggregations
- `username`: Case-insensitive exact match with normalizer
- `username.text`: Full-text search on username

**Important Note on Email Addresses:**

If you intend to index email addresses, you should use the `uax_url_email` tokenizer, which ensures that emails are indexed in a way that serves both exact match and autocompletion. Without it, the email ends up being tokenized into noisy tokens (e.g., `@gmail.com` is tokenized separately, breaking the email structure). Example:

```json
{
  "properties": {
    "email": {
      "type": "text",
      "analyzer": "email_analyzer",
      "fields": {
        "keyword": {
          "type": "keyword"
        }
      }
    }
  }
}
```

Where `email_analyzer` would be defined in your index settings with:

```json
{
  "analysis": {
    "tokenizer": {
      "uax_url_email_tokenizer": {
        "type": "uax_url_email",
        "filter": ["lowercase", "asciifolding"]
      }
    },
    "analyzer": {
      "uax_analyzer": {
        "type": "custom",
        "tokenizer": "uax_url_email_tokenizer"
      }
    }
  }
}
```

**Example:** See `front/lib/user_search/indices`.

**Querying Multi-Fields:**

```typescript
// Exact match
{ term: { "title.keyword": "Exact Title" } }

// Prefix search (autocomplete) - use match_phrase_prefix with edge n-grams
{ match_phrase_prefix: { "title.edge": "pre" } }

// Full-text search
{ match: { "title": "search terms" } }

// Case-insensitive username
{ term: { "username": "John" } } // matches "john", "JOHN", etc.
```

**Example:** See `core/src/search_stores/indices/data_sources_nodes_4.mappings.json` for production multi-field examples.

### Step 3: Create Settings Files (Regional)

Create settings files for each region. Settings can include basic index configuration (shards, replicas, refresh) and optionally custom analyzers/tokenizers for advanced text search.

#### Basic Settings (Simple Use Case)

For simple indices without full-text search requirements:

**`lib/your_feature/indices/your_index_name_1.settings.local.json`:**

```json
{
  "number_of_shards": 1,
  "number_of_replicas": 0,
  "refresh_interval": "1s"
}
```

**`lib/your_feature/indices/your_index_name_1.settings.us-central1.json`:**

```json
{
  "number_of_shards": 3,
  "number_of_replicas": 1,
  "refresh_interval": "30s"
}
```

**`lib/your_feature/indices/your_index_name_1.settings.europe-west1.json`:**

```json
{
  "number_of_shards": 3,
  "number_of_replicas": 1,
  "refresh_interval": "30s"
}
```

**Settings Guidelines:**

- **Local:** 1 shard, 0 replicas, fast refresh (1s)
- **Production:** 3 shards, 1 replica, slower refresh (30s for better performance)
- Adjust `number_of_shards` based on expected data volume
- `refresh_interval` controls how often new data becomes searchable (trade-off: freshness vs performance)

#### Advanced Settings with Custom Analyzers (Search Use Case)

For indices requiring advanced text search (like data source nodes in core), include custom analyzers and tokenizers in the settings:

**`lib/your_feature/indices/your_index_name_1.settings.us-central1.json`:**

```json
{
  "number_of_shards": 2,
  "number_of_replicas": 1,
  "refresh_interval": "5s",
  "analysis": {
    "analyzer": {
      "icu_analyzer": {
        "type": "custom",
        "tokenizer": "icu_tokenizer",
        "filter": [
          "icu_folding",
          "lowercase",
          "asciifolding",
          "preserve_word_delimiter"
        ]
      },
      "edge_analyzer": {
        "type": "custom",
        "tokenizer": "icu_tokenizer",
        "filter": ["lowercase", "edge_ngram_filter"]
      }
    },
    "normalizer": {
      "custom_normalizer": {
        "type": "custom",
        "filter": ["lowercase", "asciifolding"]
      }
    },
    "filter": {
      "preserve_word_delimiter": {
        "type": "word_delimiter",
        "split_on_numerics": false,
        "split_on_case_change": false
      },
      "edge_ngram_filter": {
        "type": "edge_ngram",
        "min_gram": 1,
        "max_gram": 20
      }
    }
  }
}
```

**Key Analyzer Concepts:**

- **Analyzer:** Controls how text is processed for indexing and searching (tokenization + filters)
- **Tokenizer:** Breaks text into tokens (e.g., `icu_tokenizer` for Unicode-aware tokenization)
- **Filters:** Transform tokens (e.g., `lowercase`, `asciifolding`, `edge_ngram`)
- **Normalizer:** Like analyzer but for keyword fields (doesn't tokenize, only applies filters)

**Common Analyzers:**

- `standard`: Default analyzer, basic tokenization
- `icu_analyzer`: Unicode-aware, handles international text, applies case/accent folding
- `edge_analyzer`: For prefix/autocomplete search using edge n-grams

**Common Filters:**

- `lowercase`: Converts to lowercase
- `asciifolding`: Converts accented characters to ASCII (é → e)
- `icu_folding`: Unicode case/accent folding
- `word_delimiter`: Splits on word boundaries (camelCase, snake_case)
- `edge_ngram`: Creates prefix tokens for autocomplete

**Reference:** See `core/src/search_stores/indices/data_sources_nodes_4.settings.*.json` for production examples.

### Step 4: Create Index Constant

Add to `lib/api/elasticsearch.ts`:

```typescript
export const YOUR_INDEX_ALIAS_NAME = "front.your_index_name";

export const INDEX_DIRECTORIES: Record<string, string> = {
  ...
  your_index_name: "lib/your_feature/indices",
  ...
};
```

### Step 5: Run Index Creation Script

```bash
tsx front/scripts/create_elasticsearch_index.ts \
  --index-name your_index_name \
  --index-version 1 \
  --skip-confirmation
```

**What this script does (from `scripts/create_elasticsearch_index.ts:1-201`):**

1. Reads settings from `lib/*/indices/your_index_name_1.settings.{region}.json`
2. Reads mappings from `lib/*/indices/your_index_name_1.mappings.json`
3. Creates index named: `front.your_index_name_1`
4. Creates alias: `front.your_index_name` pointing to `front.your_index_name_1` with `is_write_index: true`

**Optional Flags:**

- `--skip-confirmation` - Skip confirmation prompts
- `--remove-previous-alias` - Remove alias from previous version (use when migrating)

### Step 6: Verify Index Creation

```bash
# Check index exists
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/front.your_index_name_1"

# Check alias
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/_alias/front.your_index_name"
```

---

## Step-by-Step: Indexing Data

### Step 1: Create Indexing Function

Create a file `lib/your_feature/your_index.ts`:

```typescript
import type { Result } from "@/lib/result";
import type { ElasticsearchError } from "@/lib/api/elasticsearch";
import { withEs, YOUR_INDEX_ALIAS_NAME } from "@/lib/api/elasticsearch";
import type { YourIndexData } from "@/types/your_feature/your_index";

// Generate unique document ID
function makeYourDocumentId({
  workspaceId,
  entityId,
}: {
  workspaceId: string;
  entityId: string;
}): string {
  return `${workspaceId}_${entityId}`;
}

// Store document to Elasticsearch
export async function storeYourData(
  document: YourIndexData
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeYourDocumentId({
    workspaceId: document.workspace_id,
    entityId: document.your_entity_id,
  });

  return withEs(async (client) => {
    await client.index({
      index: YOUR_INDEX_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  });
}

// Update existing document
export async function updateYourData(
  documentId: string,
  partialUpdate: Partial<YourIndexData>
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.update({
      index: YOUR_INDEX_ALIAS_NAME,
      id: documentId,
      body: {
        doc: partialUpdate,
      },
    });
  });
}

// Bulk indexing for batch operations
export async function bulkStoreYourData(
  documents: YourIndexData[]
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const body = documents.flatMap((doc) => {
      const documentId = makeYourDocumentId({
        workspaceId: doc.workspace_id,
        entityId: doc.your_entity_id,
      });

      return [
        { index: { _index: YOUR_INDEX_ALIAS_NAME, _id: documentId } },
        doc,
      ];
    });

    await client.bulk({
      body,
      refresh: false, // Don't force refresh for performance
    });
  });
}
```

See examples in `lib/user_search/index.ts`.

### Step 2: Integrate with Temporal (Optional but Recommended)

For asynchronous, reliable indexing, use the shared temporal `es_indexation` queue.

**Create activity file:** `temporal/es_indexation_queue/activities.ts`

```typescript
import { storeYourData } from "@/lib/analytics/your_index";
import type { YourIndexData } from "@/types/your_feature/your_index";

export async function storeYourAnalyticsActivity({
  entityId,
  workspaceId,
}: {
  entityId: string;
  workspaceId: string;
}): Promise<void> {
  // Fetch entity data from database
  const entity = await YourEntity.findOne({
    where: { sId: entityId },
  });

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Build document
  const document: YourIndexData = {
    workspace_id: workspaceId,
    your_entity_id: entityId,
    timestamp: new Date().toISOString(),
    // ... build your document
  };

  // Store to Elasticsearch
  const result = await storeYourData(document);

  if (result.isErr()) {
    throw new Error(`Failed to store analytics: ${result.error.message}`);
  }
}
```

**Trigger from workflow:**

```typescript
await context.workflow.executeChild(YourAnalyticsWorkflow, {
  args: [{ entityId, workspaceId }],
  workflowId: `your-analytics-${entityId}`,
});
```

---

## Step-by-Step: Querying Data

### Step 1: Create Query Utility Module

Create `lib/api/your_feature/queries/your_query.ts`:

```typescript
import type { Result } from "@/lib/result";
import type { ElasticsearchError } from "@/lib/api/elasticsearch";
import {
  searchAnalytics,
  YOUR_INDEX_ALIAS_NAME,
} from "@/lib/api/elasticsearch";
import type { YourIndexData } from "@/types/your_feature/your_index";

interface YourQueryParams {
  workspaceId: string;
  days?: number;
  entityId?: string;
}

interface YourQueryResult {
  totalCount: number;
  successCount: number;
  failureCount: number;
  averageValue: number;
}

export async function queryYourData({
  workspaceId,
  days,
  entityId,
}: YourQueryParams): Promise<Result<YourQueryResult, ElasticsearchError>> {
  // Build base filters
  const filters: any[] = [{ term: { workspace_id: workspaceId } }];

  if (entityId) {
    filters.push({ term: { your_entity_id: entityId } });
  }

  if (days) {
    filters.push({
      range: {
        timestamp: {
          gte: `now-${days}d/d`,
        },
      },
    });
  }

  // Build query with aggregations
  const query = {
    bool: {
      filter: filters,
    },
  };

  const aggregations = {
    total_count: {
      value_count: {
        field: "your_entity_id",
      },
    },
    success_count: {
      filter: {
        term: { status: "success" },
      },
    },
    failure_count: {
      filter: {
        term: { status: "failed" },
      },
    },
    average_value: {
      avg: {
        field: "metadata.field2",
      },
    },
  };

  // Execute search
  const result = await searchAnalytics<YourIndexData, typeof aggregations>(
    query,
    {
      aggregations,
      size: 0, // We only want aggregations, no documents
    }
  );

  if (result.isErr()) {
    return result;
  }

  const { aggregations: aggs } = result.value;

  return {
    isOk: () => true,
    isErr: () => false,
    value: {
      totalCount: aggs.total_count.value,
      successCount: aggs.success_count.doc_count,
      failureCount: aggs.failure_count.doc_count,
      averageValue: aggs.average_value.value || 0,
    },
  } as Result<YourQueryResult, ElasticsearchError>;
}
```

### Step 2: Common Query Patterns

#### Pattern 1: Simple Aggregation

```typescript
const aggregations = {
  unique_entities: {
    cardinality: {
      field: "your_entity_id",
    },
  },
  status_breakdown: {
    terms: {
      field: "status",
      size: 10,
    },
  },
};
```

#### Pattern 2: Date Histogram (Time Series)

```typescript
const aggregations = {
  over_time: {
    date_histogram: {
      field: "timestamp",
      calendar_interval: "day",
      format: "yyyy-MM-dd",
    },
    aggs: {
      success_count: {
        filter: { term: { status: "success" } },
      },
    },
  },
};
```

#### Pattern 3: Nested Aggregation

```typescript
const aggregations = {
  nested_stats: {
    nested: {
      path: "nested_data",
    },
    aggs: {
      total_value: {
        sum: {
          field: "nested_data.value",
        },
      },
      by_item: {
        terms: {
          field: "nested_data.item_id",
          size: 50,
        },
        aggs: {
          avg_value: {
            avg: {
              field: "nested_data.value",
            },
          },
        },
      },
    },
  },
};
```

#### Pattern 4: Percentile Metrics

```typescript
const aggregations = {
  value_percentiles: {
    percentiles: {
      field: "metadata.field2",
      percents: [50, 95, 99],
    },
  },
};
```

#### Pattern 5: Nested Filter with Parent Result

```typescript
// Query for parent documents that have specific nested conditions
const query = {
  bool: {
    filter: [
      { term: { workspace_id: workspaceId } },
      {
        nested: {
          path: "nested_data",
          query: {
            bool: {
              filter: [
                { term: { "nested_data.item_id": specificItemId } },
                { range: { "nested_data.value": { gte: 100 } } },
              ],
            },
          },
        },
      },
    ],
  },
};
```

### Step 3: Create API Endpoint

Create `pages/api/w/[wId]/your_feature/stats.ts`:

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import { withSessionAuthentication } from "@/server/auth/wrappers";
import { Authenticator } from "@/server/auth";
import { apiError } from "@/lib/api_errors";
import { queryYourData } from "@/lib/api/your_feature/queries/your_query";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(req, res);

  if (!auth.workspace()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const entityId = req.query.entityId as string | undefined;

      const result = await queryYourData({
        workspaceId: auth.workspace().sId,
        days,
        entityId,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json(result.value);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_allowed",
          message: "Method not allowed",
        },
      });
  }
}

export default withSessionAuthentication(handler);
```
