import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import type { MetricsBucket } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  buildMetricAggregates,
  parseMetricsFromBucket,
} from "@app/lib/api/assistant/observability/messages_metrics";
import { DUST_MARKUP_PERCENT } from "@app/lib/api/assistant/token_pricing";
import {
  bucketsToArray,
  ensureAtMostNGroups,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { getShouldTrackTokenUsageCostsESFilter } from "@app/lib/api/programmatic_usage_tracking";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const GROUP_BY_KEYS = ["agent", "origin", "apiKey"] as const;

export type GroupByType = (typeof GROUP_BY_KEYS)[number];

const GROUP_BY_KEY_TO_ES_FIELD: Record<GroupByType, string> = {
  agent: "agent_id",
  origin: "context_origin",
  apiKey: "api_key_name",
};

const FilterSchema = z.record(z.enum(GROUP_BY_KEYS), z.string().array());

export const QuerySchema = z.object({
  groupBy: z.enum(GROUP_BY_KEYS).optional(),
  groupByCount: z.number().optional().default(5),
  filter: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        return undefined;
      }
      try {
        return JSON.parse(val);
      } catch {
        return val; // Return original to trigger validation error
      }
    })
    .pipe(FilterSchema.optional()),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
});

export type WorkspaceProgrammaticCostPoint = {
  timestamp: number;
  groups: {
    groupKey: string;
    costMicroUsd: number;
    cumulatedCostMicroUsd?: number;
  }[];
  totalInitialCreditsMicroUsd: number;
  totalConsumedCreditsMicroUsd: number;
  totalRemainingCreditsMicroUsd: number;
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
  by_hour?: estypes.AggregationsMultiBucketAggregateBase<DailyBucket>;
};

type GroupedAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  by_hour?: estypes.AggregationsMultiBucketAggregateBase<DailyBucket>;
};

/**
 * Calculates credit totals for each timestamp.
 * A credit is considered "active" on a day if:
 * - It has been started (startDate is not null and <= day start)
 * - It hasn't expired yet on that day (expirationDate is null or > day start)
 */
function calculateCreditTotalsPerTimestamp(
  credits: CreditResource[],
  timestamps: number[]
): Map<
  number,
  {
    totalInitialCreditsMicroUsd: number;
    totalConsumedCreditsMicroUsd: number;
    totalRemainingCreditsMicroUsd: number;
  }
> {
  const creditTotalsMap = new Map<
    number,
    {
      totalInitialCreditsMicroUsd: number;
      totalConsumedCreditsMicroUsd: number;
      totalRemainingCreditsMicroUsd: number;
    }
  >();

  const now = Date.now();

  for (const timestamp of timestamps) {
    const dayStart = new Date(timestamp);
    dayStart.setUTCHours(0, 0, 0, 0);
    // Use current time for today so credits created today are included.
    const cutoffTime =
      dayStart.getTime() === new Date().setUTCHours(0, 0, 0, 0)
        ? now
        : dayStart.getTime();

    const activeCredits = credits.filter((credit) => {
      if (!credit.startDate || credit.startDate.getTime() > cutoffTime) {
        return false;
      }

      if (
        credit.expirationDate &&
        credit.expirationDate.getTime() <= cutoffTime
      ) {
        return false;
      }

      return true;
    });

    const {
      totalInitialCreditsMicroUsd,
      totalConsumedCreditsMicroUsd,
      totalRemainingCreditsMicroUsd,
    } = activeCredits.reduce(
      (acc, credit) => {
        acc.totalInitialCreditsMicroUsd += credit.initialAmountMicroUsd;
        acc.totalConsumedCreditsMicroUsd += credit.consumedAmountMicroUsd;
        acc.totalRemainingCreditsMicroUsd +=
          credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd;
        return acc;
      },
      {
        totalInitialCreditsMicroUsd: 0,
        totalConsumedCreditsMicroUsd: 0,
        totalRemainingCreditsMicroUsd: 0,
      }
    );

    creditTotalsMap.set(timestamp, {
      totalInitialCreditsMicroUsd,
      totalConsumedCreditsMicroUsd,
      totalRemainingCreditsMicroUsd,
    });
  }

  return creditTotalsMap;
}

function getTimestampsInRange(startOfMonth: Date, endDate: Date): number[] {
  const timestamps = [];
  const current = new Date(startOfMonth);
  for (
    let timestamp = current;
    timestamp < endDate;
    timestamp.setUTCHours(timestamp.getUTCHours() + 4)
  ) {
    timestamps.push(timestamp.getTime());
  }
  return timestamps;
}

