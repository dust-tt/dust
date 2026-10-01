import {
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import {
  getRedisCacheClient,
  REDIS_CACHE_CONCURRENCY,
} from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import { GroupResource } from "@app/lib/resources/group_resource";
import { RESOURCES_PREFIX } from "@app/lib/resources/string_ids";
import type { SearchUsageDimension } from "@app/lib/search_usage/usage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, isString } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Discovery "For You" reads consumption analytics through group pools shared
 * between viewers. A bounded shortlist query selects candidate IDs per
 * eligible group, then keyed filters recompute their distinct-user counts and
 * the group's active-user count across all shards. Nothing in these queries is
 * viewer-specific, so each recomputed group pool is cached on its own key and
 * reused by every member. One workspace lock serializes refreshes when any
 * requested pool is missing.
 */
const FOR_YOU_ADOPTION_WINDOW_DAYS = 30;
const FOR_YOU_SHORTLIST_PER_GROUP_AND_TYPE = 25;
// Safety ceiling only; normal viewers use all their eligible groups.
const FOR_YOU_MAX_ELIGIBLE_GROUPS = 50;
const FOR_YOU_CARDINALITY_PRECISION_THRESHOLD = 1_000;
const GROUP_POOL_CACHE_TTL_MS = 60 * 60 * 1000;
const GROUP_POOL_REFRESH_LOCK_TTL_MS = 30 * 1000;
const DISCOVERY_FOR_YOU_ALGORITHM_VERSION = "v2";
// A group 25x smaller weighs about 10x more at equal adoption: 25^0.7 ≈ 10.
const GROUP_SIZE_PENALTY_EXPONENT = 0.7;

const ACTIVE_USERS_AGG = "active_users";
const USERS_AGG = "users";

type CardinalityAggregationResult = {
  value?: number | null;
};

type ShortlistBucket = {
  key?: string;
};

type ShortlistResourceAggregation = {
  buckets?: Array<ShortlistBucket | null>;
};

type GroupShortlistBucket = {
  agents?: ShortlistResourceAggregation;
  skills?: ShortlistResourceAggregation;
};

type GroupShortlistAggregations = {
  group_shortlists?: {
    buckets?: Record<string, GroupShortlistBucket | null>;
  };
};

type RecomputedResourceBucket = {
  users?: CardinalityAggregationResult;
};

type RecomputedResourceAggregation = {
  buckets?: Record<string, RecomputedResourceBucket | null>;
};

type GroupPoolBucket = {
  active_users?: CardinalityAggregationResult;
  agents?: RecomputedResourceAggregation;
  skills?: RecomputedResourceAggregation;
};

type GroupPoolAggregations = {
  group_pools?: Record<string, GroupPoolBucket | undefined>;
};

type GroupPoolCandidate = {
  resourceType: SearchUsageDimension;
  resourceId: string;
  users: number;
};

type GroupShortlist = {
  agents: string[];
  skills: string[];
};

type CachedGroupPool = {
  groupId: string;
  activeUsers: number;
  candidates: GroupPoolCandidate[];
};

export type DiscoveryForYouCandidate = {
  resourceType: SearchUsageDimension;
  resourceId: string;
  score: number;
  reasonGroupId: string;
  users: number;
  groupActiveUsers: number;
};

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0;
}

function incompleteForYouSnapshot() {
  return new Err(
    new ElasticsearchError(
      "query_error",
      "Incomplete discovery for-you snapshot"
    )
  );
}

function cardinalityAggregation(
  field: string
): estypes.AggregationsAggregationContainer {
  return {
    cardinality: {
      field,
      precision_threshold: FOR_YOU_CARDINALITY_PRECISION_THRESHOLD,
    },
  };
}

function resourcePoolAggregation(
  field: string,
  include?: string
): estypes.AggregationsAggregationContainer {
  return {
    terms: {
      field,
      include,
      size: FOR_YOU_SHORTLIST_PER_GROUP_AND_TYPE,
      order: [{ [USERS_AGG]: "desc" }, { _key: "asc" }],
    },
    aggs: {
      [USERS_AGG]: cardinalityAggregation(CONSUMPTION_DIMENSION_FIELDS.user),
    },
  };
}

function recomputedResourceAggregation(
  field: string,
  resourceIds: string[]
): estypes.AggregationsAggregationContainer {
  return {
    filters: {
      filters: Object.fromEntries(
        resourceIds.map((resourceId) => [
          resourceId,
          { term: { [field]: resourceId } },
        ])
      ),
    },
    aggs: {
      [USERS_AGG]: cardinalityAggregation(CONSUMPTION_DIMENSION_FIELDS.user),
    },
  };
}

function parseCardinality(
  aggregation: CardinalityAggregationResult | null | undefined
): Result<number, ElasticsearchError> {
  if (!isNonNegativeFiniteNumber(aggregation?.value)) {
    return incompleteForYouSnapshot();
  }
  return new Ok(aggregation.value);
}

