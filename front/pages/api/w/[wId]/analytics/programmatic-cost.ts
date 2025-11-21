import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import type { MetricsBucket } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  buildMetricAggregates,
  fetchMessageMetrics,
  parseMetricsFromBucket,
} from "@app/lib/api/assistant/observability/messages_metrics";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  bucketsToArray,
  groupTopNAndAggregateOthers,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { getShouldTrackTokenUsageCostsESFilter } from "@app/lib/api/programmatic_usage_tracking";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";

const GROUP_BY_KEYS = ["agent", "origin", "apiKey"] as const;

export type GroupByType = (typeof GROUP_BY_KEYS)[number];

const GROUP_BY_KEY_TO_ES_FIELD: Record<GroupByType, string> = {
  agent: "agent_id",
  origin: "context_origin",
  apiKey: "api_key_name",
};

const FilterSchema = z.record(z.enum(GROUP_BY_KEYS), z.string().array());

const QuerySchema = z.object({
  groupBy: z.enum(GROUP_BY_KEYS).optional(),
  filter: z.string().optional(),
  selectedMonth: z.string().optional(),
});

export type WorkspaceProgrammaticCostPoint = {
  timestamp: number;
  groups: {
    groupKey: string;
    costCents: number;
    programmaticCostCents?: number;
  }[];
  totalInitialCreditsCents: number;
  totalConsumedCreditsCents: number;
  totalRemainingCreditsCents: number;
};

export type AvailableGroup = {
  groupKey: string;
  groupLabel: string;
};

export type GetWorkspaceProgrammaticCostResponse = {
  points: WorkspaceProgrammaticCostPoint[];
  availableGroups: AvailableGroup[]; // All available groups (without filters applied)
};

// Reuse the MetricsBucket type from messages_metrics to ensure compatibility
type DailyBucket = MetricsBucket;

type GroupBucket = {
  key: string;
  doc_count: number;
  total_cost?: estypes.AggregationsSumAggregate;
  by_day?: estypes.AggregationsMultiBucketAggregateBase<DailyBucket>;
};

type GroupedAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

/**
 * Calculates credit totals for each timestamp.
 * A credit is considered "active" on a day if:
 * - It was created before or on that day
 * - It hasn't expired yet on that day (expirationDate is null or > day start)
 */
function calculateCreditTotalsPerTimestamp(
  credits: CreditResource[],
  timestamps: number[]
): Map<
  number,
  {
    totalInitialCreditsCents: number;
    totalConsumedCreditsCents: number;
    totalRemainingCreditsCents: number;
  }
> {
  const creditTotalsMap = new Map<
    number,
    {
      totalInitialCreditsCents: number;
      totalConsumedCreditsCents: number;
      totalRemainingCreditsCents: number;
    }
  >();

  const totalInitialCreditsCents = credits.reduce(
    (sum, credit) => sum + credit.initialAmountCents,
    0
  );
  const totalConsumedCreditsCents = credits.reduce(
    (sum, credit) => sum + credit.consumedAmountCents,
    0
  );
  const totalRemainingCreditsCents = credits.reduce(
    (sum, credit) =>
      sum + (credit.initialAmountCents - credit.consumedAmountCents),
    0
  );

  for (const timestamp of timestamps) {
    creditTotalsMap.set(timestamp, {
      totalInitialCreditsCents,
      totalConsumedCreditsCents,
      totalRemainingCreditsCents,
    });
  }

  return creditTotalsMap;
}

function getDatesInRange(startOfMonth: Date, endDate: Date): number[] {
  const dates = [];
  const current = new Date(startOfMonth);
  for (let date = current; date < endDate; date.setDate(date.getDate() + 1)) {
    dates.push(date.getTime());
  }
  return dates;
}

