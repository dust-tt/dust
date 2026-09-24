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
import type { SearchUsageDimension } from "@app/lib/search_usage/usage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedisResult } from "@app/lib/utils/cache";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, isString } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Discovery "For You" reads consumption analytics through two independent
 * data paths, split by what can be shared between viewers.
 *
 * 1. Group pools (shared). A bounded shortlist query selects candidate IDs per
 *    eligible group, then keyed filters recompute their distinct-user counts
 *    and the group's active-user count across all shards. Nothing in these
 *    queries is viewer-specific, so each recomputed group pool is cached on its
 *    own key and reused by every member. One workspace lock serializes refreshes
 *    when any requested pool is missing.
 * 2. Viewer profile (per viewer). One query counts the viewer's distinct
 *    conversations per agent and skill over the same window. Cached per
 *    viewer.
 */
const FOR_YOU_ADOPTION_WINDOW_DAYS = 30;
const FOR_YOU_SHORTLIST_PER_GROUP_AND_TYPE = 25;
// Safety ceiling only; normal viewers use all their eligible groups.
const FOR_YOU_MAX_ELIGIBLE_GROUPS = 50;
const FOR_YOU_VIEWER_RESOURCES_PER_TYPE = 1_000;
const FOR_YOU_CARDINALITY_PRECISION_THRESHOLD = 1_000;
const GROUP_POOL_CACHE_TTL_MS = 60 * 60 * 1000;
const GROUP_POOL_REFRESH_LOCK_TTL_MS = 30 * 1000;
const VIEWER_USAGE_CACHE_TTL_MS = 60 * 60 * 1000;
const DISCOVERY_FOR_YOU_ALGORITHM_VERSION = "v1";

// Group size carries two opposing signals: larger cohorts make adoption more
// trustworthy, while smaller cohorts are likely more personally relevant.
// We are intentionally bounding these effects. Each of these parameters below
// are based on empirical observations. We SHOULD tune these as we see fit.

// How quickly we trust a group's adoption rate: activeUsers / (activeUsers + 5).
const SMALL_GROUP_CONFIDENCE_USERS = 5;
// Floor on that confidence term. Adoption is multiplied by
// (0.5 + 0.5 × confidence), so a tiny group keeps at least half its signal.
const MINIMUM_CONFIDENCE_WEIGHT = 0.5;
// Bounded preference for closer groups: 1 + 0.25 / sqrt(activeUsers + 1).
// About +18% at one active user, fading toward zero as the group grows.
const SMALL_GROUP_BOOST_WEIGHT = 0.25;

const ACTIVE_USERS_AGG = "active_users";
const USERS_AGG = "users";
const CONVERSATIONS_AGG = "conversations";
const CONVERSATION_ID_FIELD = "conversation_id";

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

type ViewerUsageBucket = {
  key?: string;
  conversations?: CardinalityAggregationResult;
};

type ViewerResourceAggregation = {
  buckets?: Array<ViewerUsageBucket | null>;
};

