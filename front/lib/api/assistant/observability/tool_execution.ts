import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { asDisplayToolName } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import { buildConfigBreakdown, MISSING_CONFIG_NAME } from "./tool_breakdown";

const DEFAULT_METRIC_VALUE = 0;

type ToolExecutionToolMetrics = {
  count: number;
  successRate: number;
  mcpViewBreakdown?: Record<string, number>;
};

export type ToolExecutionByVersion = {
  version: string;
  tools: {
    [toolName: string]: ToolExecutionToolMetrics;
  };
};

type TermBucket = {
  key: string;
  doc_count: number;
};

type ConfigBucket = TermBucket;

type ServerBucket = TermBucket & {
  statuses?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
  configs?: estypes.AggregationsMultiBucketAggregateBase<ConfigBucket>;
};

type VersionBucket = TermBucket & {
  tools?: {
    servers?: estypes.AggregationsMultiBucketAggregateBase<ServerBucket>;
  };
  first_seen?: estypes.AggregationsMinAggregate;
};

type ToolExecutionAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

export async function fetchToolExecutionMetrics(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ToolExecutionByVersion[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent_version",
        size: 100,
        // Order versions chronologically by their first observed timestamp
        order: { first_seen: "asc" },
      },
      aggs: {
        first_seen: {
          min: { field: "timestamp" },
        },
        tools: {
          nested: { path: "tools_used" },
          aggs: {
            servers: {
              terms: {
                field: "tools_used.server_name",
                size: 50,
              },
              aggs: {
                statuses: {
                  terms: { field: "tools_used.status" },
                },
                configs: {
                  terms: {
                    field: "tools_used.mcp_server_configuration_sid",
                    size: 50,
                    missing: MISSING_CONFIG_NAME,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, ToolExecutionAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const versionBuckets = bucketsToArray<VersionBucket>(
    result.value.aggregations?.by_version?.buckets
  );

  const byVersion: ToolExecutionByVersion[] = versionBuckets.map((vb) => {
    const serverBuckets = bucketsToArray<ServerBucket>(
      vb.tools?.servers?.buckets
    );

    const tools: ToolExecutionByVersion["tools"] = {};

    serverBuckets.forEach((sb) => {
      const total = sb.doc_count || DEFAULT_METRIC_VALUE;
      const statuses = bucketsToArray<TermBucket>(sb.statuses?.buckets);
      const succeeded =
        statuses.find((s) => s.key === "succeeded")?.doc_count ??
        DEFAULT_METRIC_VALUE;

      const successRate =
        total > 0
          ? Math.round((succeeded / total) * 100)
          : DEFAULT_METRIC_VALUE;

      const serverDisplayName = asDisplayToolName(sb.key);
      const breakdown = buildConfigBreakdown(sb.configs);

      tools[serverDisplayName] = {
        count: total,
        successRate,
        mcpViewBreakdown:
          Object.keys(breakdown).length > 0 ? breakdown : undefined,
      };
    });

    return {
      version: vb.key,
      tools,
    };
  });

  return new Ok(byVersion);
}
