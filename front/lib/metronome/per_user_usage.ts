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
  isToolCostCategory,
  TOOL_COST_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import type { MetronomeUsageWithGroupsResponse } from "@app/lib/metronome/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type UsageWindowSize = "HOUR" | "DAY" | "NONE";

interface UsageQuerySegment {
  startingOn: string;
  endingBefore: string;
  windowSize: UsageWindowSize;
}

/**
 * Partition `[cycleStart, requestEnd)` into the fewest midnight-aligned
 * segments the usage endpoint can query directly: a single segment covering
 * the interior days (the bulk of a typical month-long billing period),
 * queried with `windowSize: "NONE"` so it comes back as one aggregate bucket
 * per group instead of one per day.
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
    windowSize: "NONE",
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

/**
 * The whole `[cycleStart, requestEnd)` range as a single midnight-aligned
 * HOUR-granularity segment. Coarser day segments hide when within a day usage
 * stopped being reported, so exports that hunt for gaps query hours throughout
 * — at the cost of ~24x more buckets than `buildUsageQuerySegments`.
 */
export function buildHourlyUsageQuerySegment({
  cycleStart,
  requestEnd,
}: {
  cycleStart: Date;
  requestEnd: Date;
}): UsageQuerySegment[] {
  if (requestEnd.getTime() <= cycleStart.getTime()) {
    return [];
  }
  return [
    {
      startingOn: floorToMidnightUTC(cycleStart).toISOString(),
      endingBefore: ceilToMidnightUTC(requestEnd).toISOString(),
      windowSize: "HOUR",
    },
  ];
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
  const rowsResult = await fetchPerUserAwuUsageRows({
    workspaceId,
    metronomeCustomerId,
    userIds,
  });
  if (rowsResult.isErr()) {
    return rowsResult;
  }

  const perUser = new Map<string, number>();
  for (const row of rowsResult.value) {
    perUser.set(row.userId, (perUser.get(row.userId) ?? 0) + row.awuCredits);
  }
  return new Ok(perUser);
}

// One Metronome usage bucket contributing to a user's AWU consumption: a
// (metric, time window, usage type, tool category) group and the AWU credits it
// accounts for. Buckets that don't count towards billed AWU (free usage, or
// windows outside the billing cycle) are never emitted, so summing `awuCredits`
// reproduces `fetchPerUserAwuUsage` exactly.
export type PerUserAwuUsageRow = {
  userId: string;
  metric: "llm_provider_cost_awu" | "tool_invocations";
  usageType: string;
  toolCategory: string | null;
  startingOn: string;
  endingBefore: string;
  // The raw metric value: AWU spend for the AI-usage metric, an invocation
  // count for the tool metric.
  value: number;
  // Price applied to `value` to get `awuCredits` (1 for AI usage, the
  // per-category weight for tools).
  awuWeight: number;
  awuCredits: number;
};

/**
 * The individual Metronome usage buckets behind `fetchPerUserAwuUsage`, kept as
 * rows instead of a per-user total. Same query, same filtering — see that
 * function's doc for the query shape and why free/out-of-cycle buckets are
 * dropped in code.
 *
 * `hourly` forces HOUR windows over the whole period instead of the cheaper
 * day-granularity segmentation, so gaps can be located within a day. It is the
 * finest breakdown available per user: `agent_id`, `model_id`, `origin` and
 * `api_key_name` are only declared as standalone group keys on the billable
 * metrics (see `setup_new_pricing.ts`), never compounded with `user_id`, and
 * Metronome rejects partial compound keys — so they cannot be scoped to one
 * user.
 */
