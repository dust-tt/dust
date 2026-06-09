import { runOnRedisCache } from "@app/lib/api/redis";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
} from "@app/lib/metronome/constants";
import { getMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Per-user AWU consumption for the current billing period.
 *
 * Usage is now folded on the invoice (no per-user line item), so we read it
 * straight from the grouped usage API instead of walking draft invoices.
 *
 * Billing periods always start on the 1st of the month at UTC midnight, so
 * `cycleStart`/`cycleEnd` already satisfy the usage endpoint's two constraints:
 *   - `current_period: true` is rejected ("must have an active plan") — that
 *     flag keys off Metronome's legacy v1 Plan entity, and we provision
 *     customers exclusively via Contracts, so no Plan exists. We pass explicit
 *     `starting_on`/`ending_before` instead.
 *   - explicit `starting_on`/`ending_before` must be UTC midnight — which the
 *     period bounds already are.
 * So we query `[cycleStart, cycleEnd)` directly with `window_size: "DAY"`; every
 * returned bucket falls inside the period, no trimming needed. The request end
 * is capped at the next midnight after `now` so we don't fetch the period's
 * future days.
 *
 * AWU spend has two sources, both priced in the AWU credit type:
 *   - AI Usage: the `cost_awu` metric, priced 1 AWU per unit, so the metric
 *     value is already AWU spend.
 *   - Tool Usage: an invocation count, priced per category (basic ×1,
 *     advanced ×3), so the count is weighted by the category price.
 *
 * Scoped to `userIds` via a `user_id` `group_filters`. We deliberately do NOT
 * filter on `usage_type`: filtering the query on `usage_type` makes Metronome
 * under-aggregate some `user`-tagged buckets (its per-usage_type and per-user_id
 * rollups disagree), silently undercounting real spend. A query with no filter
 * at all is capped server-side (~hundreds of groups) and silently omits users,
 * so we must scope by `user_id`. Free usage is excluded by dropping
 * `usage_type === "free"` buckets in code (we still group by `usage_type` so
 * each bucket carries it).
 */
export async function fetchPerUserAwuUsage({
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  // Users to scope the usage query to (the `user_id` group filter). Required:
  // an unfiltered query is capped and omits users. Empty → empty result.
  userIds: string[];
}): Promise<Result<Map<string, number>, Error>> {
  if (userIds.length === 0) {
    return new Ok(new Map());
  }
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
  const cycleEndMs = cycleEnd.getTime();
  const cycleStartMs = cycleStart.getTime();

  // The usage endpoint requires midnight-aligned bounds, so we always query from
  // the floored start. When the period start is not itself midnight (e.g. a
  // contract that started mid-day), the floored start pulls in usage from before
  // the period began. Query at HOUR granularity in that case and drop the
  // pre-start buckets below, so we count exactly the period — matching the
  // Metronome spend alert and the seat grant. Steady-state periods start at
  // midnight, so this stays on DAY.
  const startingOn = floorToMidnightUTC(cycleStart).toISOString();
  const requestEnd = new Date(Math.min(cycleEndMs, Date.now()));
  const endingBefore = ceilToMidnightUTC(requestEnd).toISOString();
  const windowSize =
    cycleStartMs === floorToMidnightUTC(cycleStart).getTime() ? "DAY" : "HOUR";

  const [aiResult, toolResult] = await Promise.all([
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize,
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      groupFilters: { user_id: userIds },
    }),
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricToolInvocationsId(),
      startingOn,
      endingBefore,
      windowSize,
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      groupFilters: { user_id: userIds },
    }),
  ]);
  if (aiResult.isErr()) {
    return new Err(aiResult.error);
  }
  if (toolResult.isErr()) {
    return new Err(toolResult.error);
  }

  const perUser = new Map<string, number>();

  // AI usage: the value is already AWU spend (cost_awu, priced 1:1).
  for (const entry of aiResult.value) {
    const userId = entry.group?.["user_id"];
    if (
      !userId ||
      entry.value === null ||
      entry.group?.[USAGE_TYPE_GROUP_KEY] === USAGE_TYPE_FREE ||
      new Date(entry.startingOn).getTime() < cycleStartMs
    ) {
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
      entry.group?.[USAGE_TYPE_GROUP_KEY] === USAGE_TYPE_FREE ||
      new Date(entry.startingOn).getTime() < cycleStartMs ||
      !category ||
      !isToolCategory(category)
    ) {
      continue;
    }
    const awuSpent = entry.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
    perUser.set(userId, (perUser.get(userId) ?? 0) + awuSpent);
  }

  return new Ok(perUser);
}

const PER_USER_AWU_USAGE_CACHE_TTL_MS = 60 * 1000;

function perUserAwuUsageCacheKey(
  metronomeCustomerId: string,
  metronomeContractId: string,
  userId: string
): string {
  return `per-user-awu-usage:${metronomeCustomerId}:${metronomeContractId}:${userId}`;
}

/**
 * Per-user-cached AWU consumption for the current billing period. Each user is
 * cached under its own key (60s TTL); the users not in cache are fetched in ONE
 * batched Metronome query and written back — including 0 for users with no
 * usage, so they don't perpetually miss. Caching per user (rather than per
 * requested set) lets the members table, single-user cap checks and reconcile
 * reuse each other's entries. Throws if the batched fetch fails.
 */
export async function getPerUserAwuUsage({
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  userIds: string[];
}): Promise<Map<string, number>> {
  if (userIds.length === 0) {
    return new Map();
  }
  return runOnRedisCache(
    { origin: "metronome_credit_cache" },
    async (redis) => {
      const result = new Map<string, number>();
      const cached = await redis.mGet(
        userIds.map((userId) =>
          perUserAwuUsageCacheKey(
            metronomeCustomerId,
            metronomeContractId,
            userId
          )
        )
      );
      const misses: string[] = [];
      userIds.forEach((userId, i) => {
        const raw = cached[i];
        if (raw !== null) {
          result.set(userId, JSON.parse(raw) as number);
        } else {
          misses.push(userId);
        }
      });

      if (misses.length > 0) {
        const fetched = await fetchPerUserAwuUsage({
          metronomeCustomerId,
          metronomeContractId,
          userIds: misses,
        });
        if (fetched.isErr()) {
          throw fetched.error;
        }
        await concurrentExecutor(
          misses,
          async (userId) => {
            // Cache 0 too: a user with no usage this period would otherwise
            // miss on every request.
            const value = fetched.value.get(userId) ?? 0;
            result.set(userId, value);
            await redis.set(
              perUserAwuUsageCacheKey(
                metronomeCustomerId,
                metronomeContractId,
                userId
              ),
              JSON.stringify(value),
              { PX: PER_USER_AWU_USAGE_CACHE_TTL_MS }
            );
          },
          { concurrency: 16 }
        );
      }

      return result;
    }
  );
}