function getSelectedFilterClauses(
  filterParams: Partial<Record<GroupByType, string[]>> | undefined,
  excluded?: GroupByType
) {
  if (!filterParams) {
    return [];
  }

  return GROUP_BY_KEYS.filter(
    (key) => key !== excluded && filterParams[key]
  ).map((filterKey) => ({
    terms: {
      [GROUP_BY_KEY_TO_ES_FIELD[filterKey]]: filterParams[
        filterKey
      ] as string[],
    },
  }));
}

function buildAggregation(
  groupBy: GroupByType,
  groupByCount: number,
  includeDailyBreakdown: boolean
): Record<string, estypes.AggregationsAggregationContainer> {
  const groupField = GROUP_BY_KEY_TO_ES_FIELD[groupBy];
  // When grouping by API key, documents without an api_key_name represent
  // programmatic usage that didn't go through a custom API key (e.g., system keys).
  const missingValue =
    groupBy === "apiKey" ? "non_api_programmatic" : "unknown";
  return {
    by_group: {
      terms: {
        field: groupField,
        size: groupByCount,
        missing: missingValue,
        // Sort by total cost across all days (descending)
        order: { total_cost: "desc" },
      },
      aggs: {
        // Total cost aggregation for sorting (sum across all documents in this group)
        total_cost: {
          sum: { field: "tokens.cost_micro_usd" },
        },
        ...(includeDailyBreakdown
          ? {
              // Daily breakdown
              by_hour: {
                date_histogram: {
                  field: "timestamp",
                  fixed_interval: "4h",
                  time_zone: "UTC",
                },
                aggs: buildMetricAggregates(["costMicroUsd"]),
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Shared handler for programmatic cost API endpoints.
 * Used by both workspace and poke endpoints.
 */
export async function handleProgrammaticCostRequest(
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

      const {
        groupBy,
        groupByCount,
        selectedPeriod,
        billingCycleStartDay,
        filter: filterParams,
      } = q.data;

      // Get selected date range using shared billing cycle utility
      // selectedPeriod is "YYYY-MM", so new Date(selectedPeriod) creates day 1 of that month.
      // We need to set the day to billingCycleStartDay to get the correct billing cycle.
      const referenceDate = selectedPeriod
        ? new Date(selectedPeriod)
        : new Date();
      if (selectedPeriod) {
        referenceDate.setUTCDate(billingCycleStartDay);
      }
      const { cycleStart: periodStart, cycleEnd: periodEnd } =
        getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

      // Cap periodEnd to 5 days in the future to avoid empty chart areas.
      const FIVE_DAYS_IN_MS = 5 * 24 * 60 * 60 * 1000;
      const cappedPeriodEnd = new Date(
        Math.min(periodEnd.getTime(), Date.now() + FIVE_DAYS_IN_MS)
      );

      const timestamps = getTimestampsInRange(periodStart, cappedPeriodEnd);

      // Fetch all credits for the workspace (including free credits and fully consumed ones)
      // We'll filter them per timestamp in calculateCreditTotalsPerTimestamp
      const credits = await CreditResource.listAll(auth);

      // Calculate credit totals for each timestamp
      const creditTotalsMap = calculateCreditTotalsPerTimestamp(
        credits,
        timestamps
      );

      // Build base filter clauses with date range
      const baseFilterClauses: estypes.QueryDslQueryContainer[] = [
        getShouldTrackTokenUsageCostsESFilter(auth),
        {
          range: {
            timestamp: {
              gte: periodStart.toISOString(),
              lt: periodEnd.toISOString(),
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

      const availableGroups: AvailableGroup[] = [];
      const groupValues: Record<string, Map<number, number>> = {};

      const result = await searchAnalytics<never, GroupedAggs>(baseQuery, {
        aggregations: {
          total_cost: {
            sum: { field: "tokens.cost_micro_usd" },
          },
          by_hour: {
            date_histogram: {
              field: "timestamp",
              fixed_interval: "4h",
              time_zone: "UTC",
            },
            aggs: buildMetricAggregates(["costMicroUsd"]),
          },
          ...(groupBy ? buildAggregation(groupBy, groupByCount, true) : {}),
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

      const totalBuckets = bucketsToArray<MetricsBucket>(
        result.value.aggregations?.by_hour?.buckets
      );

      // Apply the same markup to costs that is applied when consuming credits.
      // This ensures the graph shows what users are actually billed.
      const markupMultiplier = 1 + DUST_MARKUP_PERCENT / 100;

      // Add total points to groupValues
      groupValues["total"] = new Map<number, number>();
      totalBuckets.forEach((bucket) => {
        const point = parseMetricsFromBucket(bucket, ["costMicroUsd"]);
        groupValues["total"]?.set(
          point.timestamp,
          point.costMicroUsd * markupMultiplier
        );
      });

      if (result.value.aggregations?.by_group) {
        const groupBuckets = bucketsToArray(
          result.value.aggregations?.by_group?.buckets
        );

        // ES already sorted by total cost, just parse and split into top 5 vs others
        const groupsWithParsedPoints = groupBuckets.map((groupBucket) => {
          // Parse each bucket once and store the results
          return {
            groupKey: groupBucket.key,
            points: bucketsToArray(groupBucket.by_hour?.buckets).map((bucket) =>
              parseMetricsFromBucket(bucket, ["costMicroUsd"])
            ),
          };
        });

        // Keep at most 5 groups
        const allGroupsToProcess = ensureAtMostNGroups(
          groupsWithParsedPoints,
          5,
          "costMicroUsd"
        );

        // Process all groups (top 5 + "Others") with single loop
        for (const { groupKey, points } of allGroupsToProcess) {
          groupValues[groupKey] = new Map(
            points.map((point) => [
              point.timestamp,
              point.costMicroUsd * markupMultiplier,
            ])
          );
        }

        let availableGroupBuckets = groupBuckets;
        if (filterParams && groupBy) {
          const availableGroupsResult = await searchAnalytics<
            never,
            GroupedAggs
          >(
            {
              bool: {
                filter: [
                  ...baseFilterClauses,
                  ...getSelectedFilterClauses(filterParams, groupBy),
                ],
              },
            },
            {
              aggregations: buildAggregation(groupBy, groupByCount, false),
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

          availableGroupBuckets = bucketsToArray(
            availableGroupsResult.value.aggregations?.by_group?.buckets
          );
        }

        // Fetch agent names if grouping by agent
        const agentNames: Record<string, string> = {};
        if (groupBy === "agent") {
          const agentIds = availableGroupBuckets.map((b) => b.key);
          const agents = await AgentConfigurationModel.findAll({
            where: {
              sId: agentIds,
            },
            attributes: ["sId", "name"],
          });
          agents.forEach((agent) => {
            agentNames[agent.sId] = agent.name;
          });
        }

        availableGroupBuckets.forEach((bucket) => {
          let groupLabel = bucket.key;
          if (bucket.key === "non_api_programmatic") {
            groupLabel = "Non-API programmatic usage";
          } else if (bucket.key === "unknown") {
            groupLabel = "Unknown";
          } else if (groupBy === "agent" && agentNames[bucket.key]) {
            groupLabel = agentNames[bucket.key];
          }
          availableGroups.push({
            groupKey: bucket.key,
            groupLabel,
          });
        });
      }

      const cumulatedCostMicroUsd: Record<string, number> = {};
      Object.keys(groupValues).forEach((group) => {
        cumulatedCostMicroUsd[group] = 0;
      });

      const now = new Date();

      const points = timestamps.map((timestamp) => {
        const groups = Object.entries(groupValues)
          .filter(([groupKey]) => !groupBy || groupKey !== "total")
          .map(([groupKey, costMap]) => {
            const cost = costMap?.get(timestamp);
            const cumulatedCost =
              (cumulatedCostMicroUsd[groupKey] ?? 0) + (cost ?? 0);
            cumulatedCostMicroUsd[groupKey] = cumulatedCost;
            return {
              groupKey,
              costMicroUsd: cost ?? 0,
              cumulatedCostMicroUsd:
                timestamp <= now.getTime() ? cumulatedCost : undefined,
            };
          });

        if (groupBy) {
          const costForAll = groups.reduce(
            (acc, group) => acc + group.costMicroUsd,
            0
          );

          // Include "others" group
          const totalCost = groupValues.total?.get(timestamp) ?? 0;
          const otherCost = totalCost - costForAll;
          const cumulatedOtherCost =
            (cumulatedCostMicroUsd["others"] ?? 0) + (otherCost ?? 0);
          cumulatedCostMicroUsd["others"] = cumulatedOtherCost;

          groups.push({
            groupKey: "others",
            costMicroUsd: otherCost,
            cumulatedCostMicroUsd:
              timestamp <= now.getTime() ? cumulatedOtherCost : undefined,
          });
        }

        const credit = creditTotalsMap.get(timestamp);
        return {
          timestamp,
          groups,
          totalInitialCreditsMicroUsd: credit?.totalInitialCreditsMicroUsd ?? 0,
          totalConsumedCreditsMicroUsd:
            credit?.totalConsumedCreditsMicroUsd ?? 0,
          totalRemainingCreditsMicroUsd:
            credit?.totalRemainingCreditsMicroUsd ?? 0,
        };
      });

      if (cumulatedCostMicroUsd["others"] > 0) {
        availableGroups.push({
          groupKey: "others",
          groupLabel: "Others",
        });
      }

      if (!groupBy) {
        // Add "total" to available groups
        availableGroups.push({
          groupKey: "total",
          groupLabel: "Total cost consumed",
        });
      }

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
