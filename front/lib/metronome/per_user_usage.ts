import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import { getMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// usage_type slices that incur AWU spend. The "free" slice is priced at 0 AWU
// on every rate card, so it's excluded to mirror the per-user
// `spend_threshold_reached` alert (AWU credit type) that backs per-user caps.
const PAID_USAGE_TYPES = [USAGE_TYPE_USER, USAGE_TYPE_PROGRAMMATIC];

/**
 * Per-user AWU consumption for the current billing period.
 *
 * Usage is now folded on the invoice (no per-user line item), so we read it
 * straight from the grouped usage API instead of walking draft invoices.
 *
 * The billing period is hour-precise (contracts are anchored on hour
 * boundaries, e.g. a period running 14:00→14:00), but the usage endpoint has
 * two constraints we can't both satisfy directly:
 *   - `current_period: true` is rejected ("must have an active plan") — that
 *     flag keys off Metronome's legacy v1 Plan entity, and we provision
 *     customers exclusively via Contracts, so no Plan exists.
 *   - explicit `starting_on`/`ending_before` must be UTC midnight.
 * So we query midnight-aligned bounds that *enclose* the period with
 * `window_size: "HOUR"`, then keep only the hourly buckets that fall inside
 * the exact `[cycleStart, cycleEnd)` window — hour-precise, matching the
 * period the per-user spend cap alert evaluates. The request end is capped at
 * the next midnight after `now` so we don't fetch the period's future days.
 *
 * AWU spend has two sources, both priced in the AWU credit type:
 *   - AI Usage: the `cost_awu` metric, priced 1 AWU per unit, so the metric
 *     value is already AWU spend.
 *   - Tool Usage: an invocation count, priced per category (basic ×1,
 *     advanced ×3), so the count is weighted by the category price.
 * Free usage is excluded server-side via `group_filters`.
 */
export async function fetchPerUserAwuUsage({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<Map<string, number>, Error>> {
  const periodResult = await getMetronomeCurrentBillingPeriod({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  if (!periodResult.value) {
    return new Ok(new Map());
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  const cycleStartMs = cycleStart.getTime();
  const cycleEndMs = cycleEnd.getTime();

  // Midnight-aligned request bounds enclosing the period (API requirement).
  // The hourly buckets outside [cycleStart, cycleEnd) are trimmed below.
  const startingOn = floorToMidnightUTC(cycleStart).toISOString();
  const requestEnd = new Date(Math.min(cycleEndMs, Date.now()));
  const endingBefore = ceilToMidnightUTC(requestEnd).toISOString();

  const [aiResult, toolResult] = await Promise.all([
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize: "HOUR",
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      groupFilters: { [USAGE_TYPE_GROUP_KEY]: PAID_USAGE_TYPES },
    }),
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricToolInvocationsId(),
      startingOn,
      endingBefore,
      windowSize: "HOUR",
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      groupFilters: { [USAGE_TYPE_GROUP_KEY]: PAID_USAGE_TYPES },
    }),
  ]);
  if (aiResult.isErr()) {
    return new Err(aiResult.error);
  }
  if (toolResult.isErr()) {
    return new Err(toolResult.error);
  }

  // Keep only hourly buckets that fall within the exact billing period.
  const isInPeriod = (startingOnIso: string): boolean => {
    const ts = new Date(startingOnIso).getTime();
    return ts >= cycleStartMs && ts < cycleEndMs;
  };

  const perUser = new Map<string, number>();

  // AI usage: the value is already AWU spend (cost_awu, priced 1:1).
  for (const entry of aiResult.value) {
    const userId = entry.group?.["user_id"];
    if (!userId || entry.value === null || !isInPeriod(entry.startingOn)) {
      continue;
    }
    perUser.set(userId, (perUser.get(userId) ?? 0) + entry.value);
  }

  // Tool usage: the value is an invocation count — weight it by the
  // per-category AWU price to convert it into AWU spend.
  for (const entry of toolResult.value) {
    const userId = entry.group?.["user_id"];
    const category = entry.group?.["tool_category"];
    if (
      !userId ||
      entry.value === null ||
      !category ||
      !isToolCategory(category) ||
      !isInPeriod(entry.startingOn)
    ) {
      continue;
    }
    const awuSpent = entry.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
    perUser.set(userId, (perUser.get(userId) ?? 0) + awuSpent);
  }

  return new Ok(perUser);
}

const MEMBERS_USAGE_PER_USER_CACHE_TTL_MS = 60 * 1000;

async function fetchPerUserAwuUsageRecord(args: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Record<string, number>> {
  const result = await fetchPerUserAwuUsage(args);
  if (result.isErr()) {
    throw result.error;
  }
  return Object.fromEntries(result.value);
}

export const getCachedPerUserAwuUsage = cacheWithRedis(
  fetchPerUserAwuUsageRecord,
  ({ metronomeCustomerId, metronomeContractId }) =>
    `${metronomeCustomerId}-${metronomeContractId}`,
  { ttlMs: MEMBERS_USAGE_PER_USER_CACHE_TTL_MS }
);
