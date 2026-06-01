import {
  aggregateToFourHourBuckets,
  getMetronomeWindowSize,
} from "@app/lib/api/analytics/metronome_usage";
import {
  DAY_MS,
  getTimestampsForWindow,
} from "@app/lib/api/analytics/time_utils";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeBalances,
  listMetronomeUsage,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getMetricLlmProviderCostAwuId,
} from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import { isMetronomeExcessCredit } from "@app/lib/metronome/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

// All-usage AWU chart. Covers user + programmatic + free usage and is
// denominated in AWU credits (never USD). The AWU metric's cost_awu values
// already include the Dust markup (applied at event time), so no markup is
// applied here, and credit balances are returned as whole AWU credits.
const AWU_USAGE_GROUP_BY_KEYS = [
  "usage_type",
  "api_key",
  "model",
  "origin",
] as const;

export type AwuUsageGroupByType = (typeof AWU_USAGE_GROUP_BY_KEYS)[number];

// Human-readable labels for the "usage_type" group key values.
const USAGE_TYPE_LABELS: Record<string, string> = {
  programmatic: "Programmatic",
  user: "User",
  free: "Free",
};

const GROUP_BY_TO_EVENT_PROPERTY: Record<AwuUsageGroupByType, string> = {
  usage_type: "usage_type",
  api_key: "api_key_name",
  model: "model_id",
  origin: "origin",
};

