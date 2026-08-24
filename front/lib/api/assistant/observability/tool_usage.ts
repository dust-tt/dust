import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
import type { estypes } from "@elastic/elasticsearch";

export type ToolUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

export type AvailableTool = {
  serverName: string;
  displayName: string;
  totalExecutions: number;
};

export type GetWorkspaceToolsResponse = {
  tools: AvailableTool[];
};

export type GetWorkspaceToolUsageResponse = {
  points: ToolUsagePoint[];
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

function bucketToPoint(bucket: DateBucket, timezone: string): ToolUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatDateFromMillis(bucket.key, timezone),
    uniqueUsers: bucket.tools_nested?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.tools_nested?.doc_count ?? 0,
  };
}

function filteredBucketToPoint(
  bucket: FilteredDateBucket,
  timezone: string
): ToolUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatDateFromMillis(bucket.key, timezone),
    uniqueUsers:
      bucket.tools_nested?.filtered?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.tools_nested?.filtered?.doc_count ?? 0,
  };
}

export async function fetchToolUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  serverName: string | null,
  timezone: string = "UTC"
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
        time_zone: timezone,
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

    return new Ok(
      dateBuckets.map((bucket) => filteredBucketToPoint(bucket, timezone))
    );
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

  return new Ok(dateBuckets.map((bucket) => bucketToPoint(bucket, timezone)));
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
    displayName: bucket.key,
    totalExecutions: bucket.doc_count,
  }));

  return new Ok(tools);
}

export type ToolUsageExportRow = {
  date: string;
  toolName: string;
  executions: number;
  uniqueUsers: number;
};

type ConsumptionToolUsageServerBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type ConsumptionToolUsageDateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  by_server: estypes.AggregationsMultiBucketAggregateBase<ConsumptionToolUsageServerBucket>;
};

type ConsumptionToolUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<ConsumptionToolUsageDateBucket>;
};

// Consumption-index counterpart of the old `fetchAvailableTools` +
// `fetchToolUsageMetrics` fan-out, scoped to the `tool_usage` export table.
// The index already carries one flat document per tool invocation, so a
// single query discovers both which tools ran and their daily metrics —
// unlike the old per-server nested-agg fan-out, `doc_count` is already a
// correct invocation count here and does not need to become a cardinality.
export async function fetchConsumptionToolUsageExport(
  auth: Authenticator,
  startDate: string,
  endDate: string,
  timezone: string = "UTC"
): Promise<Result<ToolUsageExportRow[], Error>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate,
    endDate,
    extraFilters: [{ term: { consumption_type: "tool" } }],
  });

  const result = await searchConsumptionAnalytics<
    never,
    ConsumptionToolUsageAggs
  >(query, {
    aggregations: {
      by_date: {
        date_histogram: {
          field: "completed_at",
          calendar_interval: "day",
          time_zone: timezone,
        },
        aggs: {
          by_server: {
            terms: { field: "tool.server_name", size: 100 },
            aggs: {
              unique_users: {
                cardinality: {
                  field: "user.id",
                  precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
                },
              },
            },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dateBuckets = bucketsToArray<ConsumptionToolUsageDateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  const rows: ToolUsageExportRow[] = [];
  for (const dateBucket of dateBuckets) {
    const date = formatDateFromMillis(dateBucket.key, timezone);
    const serverBuckets = bucketsToArray<ConsumptionToolUsageServerBucket>(
      dateBucket.by_server?.buckets
    );
    for (const serverBucket of serverBuckets) {
      rows.push({
        date,
        toolName: String(serverBucket.key),
        executions: serverBucket.doc_count ?? 0,
        uniqueUsers: Math.round(serverBucket.unique_users?.value ?? 0),
      });
    }
  }

  return new Ok(rows);
}

export async function resolveServerDisplayNames(
  auth: Authenticator,
  serverNames: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(serverNames)];
  const remoteServerIds = unique.filter((id) =>
    isResourceSId("remote_mcp_server", id)
  );
  const remoteServers = await RemoteMCPServerResource.fetchByIds(
    auth,
    remoteServerIds
  );
  const remoteServerMap = new Map(
    remoteServers.map((server) => [server.sId, server])
  );

  const displayMap = new Map<string, string>();
  for (const name of unique) {
    displayMap.set(
      name,
      remoteServerMap.get(name)?.cachedName ?? asDisplayToolName(name)
    );
  }
  return displayMap;
}

export async function resolveToolDisplayNames(
  auth: Authenticator,
  tools: AvailableTool[]
): Promise<AvailableTool[]> {
  const displayMap = await resolveServerDisplayNames(
    auth,
    tools.map((t) => t.serverName)
  );

  return tools.map((tool) => ({
    ...tool,
    displayName: displayMap.get(tool.serverName) ?? tool.serverName,
  }));
}
