import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type ToolExecutionByVersion = {
  version: string;
  tools: {
    [toolName: string]: {
      count: number;
      successRate: number;
    };
  };
};

type TermBucket = {
  key: string;
  doc_count: number;
};

type ToolBucket = TermBucket & {
  statuses?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
};

type VersionBucket = TermBucket & {
  tools?: {
    tool_names?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
  };
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
        order: { _key: "desc" },
      },
      aggs: {
        tools: {
          nested: { path: "tools_used" },
          aggs: {
            tool_names: {
              terms: {
                field: "tools_used.tool_name",
                size: 50,
              },
              aggs: {
                statuses: {
                  terms: { field: "tools_used.status" },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<unknown, ToolExecutionAggs>(baseQuery, {
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
    const toolBuckets = bucketsToArray<ToolBucket>(
      vb.tools?.tool_names?.buckets
    );

    const tools: ToolExecutionByVersion["tools"] = {};

    toolBuckets.forEach((tb) => {
      const total = tb.doc_count || DEFAULT_METRIC_VALUE;
      const statuses = bucketsToArray<TermBucket>(tb.statuses?.buckets);
      const succeeded =
        statuses.find((s) => s.key === "succeeded")?.doc_count ??
        DEFAULT_METRIC_VALUE;

      const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;

      tools[tb.key] = {
        count: total,
        successRate,
      };
    });

    return {
      version: vb.key,
      tools,
    };
  });

  return new Ok(byVersion);
}
