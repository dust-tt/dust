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
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = z.object({
  groupBy: z.enum(["agent", "origin"]).optional(),
});

export type WorkspaceCumulativeCostPoint = {
  timestamp: number;
  cumulativeCostCents: number;
  costCents: number;
  totalInitialCreditsCents: number;
  totalRemainingCreditsCents: number;
};

export type GetWorkspaceCumulativeCostResponse =
  | {
      groupBy: undefined;
      points: WorkspaceCumulativeCostPoint[];
    }
  | {
      groupBy: "agent" | "origin";
      groups: {
        [key: string]: {
          name: string;
          points: WorkspaceCumulativeCostPoint[];
        };
      };
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
  { totalInitialCreditsCents: number; totalRemainingCreditsCents: number }
> {
  const creditTotalsMap = new Map<
    number,
    { totalInitialCreditsCents: number; totalRemainingCreditsCents: number }
  >();

  for (const timestamp of timestamps) {
    const dayDate = new Date(timestamp);
    const dayEnd = new Date(dayDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Find all credits that were active on this day
    const activeCredits = credits.filter((credit) => {
      const createdAt = credit.createdAt;
      const expirationDate = credit.expirationDate;

      // Credit must be created before or on this day
      if (createdAt > dayEnd) {
        return false;
      }

      // Credit must not have expired before this day
      if (expirationDate && expirationDate <= dayDate) {
        return false;
      }

      return true;
    });

    // Sum up the amounts
    const totalInitialCreditsCents = activeCredits.reduce(
      (sum, credit) => sum + credit.initialAmount,
      0
    );
    const totalRemainingCreditsCents = activeCredits.reduce(
      (sum, credit) => sum + credit.remainingAmount,
      0
    );

    creditTotalsMap.set(timestamp, {
      totalInitialCreditsCents,
      totalRemainingCreditsCents,
    });
  }

  return creditTotalsMap;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceCumulativeCostResponse>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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

      const groupBy = q.data.groupBy;

      // Calculate the start of the current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Build query for the current month
      const baseQuery = {
        bool: {
          filter: [
            { term: { workspace_id: owner.sId } },
            {
              range: {
                timestamp: {
                  gte: startOfMonth.toISOString(),
                },
              },
            },
          ],
        },
      };

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
              message: `Failed to retrieve cumulative cost: ${usageMetricsResult.error.message}`,
            },
          });
        }

        // Fetch all credits for the workspace
        const credits = await CreditResource.listActive(auth, startOfMonth);

        // Calculate credit totals for each timestamp
        const timestamps = usageMetricsResult.value.map((p) => p.timestamp);
        const creditTotalsMap = calculateCreditTotalsPerTimestamp(
          credits,
          timestamps
        );

        // Calculate cumulative cost and add credit data
        let cumulativeCostCents = 0;
        const points = usageMetricsResult.value.map((point) => {
          cumulativeCostCents += point.costCents;
          return {
            ...point,
            cumulativeCostCents,
            ...(creditTotalsMap.get(point.timestamp) ?? {
              totalInitialCreditsCents: 0,
              totalRemainingCreditsCents: 0,
            }),
          };
        });

        return res.status(200).json({
          groupBy: undefined,
          points,
        });
      }

      // Grouped view (agent or origin)
      const groupField = groupBy === "agent" ? "agent_id" : "context_origin";

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
            message: `Failed to retrieve grouped cumulative cost: ${result.error.message}`,
          },
        });
      }

      const groupBuckets = bucketsToArray(
        result.value.aggregations?.by_group?.buckets
      );

      // Fetch agent names if grouping by agent
      const agentNames: Record<string, string> = {};
      if (groupBy === "agent") {
        const agentIds = groupBuckets.map((b) => b.key);
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

      // Fetch all credits for the workspace
      const credits = await CreditResource.listActive(auth, startOfMonth);

      // Collect all unique timestamps across all groups
      const allTimestamps = new Set<number>();
      groupBuckets.forEach((groupBucket) => {
        const dailyBuckets = bucketsToArray(groupBucket.by_day?.buckets);
        dailyBuckets.forEach((bucket) => {
          allTimestamps.add(bucket.key);
        });
      });

      // Calculate credit totals for all timestamps
      const creditTotalsMap = calculateCreditTotalsPerTimestamp(
        credits,
        Array.from(allTimestamps)
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
      const groups: {
        [key: string]: {
          name: string;
          points: WorkspaceCumulativeCostPoint[];
        };
      } = {};

      for (const { groupKey, points } of allGroupsToProcess) {
        // Determine group name
        let groupName: string;
        if (groupKey === "others") {
          groupName = "Others";
        } else if (groupKey === "unknown") {
          groupName = "Unknown";
        } else if (groupBy === "agent") {
          groupName = agentNames[groupKey] || groupKey;
        } else {
          groupName = groupKey;
        }

        let cumulativeCostCents = 0;
        groups[groupKey] = {
          name: groupName,
          points: points.map((point) => {
            cumulativeCostCents += point.costCents;
            return {
              ...point,
              cumulativeCostCents,
              ...(creditTotalsMap.get(point.timestamp) ?? {
                totalInitialCreditsCents: 0,
                totalRemainingCreditsCents: 0,
              }),
            };
          }),
        };
      }

      return res.status(200).json({
        groupBy,
        groups,
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