export const AwuUsageQuerySchema = z.object({
  groupBy: z.enum(AWU_USAGE_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
  windowSize: z.enum(["HOUR", "FOUR_HOURS", "DAY"]).optional().default("DAY"),
});

export type AwuUsageQuery = z.infer<typeof AwuUsageQuerySchema>;

export interface AwuUsagePointGroup {
  groupKey: string;
  valueCredits: number;
  cumulatedValueCredits?: number;
}

export interface AwuUsagePoint {
  timestamp: number;
  groups: AwuUsagePointGroup[];
  totalInitialCredits: number;
  totalConsumedCredits: number;
  totalRemainingCredits: number;
}

export interface AwuUsageAvailableGroup {
  groupKey: string;
  groupLabel: string;
}

export interface GetAwuUsageResponse {
  points: AwuUsagePoint[];
  availableGroups: AwuUsageAvailableGroup[];
}

export type AwuUsageError =
  | { type: "metronome_not_configured" }
  | {
      type: "invalid_group_key";
      groupBy: AwuUsageGroupByType;
      eventProperty: string;
    }
  | { type: "internal_error"; message: string };

interface ParsedBalance {
  initialAmountCredits: number;
  balanceCredits: number;
  intervals: { start: number; end: number }[];
}

// Credit totals per timestamp, expressed in whole AWU credits (no USD scaling).
export function calculateAwuCreditTotalsFromBalances(
  balances: MetronomeBalance[],
  timestamps: number[]
): Map<
  number,
  {
    totalInitialCredits: number;
    totalConsumedCredits: number;
    totalRemainingCredits: number;
  }
> {
  const parsed: ParsedBalance[] = balances.map((entry) => {
    const items = entry.access_schedule?.schedule_items ?? [];
    let initialAmountCredits = 0;
    const intervals: { start: number; end: number }[] = [];

    for (const item of items) {
      initialAmountCredits += item.amount;
      intervals.push({
        start: new Date(item.starting_at).getTime(),
        end: new Date(item.ending_before).getTime(),
      });
    }

    return {
      initialAmountCredits,
      balanceCredits: entry.balance ?? 0,
      intervals,
    };
  });

  const result = new Map<
    number,
    {
      totalInitialCredits: number;
      totalConsumedCredits: number;
      totalRemainingCredits: number;
    }
  >();

  for (const timestamp of timestamps) {
    let totalInitialCredits = 0;
    let totalRemainingCredits = 0;

    for (const b of parsed) {
      const isActive = b.intervals.some(
        (iv) => timestamp >= iv.start && timestamp < iv.end
      );
      if (isActive) {
        totalInitialCredits += b.initialAmountCredits;
        totalRemainingCredits += b.balanceCredits;
      }
    }

    result.set(timestamp, {
      totalInitialCredits,
      totalConsumedCredits: totalInitialCredits - totalRemainingCredits,
      totalRemainingCredits,
    });
  }

  return result;
}

function resolveGroupLabels(
  groupBy: AwuUsageGroupByType,
  groupKeys: string[]
): Map<string, string> {
  const labelMap = new Map<string, string>();
  switch (groupBy) {
    case "usage_type":
      for (const key of groupKeys) {
        labelMap.set(key, USAGE_TYPE_LABELS[key] ?? key);
      }
      break;
    case "api_key":
    case "model":
    case "origin":
      for (const key of groupKeys) {
        labelMap.set(key, key);
      }
      break;
    default:
      assertNever(groupBy);
  }
  return labelMap;
}

export async function getAwuUsage(
  auth: Authenticator,
  query: AwuUsageQuery
): Promise<Result<GetAwuUsageResponse, AwuUsageError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err({ type: "metronome_not_configured" });
  }

  const awuMetricId = getMetricLlmProviderCostAwuId();

  const {
    groupBy,
    groupByCount,
    selectedPeriod,
    billingCycleStartDay,
    windowSize,
  } = query;

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
  const availableGroups: AwuUsageAvailableGroup[] = [];

  const metronomeApiWindowSize = getMetronomeWindowSize(windowSize);
  const needsFourHourAggregation = windowSize === "FOUR_HOURS";

  if (!groupBy) {
    const result = await listMetronomeUsage({
      customerIds: [metronomeCustomerId],
      billableMetricIds: [awuMetricId],
      startingOn,
      endingBefore,
      windowSize: metronomeApiWindowSize,
    });

    if (result.isErr()) {
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve AWU usage: ${result.error.message}`,
      });
    }

    let totalMap = new Map<number, number>();
    for (const entry of result.value) {
      const ts = new Date(entry.startTimestamp).getTime();
      totalMap.set(ts, (totalMap.get(ts) ?? 0) + (entry.value ?? 0));
    }
    if (needsFourHourAggregation) {
      totalMap = aggregateToFourHourBuckets(totalMap);
    }
    groupValues["total"] = totalMap;

    availableGroups.push({ groupKey: "total", groupLabel: "Total usage" });
  } else {
    const eventProperty = GROUP_BY_TO_EVENT_PROPERTY[groupBy];

    const groupedResult = await listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: awuMetricId,
      startingOn,
      endingBefore,
      windowSize: metronomeApiWindowSize,
      groupKey: [eventProperty],
    });

    if (groupedResult.isErr()) {
      const msg = groupedResult.error.message;
      const isGroupKeyError =
        msg.includes("group") || msg.includes("not found");
      if (isGroupKeyError) {
        return new Err({ type: "invalid_group_key", groupBy, eventProperty });
      }
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve AWU grouped usage: ${msg}`,
      });
    }

    const mergedGroupMap = new Map<string, Map<number, number>>();
    for (const entry of groupedResult.value) {
      const key = entry.group?.[eventProperty] ?? "unknown";
      const ts = new Date(entry.startingOn).getTime();
      let keyMap = mergedGroupMap.get(key);
      if (!keyMap) {
        keyMap = new Map();
        mergedGroupMap.set(key, keyMap);
      }
      keyMap.set(ts, (keyMap.get(ts) ?? 0) + (entry.value ?? 0));
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
    const labelMap = resolveGroupLabels(groupBy, groupKeys);
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
      "[Metronome] Failed to fetch AWU balances for credit overlay"
    );
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const balances = balancesResult.isOk()
    ? balancesResult.value.filter(
        (entry) =>
          entry.access_schedule?.credit_type?.id === awuCreditTypeId &&
          !isMetronomeExcessCredit(entry)
      )
    : [];
  const creditTotalsMap = calculateAwuCreditTotalsFromBalances(
    balances,
    timestamps
  );

  const cumulatedValues: Record<string, number> = {};
  for (const key of Object.keys(groupValues)) {
    cumulatedValues[key] = 0;
  }

  const now = Date.now();

  const points: AwuUsagePoint[] = timestamps.map((timestamp) => {
    const groups = Object.entries(groupValues)
      .filter(([key]) => !groupBy || key !== "total")
      .map(([key, tsMap]) => {
        const valueCredits = tsMap.get(timestamp) ?? 0;
        const cumulatedCredits = (cumulatedValues[key] ?? 0) + valueCredits;
        cumulatedValues[key] = cumulatedCredits;
        return {
          groupKey: key,
          valueCredits,
          cumulatedValueCredits:
            timestamp <= now ? cumulatedCredits : undefined,
        };
      });

    if (groupBy) {
      const topSumCredits = groups.reduce((acc, g) => acc + g.valueCredits, 0);
      const totalValueCredits = groupValues["total"]?.get(timestamp) ?? 0;
      const othersValueCredits = totalValueCredits - topSumCredits;
      const cumulatedOthersCredits =
        (cumulatedValues["others"] ?? 0) + othersValueCredits;
      cumulatedValues["others"] = cumulatedOthersCredits;

      groups.push({
        groupKey: "others",
        valueCredits: othersValueCredits,
        cumulatedValueCredits:
          timestamp <= now ? cumulatedOthersCredits : undefined,
      });
    }

    const credit = creditTotalsMap.get(timestamp);
    return {
      timestamp,
      groups,
      totalInitialCredits: credit?.totalInitialCredits ?? 0,
      totalConsumedCredits: credit?.totalConsumedCredits ?? 0,
      totalRemainingCredits: credit?.totalRemainingCredits ?? 0,
    };
  });

  if ((cumulatedValues["others"] ?? 0) > 0) {
    availableGroups.push({ groupKey: "others", groupLabel: "Others" });
  }

  return new Ok({ points, availableGroups });
}
