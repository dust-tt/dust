import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import type { MetricsBucket } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  buildMetricAggregates,
  parseMetricsFromBucket,
} from "@app/lib/api/assistant/observability/messages_metrics";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  bucketsToArray,
  ensureAtMostNGroups,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { getShouldTrackTokenUsageCostsESFilter } from "@app/lib/api/programmatic_usage_tracking";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { randInt } from "three/src/math/MathUtils.js";
import { cos } from "mathjs";

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
  selectedMonth: z.string().optional(),
});

export type WorkspaceProgrammaticCostPoint = {
  timestamp: number;
  groups: {
    groupKey: string;
    costCents: number;
    cumulatedCostCents?: number;
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
  by_day?: estypes.AggregationsMultiBucketAggregateBase<DailyBucket>;
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
  return {
    by_group: {
      terms: {
        field: groupField,
        size: groupByCount,
        missing: "unknown",
        // Sort by total cost across all days (descending)
        order: { total_cost: "desc" },
      },
      aggs: {
        // Total cost aggregation for sorting (sum across all documents in this group)
        total_cost: {
          sum: { field: "tokens.cost_cents" },
        },
        ...(includeDailyBreakdown
          ? {
              // Daily breakdown
              by_day: {
                date_histogram: {
                  field: "timestamp",
                  calendar_interval: "day",
                },
                aggs: buildMetricAggregates(["costCents"]),
              },
            }
          : {}),
      },
    },
  };
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

      const {
        groupBy,
        groupByCount,
        selectedMonth,
        filter: filterParams,
      } = q.data;

      // Get selected date range
      const now = new Date();
      const startOfMonth = selectedMonth
        ? new Date(selectedMonth)
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()));

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      const timestamps = getDatesInRange(startOfMonth, endOfMonth);

      // Fetch all credits for the workspace
      const credits = await CreditResource.listActive(auth, endOfMonth);

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

      const availableGroups: AvailableGroup[] = [];
      const groupValues: Record<string, Map<number, number>> = {};

      const result = await searchAnalytics<never, GroupedAggs>(baseQuery, {
        aggregations: {
          total_cost: {
            sum: { field: "tokens.cost_cents" },
          },
          by_day: {
            date_histogram: {
              field: "timestamp",
              calendar_interval: "day",
            },
            aggs: buildMetricAggregates(["costCents"]),
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
        result.value.aggregations?.by_day?.buckets
      );

      // Add total points to groupValues
      groupValues["total"] = new Map<number, number>();
      totalBuckets.forEach((bucket) => {
        const point = parseMetricsFromBucket(bucket, ["costCents"]);
        groupValues["total"]?.set(point.timestamp, point.costCents);
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
            points: bucketsToArray(groupBucket.by_day?.buckets).map((bucket) =>
              parseMetricsFromBucket(bucket, ["costCents"])
            ),
          };
        });

        // Keep at most 5 groups
        const allGroupsToProcess = ensureAtMostNGroups(
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
          const agents = await AgentConfiguration.findAll({
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
          if (bucket.key === "unknown") {
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

      const cumulatedCostCents: Record<string, number> = {};
      Object.keys(groupValues).forEach((group) => {
        cumulatedCostCents[group] = 0;
      });

      const points = timestamps.map((timestamp) => {
        const groups = Object.entries(groupValues)
          .filter(([groupKey]) => !groupBy || groupKey !== "total")
          .map(([groupKey, costMap]) => {
            const cost = costMap?.get(timestamp);
            const cumulatedCost =
              (cumulatedCostCents[groupKey] ?? 0) + (cost ?? 0);
            cumulatedCostCents[groupKey] = cumulatedCost;
            return {
              groupKey,
              costCents: cost ?? 0,
              cumulatedCostCents:
                timestamp <= now.getTime() ? cumulatedCost : undefined,
            };
          });

        if (groupBy) {
          const costForAll = groups.reduce(
            (acc, group) => acc + group.costCents,
            0
          );

          // Include "others" group
          const totalCost = groupValues.total?.get(timestamp) ?? 0;
          const otherCost = totalCost - costForAll;
          const cumulatedOtherCost =
            (cumulatedCostCents["others"] ?? 0) + (otherCost ?? 0);
          cumulatedCostCents["others"] = cumulatedOtherCost;

          groups.push({
            groupKey: "others",
            costCents: otherCost,
            cumulatedCostCents:
              timestamp <= now.getTime() ? cumulatedOtherCost : undefined,
          });
        }

        const credit = creditTotalsMap.get(timestamp);
        return {
          timestamp,
          groups,
          totalInitialCreditsCents: credit?.totalInitialCreditsCents ?? 0,
          totalConsumedCreditsCents: credit?.totalConsumedCreditsCents ?? 0,
          totalRemainingCreditsCents: credit?.totalRemainingCreditsCents ?? 0,
        };
      });

      if (cumulatedCostCents["others"] > 0) {
        availableGroups.push({
          groupKey: "others",
          groupLabel: "Others",
        });
      }

      if (!groupBy) {
        // Add "total" to available groups
        availableGroups.push({
          groupKey: "total",
          groupLabel: "Cumulative Cost",
        });
      }

      // Generate dummy data for testing
      const dummyGroupsByType: Record<GroupByType, AvailableGroup[]> = {
        agent: [
          { groupKey: "agent-1", groupLabel: "Sales Assistant" },
          { groupKey: "agent-2", groupLabel: "Support Bot" },
          { groupKey: "agent-3", groupLabel: "Code Helper" },
        ],
        origin: [
          { groupKey: "slack", groupLabel: "Slack" },
          { groupKey: "web", groupLabel: "Web" },
          { groupKey: "api", groupLabel: "API" },
        ],
        apiKey: [
          { groupKey: "api_key_1", groupLabel: "Production API" },
          { groupKey: "api_key_2", groupLabel: "Staging API" },
        ],
      };

      // Get groups for current groupBy mode
      let dummyAvailableGroups: AvailableGroup[] = [];
      let activeGroupKeys: string[] = [];

      // Define fixed costs per group (these don't change with filtering)
      const fixedGroupCosts: Record<GroupByType, Record<string, number>> = {
        agent: {
          "agent-1": 0.4,
          "agent-2": 0.35,
          "agent-3": 0.2,
          others: 0.05,
        },
        origin: {
          slack: 0.5,
          web: 0.3,
          api: 0.15,
          others: 0.05,
        },
        apiKey: {
          api_key_1: 0.6,
          api_key_2: 0.35,
          others: 0.05,
        },
      };

      if (groupBy) {
        dummyAvailableGroups = [...dummyGroupsByType[groupBy]];
        // Add "others" group to available groups
        dummyAvailableGroups.push({ groupKey: "others", groupLabel: "Others" });

        // Apply filter for the current groupBy mode
        const currentFilter = filterParams?.[groupBy];
        if (currentFilter && currentFilter.length > 0) {
          activeGroupKeys = currentFilter;
        } else {
          // By default, show all except "others"
          activeGroupKeys = dummyGroupsByType[groupBy].map((g) => g.groupKey);
        }
      } else {
        // Global mode - show total
        dummyAvailableGroups = [
          { groupKey: "total", groupLabel: "Cumulative Cost" },
        ];
        activeGroupKeys = ["total"];
      }

      const cumulatedCosts: Record<string, number> = {};
      activeGroupKeys.forEach((key) => {
        cumulatedCosts[key] = 0;
      });

      const dummyPoints: WorkspaceProgrammaticCostPoint[] = timestamps.map(
        (timestamp, index) => {
          const dayOfMonth = index + 1;
          const baseCost = 10000 + cos(dayOfMonth + 1) * 10000; // Increasing cost over the month

          const groups = activeGroupKeys.map((groupKey) => {
            // Use fixed cost ratios - filtering changes which groups are shown, not the costs
            const costRatio = groupBy
              ? (fixedGroupCosts[groupBy][groupKey] ?? 0.1)
              : 1;
            const groupCost = Math.floor(baseCost * costRatio);
            cumulatedCosts[groupKey] += groupCost;
            return {
              groupKey,
              costCents: groupCost,
              cumulatedCostCents:
                timestamp <= now.getTime()
                  ? cumulatedCosts[groupKey]
                  : undefined,
            };
          });

          return {
            timestamp,
            groups,
            totalInitialCreditsCents: 100000, // $1000 in credits
            totalConsumedCreditsCents: Math.floor(baseCost),
            totalRemainingCreditsCents: 100000 - Math.floor(baseCost),
          };
        }
      );

      return res.status(200).json({
        points: dummyPoints,
        availableGroups: dummyAvailableGroups,
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