function parseShortlistResourceIds(
  aggregation: ShortlistResourceAggregation | null | undefined
): Result<string[], ElasticsearchError> {
  const buckets = aggregation?.buckets;
  if (!Array.isArray(buckets)) {
    return incompleteForYouSnapshot();
  }

  const resourceIds: string[] = [];
  for (const bucket of buckets) {
    if (!isString(bucket?.key)) {
      return incompleteForYouSnapshot();
    }
    resourceIds.push(bucket.key);
  }

  return new Ok(resourceIds);
}

function parseGroupShortlists(
  groupIds: string[],
  aggregation: GroupShortlistAggregations["group_shortlists"]
): Result<Map<string, GroupShortlist>, ElasticsearchError> {
  const shortlists = new Map<string, GroupShortlist>();
  for (const groupId of groupIds) {
    const groupBucket = aggregation?.buckets?.[groupId];
    if (!groupBucket) {
      return incompleteForYouSnapshot();
    }

    const agents = parseShortlistResourceIds(groupBucket.agents);
    if (agents.isErr()) {
      return agents;
    }
    const skills = parseShortlistResourceIds(groupBucket.skills);
    if (skills.isErr()) {
      return skills;
    }

    shortlists.set(groupId, {
      agents: agents.value,
      skills: skills.value,
    });
  }

  return new Ok(shortlists);
}

function parseRecomputedResourceBuckets(
  dimension: SearchUsageDimension,
  resourceIds: string[],
  aggregation: RecomputedResourceAggregation | null | undefined
): Result<GroupPoolCandidate[], ElasticsearchError> {
  if (resourceIds.length === 0) {
    return new Ok([]);
  }

  const candidates: GroupPoolCandidate[] = [];
  for (const resourceId of resourceIds) {
    const bucket = aggregation?.buckets?.[resourceId];
    if (!bucket) {
      return incompleteForYouSnapshot();
    }
    const users = parseCardinality(bucket.users);
    if (users.isErr()) {
      return users;
    }
    candidates.push({
      resourceType: dimension,
      resourceId,
      users: users.value,
    });
  }
  return new Ok(candidates);
}

function parseGroupPools(
  groupIds: string[],
  shortlists: Map<string, GroupShortlist>,
  aggregation: GroupPoolAggregations["group_pools"]
): Result<CachedGroupPool[], ElasticsearchError> {
  const pools: CachedGroupPool[] = [];
  for (const groupId of groupIds) {
    const groupBucket = aggregation?.[groupId];
    const shortlist = shortlists.get(groupId);
    if (!groupBucket || !shortlist) {
      return incompleteForYouSnapshot();
    }

    const activeUsers = parseCardinality(groupBucket.active_users);
    if (activeUsers.isErr()) {
      return activeUsers;
    }
    const agents = parseRecomputedResourceBuckets(
      "agent",
      shortlist.agents,
      groupBucket.agents
    );
    if (agents.isErr()) {
      return agents;
    }
    const skills = parseRecomputedResourceBuckets(
      "skill",
      shortlist.skills,
      groupBucket.skills
    );
    if (skills.isErr()) {
      return skills;
    }

    pools.push({
      groupId,
      activeUsers: activeUsers.value,
      candidates: [...agents.value, ...skills.value],
    });
  }
  return new Ok(pools);
}

function groupPoolCacheKey(workspaceId: string, groupId: string): string {
  return [
    "discovery-for-you-group-pool",
    DISCOVERY_FOR_YOU_ALGORITHM_VERSION,
    workspaceId,
    groupId,
  ].join(":");
}

function groupPoolRefreshLockKey(workspaceId: string): string {
  return [
    "discovery-for-you-group-pool-refresh",
    DISCOVERY_FOR_YOU_ALGORITHM_VERSION,
    workspaceId,
  ].join(":");
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGroupPoolCandidate(value: unknown): value is GroupPoolCandidate {
  return (
    isUnknownRecord(value) &&
    (value.resourceType === "agent" || value.resourceType === "skill") &&
    isString(value.resourceId) &&
    isNonNegativeFiniteNumber(value.users)
  );
}

function isCachedGroupPool(value: unknown): value is CachedGroupPool {
  return (
    isUnknownRecord(value) &&
    isString(value.groupId) &&
    isNonNegativeFiniteNumber(value.activeUsers) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isGroupPoolCandidate)
  );
}