function getSelectedFilterClauses(
  filterParams: Partial<Record<GroupByType, string[]>> | undefined,
  excludeGroupBy?: GroupByType
) {
  const filterClauses: estypes.QueryDslQueryContainer[] = [];
  if (filterParams) {
    for (const filterKey of GROUP_BY_KEYS) {
      if (filterKey !== excludeGroupBy) {
        const filterValue = filterParams[filterKey];
        if (filterValue) {
          const filterValues = Array.isArray(filterValue)
            ? filterValue
            : [filterValue];
          const esField = GROUP_BY_KEY_TO_ES_FIELD[filterKey];
          filterClauses.push({ terms: { [esField]: filterValues } });
        }
      }
    }
  }
  return filterClauses;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceProgrammaticCostResponse>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const { groupBy, selectedMonth, filter: filterString } = q.data;

      // Parse and validate the filter JSON
      let filterParams: Partial<Record<GroupByType, string[]>> | undefined;
      if (filterString) {
        try {
          const parsedFilter = JSON.parse(filterString);
          const filterValidation = FilterSchema.safeParse(parsedFilter);
          if (!filterValidation.success) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: `Invalid filter parameter: ${filterValidation.error.message}`,
              },
            });
          }
          filterParams = filterValidation.data;
        } catch (error) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid filter JSON: ${normalizeError(error).message}`,
            },
          });
        }
      }

      const now = new Date();
      const startOfMonth = selectedMonth
        ? new Date(selectedMonth)
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()));

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const timestamps = getDatesInRange(startOfMonth, endOfMonth);

      // Build query for the current month
      const baseFilterClauses: estypes.QueryDslQueryContainer[] = [
        getShouldTrackTokenUsageCostsESFilter(auth),
        {
          range: {
            timestamp: {
              gte: startOfMonth.toISOString(),
              lt: endOfMonth.toISOString(),
            },
          },
        },
      ];

      const baseQuery = {
        bool: {
          filter: [
            ...baseFilterClauses,
            ...getSelectedFilterClauses(filterParams),
          ],
        },
      };

      // Fetch all credits for the workspace
      const credits = await CreditResource.listActive(auth, endOfMonth);

      // Calculate credit totals for each timestamp
      const creditTotalsMap = calculateCreditTotalsPerTimestamp(
        credits,
        timestamps
      );

      // Fetch all available groups (without filters) if groupBy is set
      const availableGroups: AvailableGroup[] = [];
      const groupValues: Record<string, Map<number, number>> = {};

      if (!groupBy) {
        // Fetch usage metrics
        const usageMetricsResult = await fetchMessageMetrics(baseQuery, "day", [
          "costCents",
        ]);

        if (usageMetricsResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve programmatic cost: ${usageMetricsResult.error.message}`,
            },
          });
        }

        groupValues["total"] = new Map<number, number>();
        usageMetricsResult.value.forEach((point) => {
          groupValues["total"]?.set(point.timestamp, point.costCents);
        });
        availableGroups.push({
          groupKey: "total",
          groupLabel: "Cumulative Cost",
        });
      } else {
        // Grouped view - use mapping to get ES field name
        const groupField = GROUP_BY_KEY_TO_ES_FIELD[groupBy];
        const availableGroupsResult = await searchAnalytics<never, GroupedAggs>(
          {
            bool: {
              filter: [
                ...baseFilterClauses,
                ...getSelectedFilterClauses(filterParams, groupBy),
              ],
            },
          },
          {
            aggregations: {
              by_group: {
                terms: {
                  field: groupField,
                  size: 100,
                  missing: "unknown",
                  order: { total_cost: "desc" },
                },
                aggs: {
                  total_cost: {
                    sum: { field: "tokens.cost_cents" },
                  },
                },
              },
            },
            size: 0,
          }
        );

        if (availableGroupsResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve grouped programmatic cost: ${availableGroupsResult.error.message}`,
            },
          });
        }

        const availableGroupBuckets = bucketsToArray(
          availableGroupsResult.value.aggregations?.by_group?.buckets
        );

        // Fetch agent names if grouping by agent
        const agentNamesForAvailable: Record<string, string> = {};
        if (groupBy === "agent") {
          const agentIds = availableGroupBuckets.map((b) => b.key);
          const agents = await AgentConfiguration.findAll({
            where: {
              sId: agentIds,
            },
            attributes: ["sId", "name"],
          });
          agents.forEach((agent) => {
            agentNamesForAvailable[agent.sId] = agent.name;
          });
        }

        availableGroupBuckets.forEach((bucket) => {
          let groupLabel = bucket.key;
          if (bucket.key === "unknown") {
            groupLabel = "Unknown";
          } else if (
            groupBy === "agent" &&
            agentNamesForAvailable[bucket.key]
          ) {
            groupLabel = agentNamesForAvailable[bucket.key];
          }
          availableGroups.push({
            groupKey: bucket.key,
            groupLabel,
          });
        });

        // Use the extracted helper to build metric aggregates
        const metricAggregates = buildMetricAggregates(["costCents"]);

        const result = await searchAnalytics<never, GroupedAggs>(baseQuery, {
          aggregations: {
            by_group: {
              terms: {
                field: groupField,
                size: 10, // Fetch slightly more than 5 to have candidates for "Others"
                missing: "unknown",
                // Sort by total cost across all days (descending)
                order: { total_cost: "desc" },
              },
              aggs: {
                // Total cost aggregation for sorting (sum across all documents in this group)
                total_cost: {
                  sum: { field: "tokens.cost_cents" },
                },
                // Daily breakdown
                by_day: {
                  date_histogram: {
                    field: "timestamp",
                    calendar_interval: "day",
                  },
                  aggs: metricAggregates,
                },
              },
            },
          },
          size: 0,
        });

        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve grouped programmatic cost: ${result.error.message}`,
            },
          });
        }

        const groupBuckets = bucketsToArray(
          result.value.aggregations?.by_group?.buckets
        );

        // ES already sorted by total cost, just parse and split into top 5 vs others
        const groupsWithParsedPoints = groupBuckets.map((groupBucket) => {
          // Parse each bucket once and store the results
          return {
            groupKey: groupBucket.key,
            points: bucketsToArray(groupBucket.by_day?.buckets).map((bucket) =>
              parseMetricsFromBucket(bucket, ["costCents"])
            ),
          };
        });

        // Group top 5 and aggregate others using extracted helper
        const allGroupsToProcess = groupTopNAndAggregateOthers(
          groupsWithParsedPoints,
          5,
          "costCents"
        );

        // Process all groups (top 5 + "Others") with single loop
        for (const { groupKey, points } of allGroupsToProcess) {
          groupValues[groupKey] = new Map(
            points.map((point) => [point.timestamp, point.costCents])
          );
        }
      }

      const programmaticCostCents: Record<string, number> = {};
      Object.keys(groupValues).forEach((group) => {
        programmaticCostCents[group] = 0;
      });

      const points = timestamps.map((timestamp) => {
        const groups = Object.entries(groupValues).map(
          ([groupKey, costMap]) => {
            const cost = costMap?.get(timestamp);
            const programmaticCost =
              (programmaticCostCents[groupKey] ?? 0) + (cost ?? 0);
            programmaticCostCents[groupKey] = programmaticCost;
            return {
              groupKey,
              costCents: cost ?? 0,
              programmaticCostCents:
                timestamp <= now.getTime() ? programmaticCost : undefined,
            };
          }
        );

        const credit = creditTotalsMap.get(timestamp);
        return {
          timestamp,
          groups,
          totalInitialCreditsCents: credit?.totalInitialCreditsCents ?? 0,
          totalConsumedCreditsCents: credit?.totalConsumedCreditsCents ?? 0,
          totalRemainingCreditsCents: credit?.totalRemainingCreditsCents ?? 0,
        };
      });

      return res.status(200).json({
        points,
        availableGroups,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
