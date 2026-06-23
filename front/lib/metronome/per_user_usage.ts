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
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type UsageWindowSize = "HOUR" | "DAY";

interface UsageQuerySegment {
  startingOn: string;
  endingBefore: string;
  windowSize: UsageWindowSize;
}

/**
 * Partition `[cycleStart, requestEnd)` into the fewest midnight-aligned
 * segments the usage endpoint can query directly: a single DAY-granularity
 * segment for the interior days (the bulk of a typical month-long billing
 * period), plus HOUR-granularity segments only for the partial first/last day
 * when a boundary isn't already UTC midnight.
 *
 * Segments are contiguous and non-overlapping by construction, so summing
 * their results is safe.
 */
export function buildUsageQuerySegments({
  cycleStart,
  requestEnd,
}: {
  cycleStart: Date;
  requestEnd: Date;
}): UsageQuerySegment[] {
  if (requestEnd.getTime() <= cycleStart.getTime()) {
    return [];
  }

  const dayStart = ceilToMidnightUTC(cycleStart);
  const dayEnd = floorToMidnightUTC(requestEnd);

  // No full day fits between the boundaries (period shorter than a day, or
  // confined to a single partial day): one HOUR segment for the whole range.
  if (dayEnd.getTime() <= dayStart.getTime()) {
    return [
      {
        startingOn: floorToMidnightUTC(cycleStart).toISOString(),
        endingBefore: ceilToMidnightUTC(requestEnd).toISOString(),
        windowSize: "HOUR",
      },
    ];
  }

  const segments: UsageQuerySegment[] = [];
  if (dayStart.getTime() > cycleStart.getTime()) {
    segments.push({
      startingOn: floorToMidnightUTC(cycleStart).toISOString(),
      endingBefore: dayStart.toISOString(),
      windowSize: "HOUR",
    });
  }
  segments.push({
    startingOn: dayStart.toISOString(),
    endingBefore: dayEnd.toISOString(),
    windowSize: "DAY",
  });
  if (requestEnd.getTime() > dayEnd.getTime()) {
    segments.push({
      startingOn: dayEnd.toISOString(),
      endingBefore: ceilToMidnightUTC(requestEnd).toISOString(),
      windowSize: "HOUR",
    });
  }
  return segments;
}

function flattenUsageResults<T>(
  results: Array<Result<T[], Error>>
): Result<T[], Error> {
  const merged: T[] = [];
  for (const result of results) {
    if (result.isErr()) {
      return result;
    }
    merged.push(...result.value);
  }
  return new Ok(merged);
}

function fetchSegmentedUsage({
  segments,
  metronomeCustomerId,
  billableMetricId,
  groupKey,
  userIds,
}: {
  segments: UsageQuerySegment[];
  metronomeCustomerId: string;
  billableMetricId: string;
  groupKey: string[];
  userIds: string[];
}) {
  return concurrentExecutor(
    segments,
    (segment) =>
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId,
        startingOn: segment.startingOn,
        endingBefore: segment.endingBefore,
        windowSize: segment.windowSize,
        groupKey,
        groupFilters: { user_id: userIds },
      }),
    { concurrency: 3 }
  ).then(flattenUsageResults);
}

/**
 * Per-user AWU consumption for the current billing period.
 *
 * Usage is now folded on the invoice (no per-user line item), so we read it
 * straight from the grouped usage API instead of walking draft invoices.
 *
 * Billing periods are anchored to the contract start date (e.g. June 15 15:00),
 * so bounds are non-midnight. The usage endpoint requires midnight-aligned
 * `starting_on`/`ending_before`, so the query is split into per-day-granularity
 * and per-hour-granularity segments by `buildUsageQuerySegments` (see there).
 * Pre-period and post-period buckets are filtered out in code so only usage
 * within `[cycleStart, cycleEnd)` is counted.
 *
 * `current_period: true` is rejected ("must have an active plan") — that flag
 * keys off Metronome's legacy v1 Plan entity, and we provision customers
 * exclusively via Contracts, so no Plan exists. We always pass explicit
 * `starting_on`/`ending_before`.
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
 *
 */
export async function fetchPerUserAwuUsage({
  workspaceId,
  metronomeCustomerId,
  userIds,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  // Users to scope the usage query to (the `user_id` group filter). Required:
  // an unfiltered query is capped and omits users. Empty → empty result.
  userIds: string[];
}): Promise<Result<Map<string, number>, Error>> {
  if (userIds.length === 0) {
    return new Ok(new Map());
  }
  const periodResult =
    await getCachedMetronomeCurrentBillingPeriod(workspaceId);
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  if (!periodResult.value) {
    return new Ok(new Map());
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  const cycleEndMs = cycleEnd.getTime();
  const cycleStartMs = cycleStart.getTime();

  // The usage endpoint requires midnight-aligned bounds; buckets outside
  // [cycleStart, cycleEnd) are trimmed below regardless of segment.
  const requestEnd = new Date(Math.min(cycleEndMs, Date.now()));
  const segments = buildUsageQuerySegments({ cycleStart, requestEnd });
  if (segments.length === 0) {
    return new Ok(new Map());
  }

  const [aiResult, toolResult] = await Promise.all([
    fetchSegmentedUsage({
      segments,
      metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      userIds,
    }),
    fetchSegmentedUsage({
      segments,
      metronomeCustomerId,
      billableMetricId: getMetricToolInvocationsId(),
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      userIds,
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
      new Date(entry.startingOn).getTime() < cycleStartMs ||
      new Date(entry.startingOn).getTime() >= cycleEndMs
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
      new Date(entry.startingOn).getTime() >= cycleEndMs ||
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
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  workspaceId: string;
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
          workspaceId,
          metronomeCustomerId,
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