function collectCachedGroupPools(
  groupIds: string[],
  cachedValues: (string | null)[]
): {
  poolsByGroupId: Map<string, CachedGroupPool>;
  missingGroupIds: string[];
} {
  const poolsByGroupId = new Map<string, CachedGroupPool>();
  const missingGroupIds: string[] = [];

  for (const [index, groupId] of groupIds.entries()) {
    const cachedValue = cachedValues[index];
    if (cachedValue) {
      try {
        const pool: unknown = JSON.parse(cachedValue);
        if (isCachedGroupPool(pool) && pool.groupId === groupId) {
          poolsByGroupId.set(groupId, pool);
          continue;
        }
      } catch {
        // Treat malformed cache entries as misses.
      }
    }
    missingGroupIds.push(groupId);
  }

  return { poolsByGroupId, missingGroupIds };
}

async function fetchAndCacheDiscoveryGroupPools(
  auth: Authenticator,
  groupIds: string[]
): Promise<Result<null, ElasticsearchError>> {
  if (groupIds.length === 0) {
    return new Ok(null);
  }

  const end = new Date();
  const adoptionStart = new Date(end);
  adoptionStart.setUTCDate(
    adoptionStart.getUTCDate() - FOR_YOU_ADOPTION_WINDOW_DAYS
  );

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: adoptionStart.toISOString(),
    endDate: end.toISOString(),
    extraFilters: [
      { terms: { context_origin: USER_USAGE_ORIGINS } },
      { exists: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
      { terms: { [CONSUMPTION_DIMENSION_FIELDS.group]: groupIds } },
    ],
  });
  const shortlistResult = await searchConsumptionAnalytics<
    never,
    GroupShortlistAggregations
  >(query, {
    size: 0,
    allow_partial_search_results: false,
    aggregations: {
      group_shortlists: {
        filters: {
          filters: Object.fromEntries(
            groupIds.map((groupId) => [
              groupId,
              { term: { [CONSUMPTION_DIMENSION_FIELDS.group]: groupId } },
            ])
          ),
        },
        aggs: {
          agents: resourcePoolAggregation(CONSUMPTION_DIMENSION_FIELDS.agent),
          skills: resourcePoolAggregation(
            CONSUMPTION_DIMENSION_FIELDS.skill,
            `${RESOURCES_PREFIX.skill}_.*`
          ),
        },
      },
    },
  });
  if (shortlistResult.isErr()) {
    return shortlistResult;
  }
  const groupShortlists = shortlistResult.value.aggregations?.group_shortlists;
  if (
    shortlistResult.value.timed_out ||
    (shortlistResult.value._shards?.failed ?? 0) > 0
  ) {
    return incompleteForYouSnapshot();
  }
  const shortlists = parseGroupShortlists(groupIds, groupShortlists);
  if (shortlists.isErr()) {
    return shortlists;
  }

  const recomputedResult = await searchConsumptionAnalytics<
    never,
    GroupPoolAggregations
  >(query, {
    size: 0,
    allow_partial_search_results: false,
    aggregations: {
      group_pools: {
        filter: { match_all: {} },
        aggs: Object.fromEntries(
          groupIds.map((groupId) => {
            const shortlist = shortlists.value.get(groupId) ?? {
              agents: [],
              skills: [],
            };
            return [
              groupId,
              {
                filter: {
                  term: {
                    [CONSUMPTION_DIMENSION_FIELDS.group]: groupId,
                  },
                },
                aggs: {
                  [ACTIVE_USERS_AGG]: cardinalityAggregation(
                    CONSUMPTION_DIMENSION_FIELDS.user
                  ),
                  ...(shortlist.agents.length > 0
                    ? {
                        agents: recomputedResourceAggregation(
                          CONSUMPTION_DIMENSION_FIELDS.agent,
                          shortlist.agents
                        ),
                      }
                    : {}),
                  ...(shortlist.skills.length > 0
                    ? {
                        skills: recomputedResourceAggregation(
                          CONSUMPTION_DIMENSION_FIELDS.skill,
                          shortlist.skills
                        ),
                      }
                    : {}),
                },
              },
            ];
          })
        ),
      },
    },
  });
  if (recomputedResult.isErr()) {
    return recomputedResult;
  }
  const groupPools = recomputedResult.value.aggregations?.group_pools;
  if (
    recomputedResult.value.timed_out ||
    (recomputedResult.value._shards?.failed ?? 0) > 0
  ) {
    return incompleteForYouSnapshot();
  }
  const pools = parseGroupPools(groupIds, shortlists.value, groupPools);
  if (pools.isErr()) {
    return pools;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
  await concurrentExecutor(
    pools.value,
    async (pool) => {
      await redis.set(
        groupPoolCacheKey(workspaceId, pool.groupId),
        JSON.stringify(pool),
        {
          PX: GROUP_POOL_CACHE_TTL_MS,
        }
      );
    },
    { concurrency: REDIS_CACHE_CONCURRENCY }
  );

  // The fetched pools were written individually; there is no combined payload.
  return new Ok(null);
}

