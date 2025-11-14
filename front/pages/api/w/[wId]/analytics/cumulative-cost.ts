import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import {
  bucketsToArray,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QuerySchema = z.object({
  groupBy: z.enum(["global", "agent", "origin"]).optional(),
});

export type GetWorkspaceCumulativeCostResponse =
  | {
      groupBy: "global";
      points: {
        timestamp: number;
        cumulativeCostCents: number;
        dailyCostCents: number;
      }[];
    }
  | {
      groupBy: "agent" | "origin";
      groups: {
        [key: string]: {
          name: string;
          points: {
            timestamp: number;
            cumulativeCostCents: number;
            dailyCostCents: number;
          }[];
        };
      };
    };

type DailyBucket = {
  key: number;
  doc_count: number;
  cost_cents?: estypes.AggregationsSumAggregate;
};

type GroupBucket = {
  key: string;
  doc_count: number;
  by_day?: estypes.AggregationsMultiBucketAggregateBase<DailyBucket>;
};

type GroupedAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

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

      const groupBy = q.data.groupBy ?? "global";

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

      if (groupBy === "global") {
        // Original implementation for global view
        const usageMetricsResult = await fetchMessageMetrics(
          baseQuery,
          "day",
          ["costCents"]
        );

        if (usageMetricsResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve cumulative cost: ${usageMetricsResult.error.message}`,
            },
          });
        }

        // Calculate cumulative cost
        let cumulativeCost = 0;
        const points = usageMetricsResult.value.map((point) => {
          cumulativeCost += point.costCents;
          return {
            timestamp: point.timestamp,
            cumulativeCostCents: cumulativeCost,
            dailyCostCents: point.costCents,
          };
        });

        return res.status(200).json({
          groupBy: "global",
          points,
        });
      }

      // Grouped view (agent or origin)
      const groupField = groupBy === "agent" ? "agent_id" : "context_origin";

      const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
        by_group: {
          terms: {
            field: groupField,
            size: 100,
            missing: "unknown", // Include records with missing values
          },
          aggs: {
            by_day: {
              date_histogram: {
                field: "timestamp",
                calendar_interval: "day",
              },
              aggs: {
                cost_cents: {
                  sum: { field: "tokens.cost_cents" },
                },
              },
            },
          },
        },
      };

      const result = await searchAnalytics<never, GroupedAggs>(baseQuery, {
        aggregations: aggs,
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

      const groupBuckets = bucketsToArray<GroupBucket>(
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

      // Calculate total cost for each group to identify top 5
      const groupsWithTotals = groupBuckets.map((groupBucket) => {
        const dailyBuckets = bucketsToArray<DailyBucket>(
          groupBucket.by_day?.buckets
        );
        const totalCost = dailyBuckets.reduce(
          (sum, bucket) => sum + Math.round(bucket.cost_cents?.value ?? 0),
          0
        );
        return {
          groupKey: groupBucket.key,
          groupBucket,
          dailyBuckets,
          totalCost,
        };
      });

      // Sort by total cost descending and take top 5
      groupsWithTotals.sort((a, b) => b.totalCost - a.totalCost);
      const top5Groups = groupsWithTotals.slice(0, 5);
      const otherGroups = groupsWithTotals.slice(5);

      // Process groups
      const groups: {
        [key: string]: {
          name: string;
          points: {
            timestamp: number;
            cumulativeCostCents: number;
            dailyCostCents: number;
          }[];
        };
      } = {};

      // Process top 5 groups
      for (const { groupKey, dailyBuckets } of top5Groups) {
        let groupName: string;

        if (groupKey === "unknown") {
          groupName = "Unknown";
        } else if (groupBy === "agent") {
          groupName = agentNames[groupKey] || groupKey;
        } else {
          groupName = groupKey;
        }

        let cumulativeCost = 0;
        const points = dailyBuckets.map((bucket) => {
          const dailyCost = Math.round(bucket.cost_cents?.value ?? 0);
          cumulativeCost += dailyCost;
          return {
            timestamp: bucket.key,
            cumulativeCostCents: cumulativeCost,
            dailyCostCents: dailyCost,
          };
        });

        groups[groupKey] = {
          name: groupName,
          points,
        };
      }

      // Aggregate "Others" group if there are more than 5 groups
      if (otherGroups.length > 0) {
        // Collect all timestamps and aggregate daily costs
        const dailyCostsByTimestamp: Record<number, number> = {};

        for (const { dailyBuckets } of otherGroups) {
          for (const bucket of dailyBuckets) {
            const timestamp = bucket.key;
            const dailyCost = Math.round(bucket.cost_cents?.value ?? 0);
            dailyCostsByTimestamp[timestamp] =
              (dailyCostsByTimestamp[timestamp] || 0) + dailyCost;
          }
        }

        // Convert to array and sort by timestamp
        const sortedTimestamps = Object.keys(dailyCostsByTimestamp)
          .map(Number)
          .sort((a, b) => a - b);

        let cumulativeCost = 0;
        const points = sortedTimestamps.map((timestamp) => {
          const dailyCost = dailyCostsByTimestamp[timestamp];
          cumulativeCost += dailyCost;
          return {
            timestamp,
            cumulativeCostCents: cumulativeCost,
            dailyCostCents: dailyCost,
          };
        });

        groups["others"] = {
          name: "Others",
          points,
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
