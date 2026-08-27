import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONVERSATION_ID_FIELD,
  uniqueMessagesCardinalityAgg,
} from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionGranularity,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/timeseries";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Activity over time, counted rather than summed: how many messages, how many
 * people, how many tool calls.
 *
 * A message spans several consumption documents — one per LLM step, one per tool
 * call — so a bucket's doc count is not a message count and every message metric
 * dedupes by `agent_message_id`.
 */

export const CONSUMPTION_ACTIVITY_METRICS = [
  "messages",
  "tools",
  "skills",
] as const;

export type ConsumptionActivityMetric =
  (typeof CONSUMPTION_ACTIVITY_METRICS)[number];

export type ConsumptionActivityTimeseries = {
  period: ConsumptionPeriod;
  granularity: ConsumptionGranularity;
  metric: ConsumptionActivityMetric;
  series: { key: string; name: string }[];
  points: ConsumptionTimeseriesPoint[];
};

const TOOL_DOCUMENTS: estypes.QueryDslQueryContainer = {
  term: { consumption_type: "tool" },
};

const SERIES_BY_METRIC: Record<
  ConsumptionActivityMetric,
  { key: string; name: string }[]
> = {
  messages: [
    { key: "messages", name: "Messages" },
    { key: "conversations", name: "Conversations" },
    { key: "activeUsers", name: "Active users" },
  ],
  tools: [
    { key: "executions", name: "Tool calls" },
    { key: "activeUsers", name: "Active users" },
  ],
  skills: [
    { key: "executions", name: "Skill executions" },
    { key: "activeUsers", name: "Active users" },
  ],
};

function cardinality(field: string): estypes.AggregationsAggregationContainer {
  return {
    cardinality: {
      field,
      precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
    },
  };
}

// Tool and skill executions only exist on tool documents, so they hang off a
// filter sub-aggregation rather than the date bucket itself.
function metricSubAggs(
  metric: ConsumptionActivityMetric
): Record<string, estypes.AggregationsAggregationContainer> {
  switch (metric) {
    case "messages":
      return {
        messages: uniqueMessagesCardinalityAgg(),
        conversations: cardinality(CONVERSATION_ID_FIELD),
        activeUsers: cardinality(CONSUMPTION_DIMENSION_FIELDS.user),
      };
    case "tools":
      return {
        executions: {
          filter: TOOL_DOCUMENTS,
          aggs: { activeUsers: cardinality(CONSUMPTION_DIMENSION_FIELDS.user) },
        },
      };
    case "skills":
      return {
        executions: {
          filter: {
            bool: {
              filter: [
                TOOL_DOCUMENTS,
                { exists: { field: CONSUMPTION_DIMENSION_FIELDS.skill } },
              ],
            },
          },
          aggs: { activeUsers: cardinality(CONSUMPTION_DIMENSION_FIELDS.user) },
        },
      };
    default:
      return assertNever(metric);
  }
}

type ActivityBucket = {
  key: number;
  messages?: estypes.AggregationsCardinalityAggregate;
  conversations?: estypes.AggregationsCardinalityAggregate;
  activeUsers?: estypes.AggregationsCardinalityAggregate;
  executions?: estypes.AggregationsSingleBucketAggregateBase & {
    activeUsers?: estypes.AggregationsCardinalityAggregate;
  };
};

type ActivityAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<ActivityBucket>;
};

function valuesFromBucket(
  metric: ConsumptionActivityMetric,
  bucket: ActivityBucket
): Record<string, number> {
  switch (metric) {
    case "messages":
      return {
        messages: Math.round(bucket.messages?.value ?? 0),
        conversations: Math.round(bucket.conversations?.value ?? 0),
        activeUsers: Math.round(bucket.activeUsers?.value ?? 0),
      };
    case "tools":
    case "skills":
      return {
        executions: bucket.executions?.doc_count ?? 0,
        activeUsers: Math.round(bucket.executions?.activeUsers?.value ?? 0),
      };
    default:
      return assertNever(metric);
  }
}

export async function fetchConsumptionActivityTimeseries(
  auth: Authenticator,
  {
    period,
    granularity,
    metric,
    filter,
    timezone = "UTC",
  }: {
    period: ConsumptionPeriod;
    granularity: ConsumptionGranularity;
    metric: ConsumptionActivityMetric;
    filter?: ConsumptionScopeFilter;
    timezone?: string;
  }
): Promise<Result<ConsumptionActivityTimeseries, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const result = await searchConsumptionAnalytics<never, ActivityAggs>(query, {
    aggregations: {
      by_date: {
        date_histogram: {
          field: COMPLETED_AT_FIELD,
          calendar_interval: granularity,
          time_zone: timezone,
          min_doc_count: 0,
          extended_bounds: {
            min: new Date(period.startDate).getTime(),
            max: new Date(period.endDate).getTime() - 1,
          },
        },
        aggs: metricSubAggs(metric),
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok({
    period,
    granularity,
    metric,
    series: SERIES_BY_METRIC[metric],
    points: bucketsToArray<ActivityBucket>(
      result.value.aggregations?.by_date?.buckets
    ).map((bucket) => ({
      timestamp: bucket.key,
      values: valuesFromBucket(metric, bucket),
    })),
  });
}
