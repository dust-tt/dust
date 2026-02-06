import type { estypes } from "@elastic/elasticsearch";

import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ToolUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

export type AvailableTool = {
  serverName: string;
  totalExecutions: number;
};

type DateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  tools_nested: {
    doc_count: number;
    unique_users: {
      doc_count: number;
      cardinality: estypes.AggregationsCardinalityAggregate;
    };
  };
};

type ToolUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type FilteredDateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  tools_nested: {
    filtered: {
      doc_count: number;
      unique_users: {
        doc_count: number;
        cardinality: estypes.AggregationsCardinalityAggregate;
      };
    };
  };
};

type FilteredToolUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<FilteredDateBucket>;
};

type ToolBucket = {
  key: string;
  doc_count: number;
};

type ToolListAggs = {
  tools_nested: {
    by_server: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
  };
};

function bucketToPoint(bucket: DateBucket): ToolUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatUTCDateFromMillis(bucket.key),
    uniqueUsers: bucket.tools_nested?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.tools_nested?.doc_count ?? 0,
  };
}

function filteredBucketToPoint(bucket: FilteredDateBucket): ToolUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatUTCDateFromMillis(bucket.key),
    uniqueUsers:
      bucket.tools_nested?.filtered?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.tools_nested?.filtered?.doc_count ?? 0,
  };
}

export async function fetchToolUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  serverName: string | null
): Promise<Result<ToolUsagePoint[], Error>> {
  // When serverName is provided, filter the nested tools_used aggregation
  // When null, aggregate across all tools

  const nestedAggs: Record<string, estypes.AggregationsAggregationContainer> =
    serverName
      ? {
          filtered: {
            filter: { term: { "tools_used.server_name": serverName } },
            aggs: {
              unique_users: {
                reverse_nested: {},
                aggs: {
                  cardinality: {
                    cardinality: { field: "user_id" },
                  },
                },
              },
            },
          },
        }
      : {
          unique_users: {
            reverse_nested: {},
            aggs: {
              cardinality: {
                cardinality: { field: "user_id" },
              },
            },
          },
        };

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_date: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: "day",
        time_zone: "UTC",
      },
      aggs: {
        tools_nested: {
          nested: { path: "tools_used" },
          aggs: nestedAggs,
        },
      },
    },
  };

  if (serverName) {
    const result = await searchAnalytics<never, FilteredToolUsageAggs>(
      baseQuery,
      { aggregations: aggs, size: 0 }
    );

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const dateBuckets = bucketsToArray<FilteredDateBucket>(
      result.value.aggregations?.by_date?.buckets
    );

    return new Ok(dateBuckets.map(filteredBucketToPoint));
  }

  const result = await searchAnalytics<never, ToolUsageAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dateBuckets = bucketsToArray<DateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(dateBuckets.map(bucketToPoint));
}

export async function fetchAvailableTools(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AvailableTool[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    tools_nested: {
      nested: { path: "tools_used" },
      aggs: {
        by_server: {
          terms: {
            field: "tools_used.server_name",
            size: 100,
            order: { _count: "desc" },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, ToolListAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const toolBuckets = bucketsToArray<ToolBucket>(
    result.value.aggregations?.tools_nested?.by_server?.buckets
  );

  const tools: AvailableTool[] = toolBuckets.map((bucket) => ({
    serverName: bucket.key,
    totalExecutions: bucket.doc_count,
  }));

  return new Ok(tools);
}
