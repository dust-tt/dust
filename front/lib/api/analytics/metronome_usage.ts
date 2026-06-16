import type { WindowSize } from "@app/lib/api/analytics/time_utils";
import {
  DAY_MS,
  FOUR_HOURS_MS,
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
  getCreditTypeProgrammaticUsdId,
  getMetricLlmProviderCostProgrammaticId,
} from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import {
  isMetronomeExcessCredit,
  METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD,
} from "@app/lib/metronome/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";
import { MARKUP_MULTIPLIER } from "../programmatic_usage/common";

const METRONOME_USAGE_GROUP_BY_KEYS = ["api_key", "model", "origin"] as const;

export type MetronomeUsageGroupByType =
  (typeof METRONOME_USAGE_GROUP_BY_KEYS)[number];

export const MetronomeUsageQuerySchema = z.object({
  groupBy: z.enum(METRONOME_USAGE_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
  windowSize: z.enum(["HOUR", "FOUR_HOURS", "DAY"]).optional().default("DAY"),
});

export type MetronomeUsageQuery = z.infer<typeof MetronomeUsageQuerySchema>;

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

export type MetronomeUsageError =
  | { type: "metronome_not_configured" }
  | {
      type: "invalid_group_key";
      groupBy: MetronomeUsageGroupByType;
      eventProperty: string;
    }
  | { type: "internal_error"; message: string };

const GROUP_BY_TO_EVENT_PROPERTY: Record<MetronomeUsageGroupByType, string> = {
  api_key: "api_key_name",
  model: "model_id",
  origin: "origin",
};

type MetronomeWindowSize = "HOUR" | "DAY";

export function getMetronomeWindowSize(
  windowSize: WindowSize
): MetronomeWindowSize {
  switch (windowSize) {
    case "FOUR_HOURS":
    case "HOUR":
      return "HOUR";
    case "DAY":
      return "DAY";
    default:
      assertNever(windowSize);
  }
}

// Re-bucket a timestamp→value map by flooring each timestamp to a `windowMs`
// boundary. Works for HOUR/FOUR_HOURS/DAY because the unix epoch is itself
// midnight-aligned and those windows divide the day evenly.
export function aggregateToWindowBuckets(
  map: Map<number, number>,
  windowMs: number
): Map<number, number> {
  const aggregated = new Map<number, number>();
  for (const [ts, value] of map) {
    const bucket = ts - (ts % windowMs);
    aggregated.set(bucket, (aggregated.get(bucket) ?? 0) + value);
  }
  return aggregated;
}

export function aggregateToFourHourBuckets(
  hourlyMap: Map<number, number>
): Map<number, number> {
  return aggregateToWindowBuckets(hourlyMap, FOUR_HOURS_MS);
}

interface ParsedBalance {
  initialAmountCredits: number;
  balanceCredits: number;
  intervals: { start: number; end: number }[];
}

export function calculateCreditTotalsFromBalances(
  balances: MetronomeBalance[],
  timestamps: number[]
): Map<
  number,
  {
    totalInitialCreditsMicroUsd: number;
    totalConsumedCreditsMicroUsd: number;
    totalRemainingCreditsMicroUsd: number;
  }
> {
  // Pre-compute per-balance data to avoid redundant date parsing and amount
  // summation inside the timestamp loop.
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
      totalInitialCreditsMicroUsd: number;
      totalConsumedCreditsMicroUsd: number;
      totalRemainingCreditsMicroUsd: number;
    }
  >();

  for (const timestamp of timestamps) {
    let totalInitialCredits = 0;
    let totalBalanceCredits = 0;

    for (const b of parsed) {
      const isActive = b.intervals.some(
        (iv) => timestamp >= iv.start && timestamp < iv.end
      );
      if (isActive) {
        totalInitialCredits += b.initialAmountCredits;
        totalBalanceCredits += b.balanceCredits;
      }
    }

    const totalInitialMicroUsd =
      totalInitialCredits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
    const totalRemainingMicroUsd =
      totalBalanceCredits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;

    result.set(timestamp, {
      totalInitialCreditsMicroUsd: totalInitialMicroUsd,
      totalConsumedCreditsMicroUsd:
        totalInitialMicroUsd - totalRemainingMicroUsd,
      totalRemainingCreditsMicroUsd: totalRemainingMicroUsd,
    });
  }

  return result;
}

export async function getMetronomeUsage(
  auth: Authenticator,
  query: MetronomeUsageQuery
): Promise<Result<GetMetronomeUsageResponse, MetronomeUsageError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err({ type: "metronome_not_configured" });
  }

  const llmMetricId = getMetricLlmProviderCostProgrammaticId();

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
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve Metronome usage: ${result.error.message}`,
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
      if (isGroupKeyError) {
        return new Err({
          type: "invalid_group_key",
          groupBy,
          eventProperty,
        });
      }
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve Metronome grouped usage: ${msg}`,
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
        const valueMicroUsd = tsMap.get(timestamp) ?? 0;
        const cumulatedMicroUsd = (cumulatedValues[key] ?? 0) + valueMicroUsd;
        cumulatedValues[key] = cumulatedMicroUsd;
        return {
          groupKey: key,
          valueMicroUsd,
          cumulatedValueMicroUsd:
            timestamp <= now ? cumulatedMicroUsd : undefined,
        };
      });

    if (groupBy) {
      const topSumMicroUsd = groups.reduce(
        (acc, g) => acc + g.valueMicroUsd,
        0
      );
      const totalValueMicroUsd = groupValues["total"]?.get(timestamp) ?? 0;
      const othersValueMicroUsd = totalValueMicroUsd - topSumMicroUsd;
      const cumulatedOthersMicroUsd =
        (cumulatedValues["others"] ?? 0) + othersValueMicroUsd;
      cumulatedValues["others"] = cumulatedOthersMicroUsd;

      groups.push({
        groupKey: "others",
        valueMicroUsd: othersValueMicroUsd,
        cumulatedValueMicroUsd:
          timestamp <= now ? cumulatedOthersMicroUsd : undefined,
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

  return new Ok({ points, availableGroups });
}

export async function resolveGroupLabels(
  groupBy: MetronomeUsageGroupByType,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labelMap = new Map<string, string>();

  switch (groupBy) {
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
