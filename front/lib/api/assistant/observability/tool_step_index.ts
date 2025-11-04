import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { asDisplayToolName } from "@app/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type ToolStepIndexByStep = {
  step: number;
  tools: {
    [toolName: string]: {
      count: number;
    };
  };
  total: number;
};

type TermBucket<T = string | number> = {
  key: T;
  doc_count: number;
};

type ToolBucket = TermBucket<string>;

type StepBucket = TermBucket<number> & {
  tool_names?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
};

type ToolStepIndexAggs = {
  steps?: {
    by_step?: estypes.AggregationsMultiBucketAggregateBase<StepBucket>;
    top_tools?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
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
            field: "tools_used.tool_name",
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
            tool_names: {
              terms: {
                field: "tools_used.tool_name",
                size: 50,
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
    const toolBuckets = bucketsToArray<ToolBucket>(sb.tool_names?.buckets);

    const tools: ToolStepIndexByStep["tools"] = {};
    toolBuckets.forEach((tb) => {
      tools[asDisplayToolName(tb.key)] = {
        count: tb.doc_count ?? DEFAULT_METRIC_VALUE,
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
