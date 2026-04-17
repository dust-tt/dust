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
