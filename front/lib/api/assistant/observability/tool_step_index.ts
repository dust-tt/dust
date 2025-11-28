import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { asDisplayToolName } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import { buildConfigBreakdown, MISSING_CONFIG_NAME } from "./tool_breakdown";

const DEFAULT_METRIC_VALUE = 0;

export type ToolStepIndexByStep = {
  step: number;
  tools: {
    [toolName: string]: {
      count: number;
      breakdown?: Record<string, number>;
    };
  };
  total: number;
};

type TermBucket<T = string | number> = {
  key: T;
  doc_count: number;
};

type ConfigBucket = TermBucket<string>;

type ServerBucket = TermBucket<string> & {
  configs?: estypes.AggregationsMultiBucketAggregateBase<ConfigBucket>;
};

type StepBucket = TermBucket<number> & {
  servers?: estypes.AggregationsMultiBucketAggregateBase<ServerBucket>;
};

type ToolStepIndexAggs = {
  steps?: {
    by_step?: estypes.AggregationsMultiBucketAggregateBase<StepBucket>;
    top_tools?: estypes.AggregationsMultiBucketAggregateBase<ServerBucket>;
  };
};

export async function fetchToolStepIndexDistribution(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ToolStepIndexByStep[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    steps: {
      nested: { path: "tools_used" },
      aggs: {
        // Global top tools across all steps (not strictly required client-side but useful if needed)
        top_tools: {
          terms: {
            field: "tools_used.server_name",
            size: 50,
            order: { _count: "desc" },
          },
        },
        by_step: {
          terms: {
            field: "tools_used.step_index",
            size: 50,
            order: { _key: "asc" },
          },
          aggs: {
            servers: {
              terms: {
                field: "tools_used.server_name",
                size: 50,
              },
              aggs: {
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

  const result = await searchAnalytics<never, ToolStepIndexAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const stepBuckets = bucketsToArray<StepBucket>(
    result.value.aggregations?.steps?.by_step?.buckets
  );

  const byStep: ToolStepIndexByStep[] = stepBuckets.map((sb) => {
    const serverBuckets = bucketsToArray<ServerBucket>(sb.servers?.buckets);

    const tools: ToolStepIndexByStep["tools"] = {};
    serverBuckets.forEach((serverBucket) => {
      const breakdown = buildConfigBreakdown(serverBucket.configs);

      tools[asDisplayToolName(serverBucket.key)] = {
        count: serverBucket.doc_count ?? DEFAULT_METRIC_VALUE,
        breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
      };
    });

    return {
      step: typeof sb.key === "number" ? sb.key : parseInt(String(sb.key), 10),
      tools,
      total: sb.doc_count ?? DEFAULT_METRIC_VALUE,
    };
  });

  return new Ok(byStep);
}
