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

export type WorkspaceProgrammaticCostPoint = {
  timestamp: number;
  groups: {
    groupKey: string;
    groupLabel: string;
    costCents: number;
    programmaticCostCents?: number;
  }[];
  totalInitialCreditsCents: number;
  totalRemainingCreditsCents: number;
};

export type GetWorkspaceProgrammaticCostResponse = {
  groupBy: "agent" | "origin" | undefined;
  points: WorkspaceProgrammaticCostPoint[];
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

  const totalInitialCreditsCents = credits.reduce(
    (sum, credit) => sum + credit.initialAmount,
    0
  );
  const totalRemainingCreditsCents = credits.reduce(
    (sum, credit) => sum + credit.remainingAmount,
    0
  );

  for (const timestamp of timestamps) {
    creditTotalsMap.set(timestamp, {
      totalInitialCreditsCents,
      totalRemainingCreditsCents,
    });
  }

  return creditTotalsMap;
}

function getDatesInRange(startOfMonth: Date, now: Date): number[] {
  const dates = [];
  for (let date = startOfMonth; date <= now; date.setDate(date.getDate() + 1)) {
    dates.push(date.getTime());
  }
  return dates;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceProgrammaticCostResponse>
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

      const { groupBy } = q.data;

      const now = new Date();

      // TODO: Calculate the start of the current month - should match the billing period
      const startOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      const endOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
      );

      const timestamps = getDatesInRange(startOfMonth, endOfMonth);
      const startDate = new Date(timestamps[0]);

      // Build query for the current month
      const baseQuery = {
        bool: {
          filter: [
            { term: { workspace_id: owner.sId } },
            {
              range: {
                timestamp: {
                  gte: startDate.toISOString(),
                },
              },
            },
          ],
        },
      };

      // Fetch all credits for the workspace
      const credits = await CreditResource.listActive(auth);

      // Calculate credit totals for each timestamp
      const creditTotalsMap = calculateCreditTotalsPerTimestamp(
        credits,
        timestamps
      );
      const groupLabels: Record<string, string> = {};
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
              message: `Failed to retrieve cumulative cost: ${usageMetricsResult.error.message}`,
            },
          });
        }

        groupLabels["total"] = "Total";
        groupValues["total"] = new Map<number, number>();
        usageMetricsResult.value.forEach((point) => {
          groupValues["total"]?.set(point.timestamp, point.costCents);
        });
      } else {
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
          // Determine group name
          if (groupKey === "others") {
            groupLabels["others"] = "Others";
          } else if (groupKey === "unknown") {
            groupLabels["unknown"] = "Unknown";
          } else if (groupBy === "agent") {
            groupLabels[groupKey] = agentNames[groupKey] || groupKey;
          } else {
            groupLabels[groupKey] = groupKey;
          }
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
              groupLabel: groupLabels[groupKey],
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
          totalRemainingCreditsCents: credit?.totalRemainingCreditsCents ?? 0,
        };
      });

      return res.status(200).json({
        groupBy,
        points,
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
