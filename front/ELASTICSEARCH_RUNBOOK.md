# Elasticsearch Runbook: Creating and Using New Indices

This runbook provides step-by-step instructions for creating a new Elasticsearch index in the Dust front codebase and integrating it into the application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Overview of Current Architecture](#overview-of-current-architecture)
3. [Step-by-Step: Creating a New Index](#step-by-step-creating-a-new-index)
4. [Step-by-Step: Indexing Data](#step-by-step-indexing-data)
5. [Step-by-Step: Querying Data](#step-by-step-querying-data)
6. [Best Practices](#best-practices)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Environment Variables

```bash
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com:9200
ELASTICSEARCH_USERNAME=your-username
ELASTICSEARCH_PASSWORD=your-password
DUST_REGION=local  # or us-central1, europe-west1
```

These are configured in `lib/api/config.ts:316-326`.

### Required Dependencies

```json
{
  "@elastic/elasticsearch": "^8.15.0"
}
```

---

## Overview of Current Architecture

### Current Indices

The codebase currently has one index for agent message analytics:

- **Index Name:** `agent_message_analytics`
- **Current Version:** 2 (migrated from version 1)
- **Alias:** `front.agent_message_analytics` (write-enabled alias)
- **Purpose:** Track agent performance, tool usage, costs, and user feedback

### Key Files

- **Client:** `lib/api/elasticsearch.ts` - Singleton client with error handling
- **Index Definitions:** `lib/analytics/indices/` - Mappings and settings per version
- **Index Creation Script:** `scripts/create_elasticsearch_index.ts`
- **Indexing Logic:** `temporal/analytics_queue/activities.ts`
- **Query Utilities:** `lib/api/assistant/observability/` (11 query modules)
- **Type Definitions:** `types/assistant/analytics.ts`

---

## Step-by-Step: Creating a New Index

### Step 1: Define Your Document Schema

Create a TypeScript interface in `types/` directory:

```typescript
// types/your_feature/your_index.ts
import type { ElasticsearchBaseDocument } from "@/types/assistant/analytics";

export interface YourIndexData extends ElasticsearchBaseDocument {
  workspace_id: string;          // Required for workspace isolation
  version: string;               // Required for versioning
  your_entity_id: string;        // Your primary identifier
  timestamp: string;             // ISO date string

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
}
```

### Step 2: Create Mappings File

Create `lib/analytics/indices/your_index_name_1.mappings.json`:

```json
{
  "properties": {
    "workspace_id": {
      "type": "keyword"
    },
    "version": {
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

**Important Mapping Decisions:**

- Use `keyword` for exact-match fields (IDs, statuses, categories)
- Use `text` for full-text search (but note: can be expensive)
- Use `integer`, `long`, `short` for numeric data
- Use `date` for timestamps
- Use `nested` type when you need to preserve array element relationships
- Use `"index": false` on `text` fields if you want searchable but not indexed content

### Step 3: Create Settings Files (Regional)

Create settings files for each region:

**`lib/analytics/indices/your_index_name_1.settings.local.json`:**
```json
{
  "index": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "refresh_interval": "1s"
  }
}
```

**`lib/analytics/indices/your_index_name_1.settings.us-central1.json`:**
```json
{
  "index": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  }
}
```

**`lib/analytics/indices/your_index_name_1.settings.europe-west1.json`:**
```json
{
  "index": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  }
}
```

**Settings Guidelines:**

- **Local:** 1 shard, 0 replicas, fast refresh (1s)
- **Production:** 3 shards, 1 replica, slower refresh (30s for better performance)
- Adjust `number_of_shards` based on expected data volume
- `refresh_interval` controls how often new data becomes searchable (trade-off: freshness vs performance)

### Step 4: Create Index Constant

Add to `lib/api/elasticsearch.ts`:

```typescript
export const YOUR_INDEX_ALIAS_NAME = "front.your_index_name";
```

### Step 5: Run Index Creation Script

```bash
tsx front/scripts/create_elasticsearch_index.ts \
  --index-name your_index_name \
  --index-version 1 \
  --skip-confirmation
```

**What this script does (from `scripts/create_elasticsearch_index.ts:1-201`):**

1. Reads settings from `lib/analytics/indices/your_index_name_1.settings.{region}.json`
2. Reads mappings from `lib/analytics/indices/your_index_name_1.mappings.json`
3. Creates index named: `front.your_index_name_1`
4. Creates alias: `front.your_index_name` pointing to `front.your_index_name_1` with `is_write_index: true`

**Optional Flags:**
- `--skip-confirmation` - Skip confirmation prompts
- `--remove-previous-alias` - Remove alias from previous version (use when migrating)

### Step 6: Verify Index Creation

```bash
# Check index exists
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/front.your_index_name"

# Check alias
curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD \
  "$ELASTICSEARCH_URL/_alias/front.your_index_name"
```

---

## Step-by-Step: Indexing Data

### Step 1: Create Indexing Function

Create a file `lib/analytics/your_index.ts`:

```typescript
import type { Result } from "@/lib/result";
import type { ElasticsearchError } from "@/lib/api/elasticsearch";
import { withEs, YOUR_INDEX_ALIAS_NAME } from "@/lib/api/elasticsearch";
import type { YourIndexData } from "@/types/your_feature/your_index";

// Generate unique document ID
function makeYourDocumentId({
  workspaceId,
  entityId,
  version,
}: {
  workspaceId: string;
  entityId: string;
  version: string;
}): string {
  return `${workspaceId}_${entityId}_${version}`;
}

// Store document to Elasticsearch
export async function storeYourData(
  document: YourIndexData
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeYourDocumentId({
    workspaceId: document.workspace_id,
    entityId: document.your_entity_id,
    version: document.version,
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
        version: doc.version,
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

### Step 2: Build Your Document

Example from application code:

```typescript
import { storeYourData } from "@/lib/analytics/your_index";
import type { YourIndexData } from "@/types/your_feature/your_index";

async function processYourEntity(entity: YourEntity, workspace: Workspace) {
  // Build the document
  const document: YourIndexData = {
    workspace_id: workspace.sId,
    version: "1", // Document schema version
    your_entity_id: entity.sId,
    timestamp: new Date().toISOString(),
    status: entity.status,
    metadata: {
      field1: entity.field1,
      field2: entity.field2,
    },
    nested_data: entity.items.map((item) => ({
      item_id: item.id,
      value: item.value,
    })),
  };

  // Store to Elasticsearch
  const result = await storeYourData(document);

  if (result.isErr()) {
    // Handle error (log, retry, etc.)
    logger.error(
      {
        error: result.error,
        entityId: entity.sId,
      },
      "Failed to store analytics data"
    );
    return;
  }

  // Success
  logger.info({ entityId: entity.sId }, "Analytics data stored");
}
```

### Step 3: Integrate with Temporal (Optional but Recommended)

For asynchronous, reliable indexing, use Temporal workflows:

**Create activity file:** `temporal/your_feature_queue/activities.ts`

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
    version: "1",
    your_entity_id: entityId,
    timestamp: new Date().toISOString(),
    // ... build your document
  };

  // Store to Elasticsearch
  const result = await storeYourData(document);

  if (result.isErr()) {
    throw new Error(
      `Failed to store analytics: ${result.error.message}`
    );
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
import { searchAnalytics, YOUR_INDEX_ALIAS_NAME } from "@/lib/api/elasticsearch";
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
  const filters: any[] = [
    { term: { workspace_id: workspaceId } },
  ];

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
  const auth = await Authenticator.fromSuperUserSession(
    req,
    res
  );

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

---

## Best Practices

### 1. Workspace Isolation

**Always filter by workspace_id in all queries:**

```typescript
const filters = [
  { term: { workspace_id: workspaceId } }, // REQUIRED
  // ... other filters
];
```

This prevents cross-workspace data leakage.

### 2. Error Handling

**Use Result pattern, never throw:**

```typescript
const result = await storeYourData(document);

if (result.isErr()) {
  logger.error({ error: result.error }, "Failed to store data");
  // Handle gracefully - don't fail the main operation
  return;
}
```

From `lib/api/elasticsearch.ts:88-102`, all ES operations use `withEs()` wrapper that catches errors and returns `Result<T, ElasticsearchError>`.

### 3. Document Versioning

**Include version field in all documents:**

```typescript
const document: YourIndexData = {
  version: "1", // Schema version
  // ...
};
```

This allows you to:
- Migrate schemas over time
- Re-index documents with new schema versions
- Filter queries by version if needed

### 4. Bulk Operations

**For batch inserts/updates, always use bulk API:**

```typescript
// DON'T: Loop with individual index calls
for (const doc of documents) {
  await client.index({ index, id, body: doc }); // Slow!
}

// DO: Use bulk API
const body = documents.flatMap((doc) => [
  { index: { _index: index, _id: doc.id } },
  doc,
]);

await client.bulk({ body, refresh: false });
```

From `migrations/20251119_backfill_mcp_server_configuration_sid_analytics.ts:256-260`, bulk operations process 1000 documents at a time.

### 5. Refresh Interval

**Don't force refresh unless necessary:**

```typescript
// DON'T: Force refresh after every write
await client.index({ index, id, body, refresh: true }); // Expensive!

// DO: Let Elasticsearch refresh naturally
await client.index({ index, id, body }); // Uses refresh_interval setting
```

Production uses 30s refresh interval for performance.

### 6. Aggregation Size Limits

**Limit aggregation bucket counts:**

```typescript
const aggregations = {
  top_entities: {
    terms: {
      field: "your_entity_id",
      size: 50, // Limit to prevent huge responses
    },
  },
};
```

See `lib/api/elasticsearch.ts:148-197` for `ensureAtMostNGroups()` helper that limits and aggregates overflow into "Others".

### 7. Pagination

**Use from/size for paginated queries:**

```typescript
const result = await searchAnalytics(query, {
  size: 20,
  from: pageNumber * 20,
  sort: [{ timestamp: "desc" }],
});
```

### 8. Nested Query Performance

**Only use nested type when you need element relationships:**

Nested queries are more expensive. Use them only when you need to query within array elements:

```typescript
// Use nested when: "Find documents where the SAME tool had status=failed AND execution_time_ms > 1000"
const query = {
  nested: {
    path: "tools_used",
    query: {
      bool: {
        filter: [
          { term: { "tools_used.status": "failed" } },
          { range: { "tools_used.execution_time_ms": { gt: 1000 } } },
        ],
      },
    },
  },
};

// Don't use nested when: "Find documents that have ANY failed tool OR ANY slow tool"
// (Use regular filters instead)
```

---

## Common Patterns

### Pattern 1: Base Query Builder

Create reusable query builders (from `lib/api/assistant/observability/utils.ts:1-48`):

```typescript
export function buildYourBaseQuery({
  workspaceId,
  entityId,
  days,
  status,
}: {
  workspaceId: string;
  entityId?: string;
  days?: number;
  status?: string;
}) {
  const filters: any[] = [
    { term: { workspace_id: workspaceId } },
  ];

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

  if (status) {
    filters.push({ term: { status } });
  }

  return {
    bool: {
      filter: filters,
    },
  };
}
```

### Pattern 2: Multiple Metrics in Single Query

Combine multiple aggregations:

```typescript
const aggregations = {
  total: { value_count: { field: "your_entity_id" } },
  unique: { cardinality: { field: "your_entity_id" } },
  success_rate: {
    filters: {
      filters: {
        success: { term: { status: "success" } },
        failed: { term: { status: "failed" } },
      },
    },
  },
  avg_value: { avg: { field: "metadata.field2" } },
  percentiles: {
    percentiles: {
      field: "metadata.field2",
      percents: [50, 95, 99],
    },
  },
};
```

### Pattern 3: Time Series with Sub-aggregations

```typescript
const aggregations = {
  daily_stats: {
    date_histogram: {
      field: "timestamp",
      calendar_interval: "day",
      format: "yyyy-MM-dd",
    },
    aggs: {
      success_count: {
        filter: { term: { status: "success" } },
      },
      failed_count: {
        filter: { term: { status: "failed" } },
      },
      avg_value: {
        avg: { field: "metadata.field2" },
      },
    },
  },
};
```

### Pattern 4: Bucket Array Helper

Use helper to normalize bucket responses (from `lib/api/elasticsearch.ts:120-127`):

```typescript
import { bucketsToArray } from "@/lib/api/elasticsearch";

const result = await searchAnalytics(query, { aggregations });
const buckets = bucketsToArray(result.value.aggregations.your_agg.buckets);

// Works with both array and object bucket formats
buckets.forEach((bucket) => {
  console.log(bucket.key, bucket.doc_count);
});
```

---

## Troubleshooting

### Issue: Index creation fails

**Symptoms:** Script returns error "Index already exists"

**Solution:**
1. Check if index exists: `curl -u $USER:$PASS "$URL/front.your_index_name_1"`
2. Delete if needed: `curl -XDELETE -u $USER:$PASS "$URL/front.your_index_name_1"`
3. Run script again

### Issue: Data not appearing in queries

**Symptoms:** Query returns 0 results but data was indexed

**Possible Causes:**

1. **Refresh interval:** Wait 30s (production) or 1s (local) for data to become searchable
2. **Wrong index alias:** Verify using correct alias name
3. **Workspace filter:** Ensure workspace_id matches
4. **Date range:** Check timestamp format (must be ISO 8601)

**Debug:**
```typescript
// Check if document exists
const result = await client.get({
  index: YOUR_INDEX_ALIAS_NAME,
  id: documentId,
});

// Force refresh for testing
await client.indices.refresh({ index: YOUR_INDEX_ALIAS_NAME });
```

### Issue: Nested aggregation returns 0

**Symptoms:** Nested aggregation has no results

**Solution:**
```typescript
// Make sure nested path is correct
const aggregations = {
  nested_stats: {
    nested: {
      path: "nested_data", // Must match mapping exactly
    },
    aggs: {
      // Sub-aggregations must use full path
      items: {
        terms: {
          field: "nested_data.item_id", // Include nested path prefix
        },
      },
    },
  },
};
```

### Issue: Query performance is slow

**Symptoms:** Queries take > 1 second

**Solutions:**

1. **Add filters before aggregations:**
   ```typescript
   // Good: Filter first
   const query = {
     bool: {
       filter: [
         { term: { workspace_id } },
         { range: { timestamp: { gte: "now-7d" } } },
       ],
     },
   };
   ```

2. **Limit aggregation size:**
   ```typescript
   terms: {
     field: "your_field",
     size: 50, // Don't use 1000+
   }
   ```

3. **Use cardinality for counts:**
   ```typescript
   // Fast: Approximate count
   { cardinality: { field: "your_entity_id" } }

   // Slow: Exact count with large buckets
   { terms: { field: "your_entity_id", size: 10000 } }
   ```

4. **Increase refresh_interval in settings** (if freshness isn't critical)

### Issue: Mapping conflict error

**Symptoms:** "mapper_parsing_exception: failed to parse field"

**Solution:**

1. Field type mismatch - check your mapping matches data:
   ```typescript
   // If mapping says "integer" but you send "string"
   metadata: {
     field2: 123, // ✓ Correct
     field2: "123", // ✗ Wrong
   }
   ```

2. Can't change mapping of existing field - need new index version:
   - Create `your_index_name_2.mappings.json` with corrected mapping
   - Run creation script with `--index-version 2`
   - Migrate data from v1 to v2
   - Switch alias to v2

### Issue: Authentication error

**Symptoms:** "401 Unauthorized"

**Solution:**

1. Check environment variables are set:
   ```bash
   echo $ELASTICSEARCH_URL
   echo $ELASTICSEARCH_USERNAME
   echo $ELASTICSEARCH_PASSWORD
   ```

2. Verify credentials work:
   ```bash
   curl -u $ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD "$ELASTICSEARCH_URL/"
   ```

3. Check `lib/api/config.ts:316-326` is reading env vars correctly

---

## Index Migration (v1 → v2)

When you need to change the schema:

### Step 1: Create New Version

1. Create `your_index_name_2.mappings.json` with updated schema
2. Create `your_index_name_2.settings.*.json` files
3. Run creation script:
   ```bash
   tsx front/scripts/create_elasticsearch_index.ts \
     --index-name your_index_name \
     --index-version 2
   ```

### Step 2: Backfill Data

Create migration script (see examples in `migrations/` directory):

```typescript
// migrations/YYYYMMDD_backfill_your_index.ts
import { getClient } from "@/lib/api/elasticsearch";

async function main() {
  const client = await getClient();
  const batchSize = 1000;

  // Scroll through old index
  let response = await client.search({
    index: "front.your_index_name_1",
    scroll: "2m",
    size: batchSize,
  });

  while (response.hits.hits.length > 0) {
    const bulkOps = response.hits.hits.flatMap((hit) => {
      const oldDoc = hit._source;

      // Transform to new schema
      const newDoc = {
        ...oldDoc,
        new_field: "default_value", // Add new field
      };

      return [
        { index: { _index: "front.your_index_name_2", _id: hit._id } },
        newDoc,
      ];
    });

    await client.bulk({ body: bulkOps, refresh: false });

    // Continue scrolling
    response = await client.scroll({
      scroll_id: response._scroll_id,
      scroll: "2m",
    });
  }
}
```

### Step 3: Switch Alias

```bash
tsx front/scripts/create_elasticsearch_index.ts \
  --index-name your_index_name \
  --index-version 2 \
  --remove-previous-alias
```

This removes write alias from v1 and adds it to v2.

### Step 4: Update Code

Update constant in code:
```typescript
export const YOUR_INDEX_VERSION = "2";
```

Update TypeScript types if schema changed.

---

## Quick Reference

### Common CLI Commands

```bash
# List indices
curl -u $USER:$PASS "$URL/_cat/indices?v"

# Get index details
curl -u $USER:$PASS "$URL/front.your_index_name"

# Check alias
curl -u $USER:$PASS "$URL/_alias/front.your_index_name"

# Get mapping
curl -u $USER:$PASS "$URL/front.your_index_name/_mapping"

# Get settings
curl -u $USER:$PASS "$URL/front.your_index_name/_settings"

# Document count
curl -u $USER:$PASS "$URL/front.your_index_name/_count"

# Get document by ID
curl -u $USER:$PASS "$URL/front.your_index_name/_doc/YOUR_DOC_ID"

# Delete document
curl -XDELETE -u $USER:$PASS "$URL/front.your_index_name/_doc/YOUR_DOC_ID"

# Refresh index (make documents searchable now)
curl -XPOST -u $USER:$PASS "$URL/front.your_index_name/_refresh"

# Delete index (careful!)
curl -XDELETE -u $USER:$PASS "$URL/front.your_index_name_1"
```

### File Checklist

When creating a new index, create these files:

- [ ] `types/your_feature/your_index.ts` - TypeScript interface
- [ ] `lib/analytics/indices/your_index_name_1.mappings.json` - Field mappings
- [ ] `lib/analytics/indices/your_index_name_1.settings.local.json` - Local settings
- [ ] `lib/analytics/indices/your_index_name_1.settings.us-central1.json` - US settings
- [ ] `lib/analytics/indices/your_index_name_1.settings.europe-west1.json` - EU settings
- [ ] `lib/analytics/your_index.ts` - Indexing functions
- [ ] `lib/api/your_feature/queries/your_query.ts` - Query functions
- [ ] `pages/api/w/[wId]/your_feature/stats.ts` - API endpoint
- [ ] Update `lib/api/elasticsearch.ts` - Add index alias constant

### Key Constants

```typescript
// In lib/api/elasticsearch.ts
export const ANALYTICS_ALIAS_NAME = "front.agent_message_analytics";
export const YOUR_INDEX_ALIAS_NAME = "front.your_index_name";
```

---

## Additional Resources

- Elasticsearch 8.x Documentation: https://www.elastic.co/guide/en/elasticsearch/reference/8.15/index.html
- Elasticsearch Query DSL: https://www.elastic.co/guide/en/elasticsearch/reference/8.15/query-dsl.html
- Aggregations Reference: https://www.elastic.co/guide/en/elasticsearch/reference/8.15/search-aggregations.html
- Official Client Docs: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html

## Support

For questions or issues:
1. Check existing indices in `lib/analytics/indices/` for examples
2. Review query patterns in `lib/api/assistant/observability/`
3. Look at agent message analytics implementation as reference
4. Check migration scripts in `migrations/` for backfill patterns
