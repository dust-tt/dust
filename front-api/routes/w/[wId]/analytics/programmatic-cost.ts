import type { estypes } from "@elastic/elasticsearch";
import { Hono } from "hono";
import { z } from "zod";

import {
  buildAggregation,
  calculateCreditTotalsPerTimestamp,
  getSelectedFilterClauses,
} from "@app/lib/api/analytics/programmatic_cost";
import {
  DAY_MS,
  getTimestampsForWindow,
} from "@app/lib/api/analytics/time_utils";
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
import { getShouldTrackTokenUsageCostsESFilter } from "@app/lib/api/programmatic_usage/common";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { CreditResource } from "@app/lib/resources/credit_resource";

import { validate } from "@front-api/middleware/validator";

const GROUP_BY_KEYS = ["agent", "origin", "apiKey"] as const;

export type GroupByType = (typeof GROUP_BY_KEYS)[number];

const FilterSchema = z.record(z.enum(GROUP_BY_KEYS), z.string().array());

const QuerySchema = z.object({
  groupBy: z.enum(GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
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
        return val;
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
  availableGroups: AvailableGroup[];
};

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

// Mounted at /api/w/:wId/analytics/programmatic-cost.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  const {
    groupBy,
    groupByCount,
    selectedPeriod,
    billingCycleStartDay,
    filter: filterParams,
  } = c.req.valid("query");

  const referenceDate = selectedPeriod ? new Date(selectedPeriod) : new Date();
  if (selectedPeriod) {
    referenceDate.setUTCDate(billingCycleStartDay);
  }
  const { cycleStart: periodStart, cycleEnd: periodEnd } =
    getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

  const TEN_DAYS_MS = 10 * DAY_MS;
  const cappedPeriodEnd = new Date(
    Math.min(periodEnd.getTime(), Date.now() + TEN_DAYS_MS)
  );

  const timestamps = getTimestampsForWindow(
    periodStart,
    cappedPeriodEnd,
    "FOUR_HOURS"
  );

  const credits = await CreditResource.listAll(auth);

  const creditTotalsMap = calculateCreditTotalsPerTimestamp(
    credits,
    timestamps
  );

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
      filter: [...baseFilterClauses, ...getSelectedFilterClauses(filterParams)],
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve grouped programmatic cost: ${result.error.message}`,
        },
      },
      500
    );
  }

  const totalBuckets = bucketsToArray<MetricsBucket>(
    result.value.aggregations?.by_hour?.buckets
  );

  const markupMultiplier = 1 + DUST_MARKUP_PERCENT / 100;

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

    const groupsWithParsedPoints = groupBuckets.map((groupBucket) => {
      return {
        groupKey: groupBucket.key,
        points: bucketsToArray(groupBucket.by_hour?.buckets).map((bucket) =>
          parseMetricsFromBucket(bucket, ["costMicroUsd"])
        ),
      };
    });

    const allGroupsToProcess = ensureAtMostNGroups(
      groupsWithParsedPoints,
      groupByCount,
      "costMicroUsd"
    );

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
          aggregations: buildAggregation(groupBy, groupByCount, false),
          size: 0,
        }
      );

      if (availableGroupsResult.isErr()) {
        return c.json(
          {
            error: {
              type: "internal_server_error",
              message: `Failed to retrieve grouped programmatic cost: ${availableGroupsResult.error.message}`,
            },
          },
          500
        );
      }

      availableGroupBuckets = bucketsToArray(
        availableGroupsResult.value.aggregations?.by_group?.buckets
      );
    }

    const agentNames: Record<string, string> = {};
    if (groupBy === "agent") {
      const agentIds = availableGroupBuckets.map((b) => b.key);
      const agents = await AgentConfigurationModel.findAll({
        where: {
          sId: agentIds,
          workspaceId: auth.getNonNullableWorkspace().id,
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
      totalConsumedCreditsMicroUsd: credit?.totalConsumedCreditsMicroUsd ?? 0,
      totalRemainingCreditsMicroUsd: credit?.totalRemainingCreditsMicroUsd ?? 0,
    };
  });

  if (cumulatedCostMicroUsd["others"] > 0) {
    availableGroups.push({
      groupKey: "others",
      groupLabel: "Others",
    });
  }

  if (!groupBy) {
    availableGroups.push({
      groupKey: "total",
      groupLabel: "Total cost consumed",
    });
  }

  const body: GetWorkspaceProgrammaticCostResponse = {
    points,
    availableGroups,
  };
  return c.json(body);
});

export default app;
