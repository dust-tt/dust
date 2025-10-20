import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type ToolLatencyByVersion = {
  version: string;
  tools: {
    [toolName: string]: {
      count: number;
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
    };
  };
};

type TermBucket = {
  key: string;
  doc_count: number;
};

type ToolBucket = TermBucket & {
  avg_latency?: estypes.AggregationsAvgAggregate;
  percentiles?: estypes.AggregationsTDigestPercentilesAggregate;
};

type VersionBucket = TermBucket & {
  tools?: {
    tool_names?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
  };
  first_seen?: estypes.AggregationsMinAggregate;
};

type ToolLatencyAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
};

export async function fetchToolLatencyMetrics(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ToolLatencyByVersion[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent_version",
        size: 100,
        order: { first_seen: "asc" },
      },
      aggs: {
        first_seen: {
          min: { field: "timestamp" },
        },
        tools: {
          nested: { path: "tools_used" },
          aggs: {
            tool_names: {
              terms: {
                field: "tools_used.tool_name",
                size: 50,
              },
              aggs: {
                avg_latency: {
                  avg: { field: "tools_used.execution_time_ms" },
                },
                percentiles: {
                  percentiles: {
                    field: "tools_used.execution_time_ms",
                    percents: [50, 95],
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<unknown, ToolLatencyAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const versionBuckets = bucketsToArray<VersionBucket>(
    result.value.aggregations?.by_version?.buckets
  );

  const byVersion: ToolLatencyByVersion[] = versionBuckets.map((vb) => {
    const toolBuckets = bucketsToArray<ToolBucket>(
      vb.tools?.tool_names?.buckets
    );

    const tools: ToolLatencyByVersion["tools"] = {};

    toolBuckets.forEach((tb) => {
      const count = tb.doc_count || DEFAULT_METRIC_VALUE;
      const avgLatencyMs = Math.round(
        tb.avg_latency?.value ?? DEFAULT_METRIC_VALUE
      );
      const p50LatencyMs = Math.round(
        tb.percentiles?.values?.["50.0"] ?? DEFAULT_METRIC_VALUE
      );
      const p95LatencyMs = Math.round(
        tb.percentiles?.values?.["95.0"] ?? DEFAULT_METRIC_VALUE
      );

      tools[tb.key] = {
        count,
        avgLatencyMs,
        p50LatencyMs,
        p95LatencyMs,
      };
    });

    return {
      version: vb.key,
      tools,
    };
  });

  return new Ok(byVersion);
}