export async function fetchPerUserAwuUsageRows({
  workspaceId,
  metronomeCustomerId,
  userIds,
  hourly = false,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  userIds: string[];
  hourly?: boolean;
}): Promise<Result<PerUserAwuUsageRow[], Error>> {
  if (userIds.length === 0) {
    return new Ok([]);
  }
  const periodResult =
    await getCachedMetronomeCurrentBillingPeriod(workspaceId);
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  if (!periodResult.value) {
    return new Ok([]);
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  const cycleEndMs = cycleEnd.getTime();
  const cycleStartMs = cycleStart.getTime();

  // The usage endpoint requires midnight-aligned bounds; buckets outside
  // [cycleStart, cycleEnd) are trimmed below regardless of segment.
  const requestEnd = new Date(Math.min(cycleEndMs, Date.now()));
  const segments = hourly
    ? buildHourlyUsageQuerySegment({ cycleStart, requestEnd })
    : buildUsageQuerySegments({ cycleStart, requestEnd });
  if (segments.length === 0) {
    return new Ok([]);
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

  const isBilledBucket = (entry: MetronomeUsageWithGroupsResponse): boolean => {
    const startMs = new Date(entry.startingOn).getTime();
    return (
      entry.group?.[USAGE_TYPE_GROUP_KEY] !== USAGE_TYPE_FREE &&
      startMs >= cycleStartMs &&
      startMs < cycleEndMs
    );
  };

  const rows: PerUserAwuUsageRow[] = [];

  // AI usage: the value is already AWU spend (cost_awu, priced 1:1).
  for (const entry of aiResult.value) {
    const userId = entry.group?.["user_id"];
    if (!userId || entry.value === null || !isBilledBucket(entry)) {
      continue;
    }
    rows.push({
      userId,
      metric: "llm_provider_cost_awu",
      usageType: entry.group?.[USAGE_TYPE_GROUP_KEY] ?? "",
      toolCategory: null,
      startingOn: entry.startingOn,
      endingBefore: entry.endingBefore,
      value: entry.value,
      awuWeight: 1,
      awuCredits: entry.value,
    });
  }

  // Tool usage: the value is an invocation count — weight it by the
  // per-category AWU price to convert it into AWU spend.
  for (const entry of toolResult.value) {
    const userId = entry.group?.["user_id"];
    const category = entry.group?.["tool_category"];
    if (
      !userId ||
      entry.value === null ||
      !isBilledBucket(entry) ||
      !category ||
      !isToolCostCategory(category)
    ) {
      continue;
    }
    const awuWeight = TOOL_COST_CATEGORY_AWU_WEIGHTS[category];
    rows.push({
      userId,
      metric: "tool_invocations",
      usageType: entry.group?.[USAGE_TYPE_GROUP_KEY] ?? "",
      toolCategory: category,
      startingOn: entry.startingOn,
      endingBefore: entry.endingBefore,
      value: entry.value,
      awuWeight,
      awuCredits: entry.value * awuWeight,
    });
  }

  return new Ok(rows);
}

const PER_USER_AWU_USAGE_CACHE_TTL_MS = 10 * 60 * 1000;

function perUserAwuUsageCacheKey(
  metronomeCustomerId: string,
  metronomeContractId: string,
  userId: string
): string {
  return `per-user-awu-usage:${metronomeCustomerId}:${metronomeContractId}:${userId}`;
}

// In-process single-flight registry, keyed by the same string as the Redis cache key.
// Concurrent overlapping callers await one fetch instead of each firing their own Metronome batch.
const inFlightPerUserAwuUsage = new Map<string, Promise<number>>();

/**
 * Per-user-cached AWU consumption for the current billing period. Each user is
 * cached under its own key (10min TTL); the users not in cache are fetched in ONE
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

      if (misses.length === 0) {
        return result;
      }

      // Split misses into users someone else in this process is already
      // fetching (await their promise) vs. users nobody is fetching yet
      // (this call owns them and starts the batch).
      const waiters: Array<{ userId: string; promise: Promise<number> }> = [];
      const newMisses: string[] = [];
      for (const userId of misses) {
        const key = perUserAwuUsageCacheKey(
          metronomeCustomerId,
          metronomeContractId,
          userId
        );
        const existing = inFlightPerUserAwuUsage.get(key);
        if (existing) {
          waiters.push({ userId, promise: existing });
        } else {
          newMisses.push(userId);
        }
      }

      if (newMisses.length > 0) {
        const batchPromise = fetchPerUserAwuUsage({
          workspaceId,
          metronomeCustomerId,
          userIds: newMisses,
        }).then((fetched) => {
          if (fetched.isErr()) {
            throw fetched.error;
          }
          return fetched.value;
        });

        // Register a per-user promise for each newly-owned miss before
        // awaiting anything, so a caller arriving during the fetch finds it.
        for (const userId of newMisses) {
          const key = perUserAwuUsageCacheKey(
            metronomeCustomerId,
            metronomeContractId,
            userId
          );
          const userPromise = batchPromise.then(
            (usageByUserId) => usageByUserId.get(userId) ?? 0
          );
          inFlightPerUserAwuUsage.set(key, userPromise);
          // Stop advertising this fetch as in-flight once it settles, so a
          // later miss (after the Redis TTL expires) starts a fresh one
          // instead of reusing a stale reference.
          void userPromise
            .catch(() => {
              // Swallow here — the rejection still propagates to every
              // waiter through their own awaited `promise` below.
            })
            .finally(() => {
              if (inFlightPerUserAwuUsage.get(key) === userPromise) {
                inFlightPerUserAwuUsage.delete(key);
              }
            });
          waiters.push({ userId, promise: userPromise });
        }
      }

      await concurrentExecutor(
        waiters,
        async ({ userId, promise }) => {
          // Cache 0 too: a user with no usage this period would otherwise
          // miss on every request.
          const value = await promise;
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

      return result;
    }
  );
}