type ViewerUsageAggregations = {
  agents?: ViewerResourceAggregation;
  skills?: ViewerResourceAggregation;
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

type ViewerUsageProfile = {
  agents: Record<string, number>;
  skills: Record<string, number>;
};

export type DiscoveryForYouCandidate = {
  resourceType: SearchUsageDimension;
  resourceId: string;
  score: number;
  reasonGroupId: string;
  users: number;
  groupActiveUsers: number;
  viewerConversations: number;
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
  field: string
): estypes.AggregationsAggregationContainer {
  return {
    terms: {
      field,
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

function viewerResourceAggregation(
  field: string
): estypes.AggregationsAggregationContainer {
  return {
    terms: {
      field,
      size: FOR_YOU_VIEWER_RESOURCES_PER_TYPE,
      order: [{ _count: "desc" }, { _key: "asc" }],
    },
    aggs: {
      [CONVERSATIONS_AGG]: cardinalityAggregation(CONVERSATION_ID_FIELD),
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

function parseViewerUsageBuckets(
  aggregation: ViewerResourceAggregation | undefined
): Result<Record<string, number>, ElasticsearchError> {
  const buckets = aggregation?.buckets;
  if (!Array.isArray(buckets)) {
    return incompleteForYouSnapshot();
  }

  const usage: Record<string, number> = {};
  for (const bucket of buckets) {
    if (!isString(bucket?.key)) {
      return incompleteForYouSnapshot();
    }
    const conversations = parseCardinality(bucket.conversations);
    if (conversations.isErr()) {
      return conversations;
    }
    usage[bucket.key] = conversations.value;
  }
  return new Ok(usage);
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
          skills: resourcePoolAggregation(CONSUMPTION_DIMENSION_FIELDS.skill),
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

async function fetchDiscoveryViewerUsageUncached(
  auth: Authenticator,
  viewerId: string
): Promise<Result<ViewerUsageProfile, ElasticsearchError>> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - FOR_YOU_ADOPTION_WINDOW_DAYS);

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    extraFilters: [
      { terms: { context_origin: USER_USAGE_ORIGINS } },
      { term: { [CONSUMPTION_DIMENSION_FIELDS.user]: viewerId } },
    ],
  });
  const result = await searchConsumptionAnalytics<
    never,
    ViewerUsageAggregations
  >(query, {
    size: 0,
    allow_partial_search_results: false,
    aggregations: {
      agents: viewerResourceAggregation(CONSUMPTION_DIMENSION_FIELDS.agent),
      skills: viewerResourceAggregation(CONSUMPTION_DIMENSION_FIELDS.skill),
    },
  });
  if (result.isErr()) {
    return result;
  }
  const agents = result.value.aggregations?.agents;
  const skills = result.value.aggregations?.skills;
  if (result.value.timed_out || (result.value._shards?.failed ?? 0) > 0) {
    return incompleteForYouSnapshot();
  }

  const agentUsage = parseViewerUsageBuckets(agents);
  if (agentUsage.isErr()) {
    return agentUsage;
  }
  const skillUsage = parseViewerUsageBuckets(skills);
  if (skillUsage.isErr()) {
    return skillUsage;
  }
  return new Ok({
    agents: agentUsage.value,
    skills: skillUsage.value,
  });
}

const fetchCachedDiscoveryViewerUsage = cacheWithRedisResult(
  fetchDiscoveryViewerUsageUncached,
  (auth, viewerId) =>
    [
      DISCOVERY_FOR_YOU_ALGORITHM_VERSION,
      auth.getNonNullableWorkspace().sId,
      viewerId,
    ].join(":"),
  {
    cacheId: "discovery-for-you-viewer-usage",
    ttlMs: VIEWER_USAGE_CACHE_TTL_MS,
    useDistributedLock: true,
    skipIfLocked: true,
  }
);

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

function viewerConversationsForCandidate(
  candidate: GroupPoolCandidate,
  usage: ViewerUsageProfile
): number {
  return candidate.resourceType === "agent"
    ? (usage.agents[candidate.resourceId] ?? 0)
    : (usage.skills[candidate.resourceId] ?? 0);
}

function localOpportunity({
  users,
  groupActiveUsers,
}: {
  users: number;
  groupActiveUsers: number;
}): number {
  if (groupActiveUsers <= 0 || users <= 0) {
    return 0;
  }

  const smoothedAdoption = (users + 1) / (groupActiveUsers + 2);
  const confidence =
    groupActiveUsers / (groupActiveUsers + SMALL_GROUP_CONFIDENCE_USERS);
  const reliableAdoption =
    smoothedAdoption *
    (MINIMUM_CONFIDENCE_WEIGHT + (1 - MINIMUM_CONFIDENCE_WEIGHT) * confidence);
  const smallGroupModifier =
    1 + SMALL_GROUP_BOOST_WEIGHT / Math.sqrt(groupActiveUsers + 1);

  return reliableAdoption * smallGroupModifier;
}

function rankCandidates(
  pools: CachedGroupPool[],
  usage: ViewerUsageProfile
): DiscoveryForYouCandidate[] {
  const candidates = new Map<string, DiscoveryForYouCandidate>();

  for (const pool of pools) {
    for (const candidate of pool.candidates) {
      if (
        candidate.resourceType === "agent" &&
        candidate.resourceId === GLOBAL_AGENTS_SID.DUST
      ) {
        continue;
      }

      const viewerConversations = viewerConversationsForCandidate(
        candidate,
        usage
      );
      const opportunity = localOpportunity({
        users: candidate.users,
        groupActiveUsers: pool.activeUsers,
      });
      if (opportunity <= 0) {
        continue;
      }
      const novelty = 1 / Math.sqrt(viewerConversations + 1);
      const score = opportunity * novelty;
      const key = `${candidate.resourceType}:${candidate.resourceId}`;
      const current = candidates.get(key);

      if (
        !current ||
        score > current.score ||
        (score === current.score &&
          pool.groupId.localeCompare(current.reasonGroupId) < 0)
      ) {
        candidates.set(key, {
          resourceType: candidate.resourceType,
          resourceId: candidate.resourceId,
          score,
          reasonGroupId: pool.groupId,
          users: candidate.users,
          groupActiveUsers: pool.activeUsers,
          viewerConversations,
        });
      }
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
 * Viewer usage MUST be measured as distinct conversations and remain a continuous novelty penalty;
 * omitted viewer terms MAY be treated as zero, and no candidate may be excluded because of a
 * behavioral usage threshold. Eligible groups MUST come from current workspace membership and be
 * capped at 50 in stable ID order. Ranking MUST use the candidate's strongest group opportunity,
 * combining smoothed group adoption, bounded confidence shrinkage, a bounded smaller-group boost,
 * and continuous viewer novelty. A candidate with no active group users or no resource users MUST
 * be omitted. A timed-out, shard-failed, or malformed response MUST return an error. Callers MUST
 * recheck favorites, pins, permissions, availability, and agent-skill relationships before display.
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

  const [pools, usage] = await Promise.all([
    fetchCachedDiscoveryGroupPools(auth, eligibleGroupIds),
    fetchCachedDiscoveryViewerUsage(auth, viewer.sId),
  ]);
  if (pools.isErr()) {
    return pools;
  }
  if (usage.isErr()) {
    return usage;
  }
  if (pools.value === null || usage.value === null) {
    return new Ok(null);
  }

  return new Ok(rankCandidates(pools.value, usage.value));
}
