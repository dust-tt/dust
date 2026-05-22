import {
  aggregateToFourHourBuckets,
  calculateCreditTotalsFromBalances,
  getMetronomeWindowSize,
  resolveGroupLabels,
} from "@app/lib/api/analytics/metronome_usage";
import {
  DAY_MS,
  getTimestampsForWindow,
} from "@app/lib/api/analytics/time_utils";
import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeBalances,
  listMetronomeUsage,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getMetricLlmProviderCostProgrammaticId,
} from "@app/lib/metronome/constants";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const METRONOME_USAGE_GROUP_BY_KEYS = ["api_key", "model", "origin"] as const;

export type MetronomeUsageGroupByType =
  (typeof METRONOME_USAGE_GROUP_BY_KEYS)[number];

const QuerySchema = z.object({
  groupBy: z.enum(METRONOME_USAGE_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
  windowSize: z.enum(["HOUR", "FOUR_HOURS", "DAY"]).optional().default("DAY"),
});

export interface MetronomeUsagePointGroup {
  groupKey: string;
  valueMicroUsd: number;
  cumulatedValueMicroUsd?: number;
}

export interface MetronomeUsagePoint {
  timestamp: number;
  groups: MetronomeUsagePointGroup[];
  totalInitialCreditsMicroUsd: number;
  totalConsumedCreditsMicroUsd: number;
  totalRemainingCreditsMicroUsd: number;
}

export interface MetronomeUsageAvailableGroup {
  groupKey: string;
  groupLabel: string;
}

export interface GetMetronomeUsageResponse {
  points: MetronomeUsagePoint[];
  availableGroups: MetronomeUsageAvailableGroup[];
}

const GROUP_BY_TO_EVENT_PROPERTY: Record<MetronomeUsageGroupByType, string> = {
  api_key: "api_key_name",
  model: "model_id",
  origin: "origin",
};

// Mounted at /api/w/:wId/analytics/metronome-usage.
const app = workspaceApp();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }

  const llmMetricId = getMetricLlmProviderCostProgrammaticId();

  const {
    groupBy,
    groupByCount,
    selectedPeriod,
    billingCycleStartDay,
    windowSize,
  } = ctx.req.valid("query");

  const referenceDate = selectedPeriod ? new Date(selectedPeriod) : new Date();
  if (selectedPeriod) {
    referenceDate.setUTCDate(billingCycleStartDay);
  }
  const { cycleStart: periodStart, cycleEnd: periodEnd } =
    getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

  const TEN_DAYS_MS = 10 * DAY_MS;
  const cappedEnd = new Date(
    Math.min(periodEnd.getTime(), Date.now() + TEN_DAYS_MS)
  );

  const rangeStart = floorToMidnightUTC(periodStart);
  const rangeEnd = ceilToMidnightUTC(cappedEnd);
  const startingOn = rangeStart.toISOString();
  const endingBefore = rangeEnd.toISOString();

  const timestamps = getTimestampsForWindow(rangeStart, rangeEnd, windowSize);

  const balancesPromise = listMetronomeBalances(metronomeCustomerId);

  const groupValues: Record<string, Map<number, number>> = {};
  const availableGroups: MetronomeUsageAvailableGroup[] = [];

  const metronomeApiWindowSize = getMetronomeWindowSize(windowSize);
  const needsFourHourAggregation = windowSize === "FOUR_HOURS";

  if (!groupBy) {
    const result = await listMetronomeUsage({
      customerIds: [metronomeCustomerId],
      billableMetricIds: [llmMetricId],
      startingOn,
      endingBefore,
      windowSize: metronomeApiWindowSize,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome usage: ${result.error.message}`,
        },
      });
    }

    let totalMap = new Map<number, number>();
    for (const entry of result.value) {
      const ts = new Date(entry.startTimestamp).getTime();
      totalMap.set(
        ts,
        (totalMap.get(ts) ?? 0) + (entry.value ?? 0) * MARKUP_MULTIPLIER
      );
    }
    if (needsFourHourAggregation) {
      totalMap = aggregateToFourHourBuckets(totalMap);
    }
    groupValues["total"] = totalMap;

    availableGroups.push({
      groupKey: "total",
      groupLabel: "Total usage",
    });
  } else {
    const eventProperty = GROUP_BY_TO_EVENT_PROPERTY[groupBy];

    const groupedQueryBase = {
      customerId: metronomeCustomerId,
      startingOn,
      endingBefore,
      windowSize: metronomeApiWindowSize,
      groupKey: [eventProperty],
    };

    const llmGroupedResult = await listMetronomeUsageWithGroups({
      ...groupedQueryBase,
      billableMetricId: llmMetricId,
    });

    const mergedGroupMap = new Map<string, Map<number, number>>();

    if (llmGroupedResult.isErr()) {
      const msg = llmGroupedResult.error.message;
      const isGroupKeyError =
        msg.includes("group") || msg.includes("not found");
      return apiError(ctx, {
        status_code: isGroupKeyError ? 400 : 500,
        api_error: {
          type: isGroupKeyError
            ? "invalid_request_error"
            : "internal_server_error",
          message: isGroupKeyError
            ? `Grouping by "${groupBy}" is not available. The billable metric ` +
              `must have "${eventProperty}" configured as a group key in Metronome.`
            : `Failed to retrieve Metronome grouped usage: ${msg}`,
        },
      });
    }

    for (const entry of llmGroupedResult.value) {
      const key = entry.group?.[eventProperty] ?? "unknown";
      const ts = new Date(entry.startingOn).getTime();
      let keyMap = mergedGroupMap.get(key);
      if (!keyMap) {
        keyMap = new Map();
        mergedGroupMap.set(key, keyMap);
      }
      keyMap.set(
        ts,
        (keyMap.get(ts) ?? 0) + (entry.value ?? 0) * MARKUP_MULTIPLIER
      );
    }

    if (needsFourHourAggregation) {
      for (const key of [...mergedGroupMap.keys()]) {
        const tsMap = mergedGroupMap.get(key)!;
        mergedGroupMap.set(key, aggregateToFourHourBuckets(tsMap));
      }
    }

    const totalMap = new Map<number, number>();
    for (const tsMap of mergedGroupMap.values()) {
      for (const [ts, value] of tsMap) {
        totalMap.set(ts, (totalMap.get(ts) ?? 0) + value);
      }
    }
    groupValues["total"] = totalMap;

    const groupTotals = [...mergedGroupMap.entries()]
      .map(([key, tsMap]) => ({
        key,
        total: [...tsMap.values()].reduce((a, b) => a + b, 0),
        tsMap,
      }))
      .sort((a, b) => b.total - a.total);

    const topGroups = groupTotals.slice(0, groupByCount);
    for (const { key, tsMap } of topGroups) {
      groupValues[key] = tsMap;
    }

    const groupKeys = topGroups.map((g) => g.key);
    const labelMap = await resolveGroupLabels(groupBy, groupKeys);

    for (const key of groupKeys) {
      availableGroups.push({
        groupKey: key,
        groupLabel: labelMap.get(key) ?? key,
      });
    }
  }

  const balancesResult = await balancesPromise;
  if (balancesResult.isErr()) {
    logger.error(
      { error: balancesResult.error, metronomeCustomerId },
      "[Metronome] Failed to fetch balances for credit overlay"
    );
  }
  const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();
  const balances = balancesResult.isOk()
    ? balancesResult.value.filter(
        (entry) =>
          entry.access_schedule?.credit_type?.id ===
            programmaticUsdCreditTypeId && !isMetronomeExcessCredit(entry)
      )
    : [];
  const creditTotalsMap = calculateCreditTotalsFromBalances(
    balances,
    timestamps
  );

  const cumulatedValues: Record<string, number> = {};
  for (const key of Object.keys(groupValues)) {
    cumulatedValues[key] = 0;
  }

  const now = Date.now();

  const points: MetronomeUsagePoint[] = timestamps.map((timestamp) => {
    const groups = Object.entries(groupValues)
      .filter(([key]) => !groupBy || key !== "total")
      .map(([key, tsMap]) => {
        const value = tsMap.get(timestamp) ?? 0;
        const cumulated = (cumulatedValues[key] ?? 0) + value;
        cumulatedValues[key] = cumulated;
        return {
          groupKey: key,
          valueMicroUsd: value,
          cumulatedValueMicroUsd: timestamp <= now ? cumulated : undefined,
        };
      });

    if (groupBy) {
      const topSum = groups.reduce((acc, g) => acc + g.valueMicroUsd, 0);
      const totalValue = groupValues["total"]?.get(timestamp) ?? 0;
      const othersValue = totalValue - topSum;
      const cumulatedOthers = (cumulatedValues["others"] ?? 0) + othersValue;
      cumulatedValues["others"] = cumulatedOthers;

      groups.push({
        groupKey: "others",
        valueMicroUsd: othersValue,
        cumulatedValueMicroUsd: timestamp <= now ? cumulatedOthers : undefined,
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

  if ((cumulatedValues["others"] ?? 0) > 0) {
    availableGroups.push({
      groupKey: "others",
      groupLabel: "Others",
    });
  }

  const body: GetMetronomeUsageResponse = { points, availableGroups };
  return ctx.json(body);
});

export default app;
