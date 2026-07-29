# Querying Data

This reference covers query helper structure, common Elasticsearch aggregation patterns, and an
example API route wiring the query layer into `front`.

## Step 1: Create Query Utility Module

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

## Step 2: Common Query Patterns

### Pattern 1: Simple Aggregation

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

### Pattern 2: Date Histogram (Time Series)

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

### Pattern 3: Nested Aggregation

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

### Pattern 4: Percentile Metrics

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

### Pattern 5: Nested Filter with Parent Result

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

## Step 3: Create API Endpoint

Create `front-api/routes/w/[wId]/your_feature/stats.ts`, then mount it from
`front-api/routes/w/[wId]/your_feature/index.ts`. Endpoint rules (one file per URL, mounting,
validation, errors) are in `front-api/CODING_RULES.md`:

```typescript
import { queryYourData } from "@app/lib/api/your_feature/queries/your_query";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DEFAULT_WINDOW_DAYS = 7;

const GetStatsQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(DEFAULT_WINDOW_DAYS),
  entityId: z.string().optional(),
});

// Mounted at /api/w/:wId/your_feature/stats.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetStatsQuerySchema),
  async (ctx): HandlerResult<YourQueryResult> => {
    const auth = ctx.get("auth");
    const { days, entityId } = ctx.req.valid("query");

    const result = await queryYourData({
      workspaceId: auth.getNonNullableWorkspace().sId,
      days,
      entityId,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;
```

`workspaceApp()` is the typed Hono factory for routes under `/w/:wId`. `workspaceAuth` is applied
once at `front-api/routes/w/[wId]/index.ts`, so `ctx.get("auth")` is already a resolved
`Authenticator` — no manual workspace check in the handler. Hono handles method dispatch, so there
is no 405 branch to write.
