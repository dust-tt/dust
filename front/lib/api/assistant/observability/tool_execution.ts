import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { asDisplayToolName } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

type ToolExecutionToolMetrics = {
  count: number;
  successRate: number;
  /**
   * Optional breakdown of this tool/server by underlying MCP view tools.
   */
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
                    // Use the keyword variant to avoid fielddata issues on text fields.
                    field: "tools_used.mcp_server_configuration_sid.keyword",
                    size: 50,
                    missing: "__no_config__",
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

      const configBuckets = bucketsToArray<ConfigBucket>(sb.configs?.buckets);
      const breakdown: Record<string, number> = {};

      configBuckets.forEach((cb) => {
        const sid = cb.key;
        if (!sid || sid === "__no_config__") {
          return;
        }

        breakdown[sid] =
          (breakdown[sid] ?? 0) + (cb.doc_count ?? DEFAULT_METRIC_VALUE);
      });

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
