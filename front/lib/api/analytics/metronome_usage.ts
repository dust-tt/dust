import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import {
  listMetronomeBalances,
  listMetronomeUsage,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getLlmProgrammaticBillableMetricId,
  getToolProgrammaticBillableMetricId,
} from "@app/lib/metronome/constants";
import type { MetronomeBalance } from "@app/lib/metronome/types";
import { METRONOME_CENTS_TO_MICRO_USD } from "@app/lib/metronome/types";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const METRONOME_USAGE_GROUP_BY_KEYS = ["user", "model", "origin"] as const;

export type MetronomeUsageGroupByType =
  (typeof METRONOME_USAGE_GROUP_BY_KEYS)[number];

const QuerySchema = z.object({
  groupBy: z.enum(METRONOME_USAGE_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
  windowSize: z.enum(["HOUR", "DAY"]).optional().default("DAY"),
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
  user: "user_id",
  model: "model_id",
  origin: "origin",
};

const GROUP_BY_TO_METRICS: Record<MetronomeUsageGroupByType, "llm" | "both"> = {
  user: "both",
  model: "llm",
  origin: "both",
};

function getTimestampsForWindow(
  start: Date,
  end: Date,
  windowSize: "HOUR" | "DAY"
): number[] {
  const timestamps: number[] = [];
  const current = new Date(start);
  const incrementMs = windowSize === "DAY" ? 86_400_000 : 3_600_000;
  while (current < end) {
    timestamps.push(current.getTime());
    current.setTime(current.getTime() + incrementMs);
  }
  return timestamps;
}

interface ParsedBalance {
  initialAmountCents: number;
  balanceCents: number;
  intervals: { start: number; end: number }[];
}

function calculateCreditTotalsFromBalances(
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
    let initialAmountCents = 0;
    const intervals: { start: number; end: number }[] = [];

    for (const item of items) {
      initialAmountCents += item.amount;
      intervals.push({
        start: new Date(item.starting_at).getTime(),
        end: new Date(item.ending_before).getTime(),
      });
    }

    return {
      initialAmountCents,
      balanceCents: entry.balance ?? 0,
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
    let totalInitialCents = 0;
    let totalBalanceCents = 0;

    for (const b of parsed) {
      const isActive = b.intervals.some(
        (iv) => timestamp >= iv.start && timestamp < iv.end
      );
      if (isActive) {
        totalInitialCents += b.initialAmountCents;
        totalBalanceCents += b.balanceCents;
      }
    }

    const totalInitialMicroUsd =
      totalInitialCents * METRONOME_CENTS_TO_MICRO_USD;
    const totalRemainingMicroUsd =
      totalBalanceCents * METRONOME_CENTS_TO_MICRO_USD;

    result.set(timestamp, {
      totalInitialCreditsMicroUsd: totalInitialMicroUsd,
      totalConsumedCreditsMicroUsd:
        totalInitialMicroUsd - totalRemainingMicroUsd,
      totalRemainingCreditsMicroUsd: totalRemainingMicroUsd,
    });
  }

  return result;
}

export async function handleMetronomeUsageRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeUsageResponse>>,
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

      const workspace = auth.getNonNullableWorkspace();
      const { metronomeCustomerId } = workspace;
      if (!metronomeCustomerId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace is not configured for Metronome billing.",
          },
        });
      }

      const llmMetricId = getLlmProgrammaticBillableMetricId();
      const toolMetricId = getToolProgrammaticBillableMetricId();

      const {
        groupBy,
        groupByCount,
        selectedPeriod,
        billingCycleStartDay,
        windowSize,
      } = q.data;

      const referenceDate = selectedPeriod
        ? new Date(selectedPeriod)
        : new Date();
      if (selectedPeriod) {
        referenceDate.setUTCDate(billingCycleStartDay);
      }
      const { cycleStart: periodStart, cycleEnd: periodEnd } =
        getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

      const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
      const cappedPeriodEnd = new Date(
        Math.min(periodEnd.getTime(), Date.now() + TEN_DAYS_MS)
      );

      const startingOn = periodStart.toISOString();
      const endingBefore = cappedPeriodEnd.toISOString();

      const timestamps = getTimestampsForWindow(
        periodStart,
        cappedPeriodEnd,
        windowSize
      );

      const balancesPromise = listMetronomeBalances(metronomeCustomerId);

      const groupValues: Record<string, Map<number, number>> = {};
      const availableGroups: MetronomeUsageAvailableGroup[] = [];

      if (!groupBy) {
        const result = await listMetronomeUsage({
          customerIds: [metronomeCustomerId],
          billableMetricIds: [llmMetricId, toolMetricId],
          startingOn,
          endingBefore,
          windowSize,
        });

        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to retrieve Metronome usage: ${result.error.message}`,
            },
          });
        }

        const totalMap = new Map<number, number>();
        for (const entry of result.value) {
          const ts = new Date(entry.startTimestamp).getTime();
          totalMap.set(ts, (totalMap.get(ts) ?? 0) + (entry.value ?? 0));
        }
        groupValues["total"] = totalMap;

        availableGroups.push({
          groupKey: "total",
          groupLabel: "Total usage",
        });
      } else {
        const metricTarget = GROUP_BY_TO_METRICS[groupBy];
        const eventProperty = GROUP_BY_TO_EVENT_PROPERTY[groupBy];

        const groupedQueryBase = {
          customerId: metronomeCustomerId,
          startingOn,
          endingBefore,
          windowSize,
          groupKey: [eventProperty],
        };

        const llmGroupedPromise =
          metricTarget === "llm" || metricTarget === "both"
            ? listMetronomeUsageWithGroups({
                ...groupedQueryBase,
                billableMetricId: llmMetricId,
              })
            : null;

        const toolGroupedPromise =
          metricTarget === "both"
            ? listMetronomeUsageWithGroups({
                ...groupedQueryBase,
                billableMetricId: toolMetricId,
              })
            : null;

        const [llmGroupedResult, toolGroupedResult] = await Promise.all([
          llmGroupedPromise,
          toolGroupedPromise,
        ]);

        const mergedGroupMap = new Map<string, Map<number, number>>();
        const groupedResults = [llmGroupedResult, toolGroupedResult];

        for (const groupedResult of groupedResults) {
          if (!groupedResult) {
            continue;
          }
          if (groupedResult.isErr()) {
            const msg = groupedResult.error.message;
            const isGroupKeyError =
              msg.includes("group") || msg.includes("not found");
            return apiError(req, res, {
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
      const balances = balancesResult.isOk() ? balancesResult.value : [];
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
          const cumulatedOthers =
            (cumulatedValues["others"] ?? 0) + othersValue;
          cumulatedValues["others"] = cumulatedOthers;

          groups.push({
            groupKey: "others",
            valueMicroUsd: othersValue,
            cumulatedValueMicroUsd:
              timestamp <= now ? cumulatedOthers : undefined,
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

      if ((cumulatedValues["others"] ?? 0) > 0) {
        availableGroups.push({
          groupKey: "others",
          groupLabel: "Others",
        });
      }

      return res.status(200).json({ points, availableGroups });
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

async function resolveGroupLabels(
  groupBy: MetronomeUsageGroupByType,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labelMap = new Map<string, string>();

  switch (groupBy) {
    case "user": {
      const users = await UserResource.fetchByIds(groupKeys);
      const userMap = new Map(users.map((u) => [u.sId, u.fullName()]));
      for (const key of groupKeys) {
        labelMap.set(key, userMap.get(key) ?? key);
      }
      break;
    }
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