async function fetchCachedDiscoveryGroupPools(
  auth: Authenticator,
  groupIds: string[]
): Promise<Result<CachedGroupPool[] | null, ElasticsearchError>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
  const keys = groupIds.map((groupId) =>
    groupPoolCacheKey(workspaceId, groupId)
  );
  const readCachedPools = async () =>
    collectCachedGroupPools(groupIds, await redis.mGet(keys));

  let cached = await readCachedPools();
  if (cached.missingGroupIds.length > 0) {
    // Prevent concurrent viewers from refreshing overlapping group pools.
    const lockKey = groupPoolRefreshLockKey(workspaceId);
    const lockValue = await distributedLock(
      redis,
      lockKey,
      GROUP_POOL_REFRESH_LOCK_TTL_MS
    );
    if (!lockValue) {
      const availablePools = [...cached.poolsByGroupId.values()];
      return new Ok(availablePools.length > 0 ? availablePools : null);
    }

    try {
      // Another request may have populated some pools between our first read
      // and acquiring the workspace refresh lock.
      cached = await readCachedPools();
      const fetched = await fetchAndCacheDiscoveryGroupPools(
        auth,
        cached.missingGroupIds
      );
      if (fetched.isErr()) {
        return fetched;
      }
    } finally {
      await distributedUnlock(redis, lockKey, lockValue);
    }

    cached = await readCachedPools();
  }

  return new Ok(
    groupIds.flatMap((groupId) => {
      const pool = cached.poolsByGroupId.get(groupId);
      return pool ? [pool] : [];
    })
  );
}

function groupContribution(users: number, activeUsers: number): number {
  return users / activeUsers / activeUsers ** GROUP_SIZE_PENALTY_EXPONENT;
}

function rankCandidates(pools: CachedGroupPool[]): DiscoveryForYouCandidate[] {
  const candidates = new Map<string, DiscoveryForYouCandidate>();

  for (const pool of pools) {
    if (pool.activeUsers <= 0) {
      continue;
    }
    for (const candidate of pool.candidates) {
      if (
        candidate.users <= 0 ||
        (candidate.resourceType === "agent" &&
          candidate.resourceId === GLOBAL_AGENTS_SID.DUST)
      ) {
        continue;
      }

      const contribution = groupContribution(candidate.users, pool.activeUsers);
      const key = `${candidate.resourceType}:${candidate.resourceId}`;
      const current = candidates.get(key);
      if (current && current.score >= contribution) {
        continue;
      }

      candidates.set(key, {
        resourceType: candidate.resourceType,
        resourceId: candidate.resourceId,
        score: contribution,
        reasonGroupId: pool.groupId,
        users: candidate.users,
        groupActiveUsers: pool.activeUsers,
      });
    }
  }

  return [...candidates.values()].sort(
    (left, right) =>
      right.score - left.score ||
      left.resourceType.localeCompare(right.resourceType) ||
      left.resourceId.localeCompare(right.resourceId)
  );
}

/**
 * @cc [owner:frankaloia,label:product;backend;performance;error-handling] discovery-for-you-candidates
 * Group candidate pools MUST be based on distinct attributed human users over the rolling 30-day
 * window, cached independently per group, and protected by a workspace refresh lock. Cache misses
 * MUST be rechecked after acquiring the lock, then use bounded per-group shortlists followed by
 * keyed-filter recomputation of candidate and active-user metrics across all shards.
 * Eligible groups MUST come from current workspace membership and be capped at 50 in stable ID
 * order. A candidate's score MUST be the maximum over the viewer's groups of its adoption rate in
 * the group (users over active users) divided by active users raised to a fixed exponent, so
 * smaller groups weigh more at equal adoption and overlapping groups do not stack. Dust-provided skills MUST NOT be candidates. A candidate
 * with no active group users or no resource users MUST be omitted. A timed-out, shard-failed, or
 * malformed response MUST return an error. Callers MUST recheck permissions and availability before display.
 * A concurrent cache miss MAY return `Ok(null)`.
 */
export async function fetchDiscoveryForYouCandidates(
  auth: Authenticator
): Promise<Result<DiscoveryForYouCandidate[] | null, ElasticsearchError>> {
  const viewer = auth.getNonNullableUser();
  const groups = await GroupResource.listUserGroupsInWorkspace({
    auth,
    user: viewer,
    groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });
  const eligibleGroupIds = [...new Set(groups.map((group) => group.sId))]
    .sort()
    .slice(0, FOR_YOU_MAX_ELIGIBLE_GROUPS);
  if (eligibleGroupIds.length === 0) {
    return new Ok([]);
  }

  const pools = await fetchCachedDiscoveryGroupPools(auth, eligibleGroupIds);
  if (pools.isErr()) {
    return pools;
  }
  if (pools.value === null) {
    return new Ok(null);
  }

  return new Ok(rankCandidates(pools.value));
}
