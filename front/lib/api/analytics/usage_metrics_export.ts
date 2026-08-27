import {
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONVERSATION_ID_FIELD,
  uniqueMessagesCardinalityAgg,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type UsageMetricsExportBucket = {
  key: number;
  unique_messages?: estypes.AggregationsCardinalityAggregate;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type UsageMetricsExportAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<UsageMetricsExportBucket>;
};

export interface UsageMetricsExportRow {
  date: string;
  messages: number;
  conversations: number;
  activeUsers: number;
}

export async function fetchUsageMetricsExportRows(
  baseQuery: estypes.QueryDslQueryContainer,
  timezone: string
): Promise<Result<UsageMetricsExportRow[], Error>> {
  const result = await searchConsumptionAnalytics<
    never,
    UsageMetricsExportAggs
  >(baseQuery, {
    aggregations: {
      by_date: {
        date_histogram: {
          field: COMPLETED_AT_FIELD,
          calendar_interval: "day",
          time_zone: timezone,
        },
        aggs: {
          // Consumption documents are split per LLM step and per tool call, so
          // a message contributes several documents to the same date bucket:
          // dedupe by agent_message_id to count distinct messages.
          unique_messages: uniqueMessagesCardinalityAgg(),
          unique_conversations: {
            cardinality: {
              field: CONVERSATION_ID_FIELD,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
            },
          },
          unique_users: {
            cardinality: {
              field: CONSUMPTION_DIMENSION_FIELDS.user,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
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

  const buckets = bucketsToArray<UsageMetricsExportBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(
    buckets.map((bucket) => ({
      date: formatDateFromMillis(bucket.key, timezone),
      messages: Math.round(bucket.unique_messages?.value ?? 0),
      conversations: Math.round(bucket.unique_conversations?.value ?? 0),
      activeUsers: Math.round(bucket.unique_users?.value ?? 0),
    }))
  );
}
