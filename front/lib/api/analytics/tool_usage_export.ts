import {
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  MAX_EXPORT_TERMS_SIZE,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type ToolDateBucket = {
  key: number;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type ToolBucket = {
  key: string;
  doc_count: number;
  by_date?: estypes.AggregationsMultiBucketAggregateBase<ToolDateBucket>;
};

type ToolUsageExportAggs = {
  by_tool?: estypes.AggregationsMultiBucketAggregateBase<ToolBucket>;
};

export interface ToolUsageExportRow {
  date: string;
  // Raw MCP server name; callers that want a display name resolve it
  // themselves (e.g. via resolveServerDisplayNames).
  toolName: string;
  executions: number;
  uniqueUsers: number;
}

/**
 * Tool attribution is a flat field on the consumption index, and each
 * document is already a single tool call invocation (unlike the old index's
 * nested `tools_used` array), so a plain terms+date_histogram aggregation is
 * enough: doc_count within a (tool, date) bucket is the execution count
 * directly, no unwrap needed.
 */
export async function fetchToolUsageExportRows(
  baseQuery: estypes.QueryDslQueryContainer,
  timezone: string
): Promise<Result<ToolUsageExportRow[], Error>> {
  const result = await searchConsumptionAnalytics<never, ToolUsageExportAggs>(
    baseQuery,
    {
      aggregations: {
        by_tool: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS.tool,
            size: MAX_EXPORT_TERMS_SIZE,
          },
          aggs: {
            by_date: {
              date_histogram: {
                field: COMPLETED_AT_FIELD,
                calendar_interval: "day",
                time_zone: timezone,
              },
              aggs: {
                unique_users: {
                  cardinality: {
                    field: CONSUMPTION_DIMENSION_FIELDS.user,
                    precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
                  },
                },
              },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const toolBuckets = bucketsToArray<ToolBucket>(
    result.value.aggregations?.by_tool?.buckets
  );

  const rows: ToolUsageExportRow[] = toolBuckets.flatMap((toolBucket) => {
    const toolName = String(toolBucket.key);
    const dateBuckets = bucketsToArray<ToolDateBucket>(
      toolBucket.by_date?.buckets
    );
    return dateBuckets.map((dateBucket) => ({
      date: formatDateFromMillis(dateBucket.key, timezone),
      toolName,
      executions: dateBucket.doc_count,
      uniqueUsers: Math.round(dateBucket.unique_users?.value ?? 0),
    }));
  });

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.toolName.localeCompare(b.toolName);
  });

  return new Ok(rows);
}
