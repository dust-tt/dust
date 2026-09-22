import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import type { SearchUsageDimension } from "@app/lib/search_usage/usage";
import { cacheWithRedisResult } from "@app/lib/utils/cache";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export const DISCOVERY_TRENDING_WINDOW_DAYS = 7;

// Intentionally querying more than required so callers can
// apply current-viewer permissions before limiting it.
const TRENDING_CANDIDATES_PER_TYPE = 25;
const DISCOVERY_TRENDING_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_TRENDING_ALGORITHM_VERSION = "v1";

type ActiveUsersAggregation = {
  users?: {
    value?: number | null;
  };
};

type TrendingBucket = {
  key?: string;
  current?: ActiveUsersAggregation;
  previous?: ActiveUsersAggregation;
};

type TrendingAggregations = {
  agents?: {
    buckets?: TrendingBucket[];
  };
  skills?: {
    buckets?: TrendingBucket[];
  };
};

export type DiscoveryTrendingCandidate = {
  resourceType: SearchUsageDimension;
  resourceId: string;
  currentUsers: number;
  previousUsers: number;
  userGrowth: number;
};

function periodAggregation(
  start: Date,
  end: Date
): estypes.AggregationsAggregationContainer {
  return {
    filter: {
      range: {
        [COMPLETED_AT_FIELD]: {
          gte: start.toISOString(),
          lt: end.toISOString(),
        },
      },
    },
    aggs: {
      users: {
        cardinality: {
          field: CONSUMPTION_DIMENSION_FIELDS.user,
          precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
        },
      },
    },
  };
}

function resourceAggregation(
  field: string,
  {
    previousStart,
    currentStart,
    end,
  }: {
    previousStart: Date;
    currentStart: Date;
    end: Date;
  }
): estypes.AggregationsAggregationContainer {
  return {
    terms: {
      field,
      size: TRENDING_CANDIDATES_PER_TYPE,
      order: { _count: "desc" },
    },
    aggs: {
      current: periodAggregation(currentStart, end),
      previous: periodAggregation(previousStart, currentStart),
    },
  };
}

function incompleteTrendingSnapshot() {
  return new Err(
    new ElasticsearchError(
      "query_error",
      "Incomplete discovery trending snapshot"
    )
  );
}

function candidatesFromBuckets(
  dimension: SearchUsageDimension,
  buckets: TrendingBucket[]
): Result<DiscoveryTrendingCandidate[], ElasticsearchError> {
  const candidates: DiscoveryTrendingCandidate[] = [];

  for (const bucket of buckets) {
    const resourceId = bucket.key;
    const currentUsers = bucket.current?.users?.value;
    const previousUsers = bucket.previous?.users?.value;
    if (
      typeof resourceId !== "string" ||
      typeof currentUsers !== "number" ||
      !Number.isFinite(currentUsers) ||
      typeof previousUsers !== "number" ||
      !Number.isFinite(previousUsers)
    ) {
      return incompleteTrendingSnapshot();
    }

    candidates.push({
      resourceType: dimension,
      resourceId,
      currentUsers,
      previousUsers,
      // We are intentionally looking at raw growth rather than normalized growth
      userGrowth: currentUsers - previousUsers,
    });
  }

  return new Ok(candidates);
}

async function fetchDiscoveryTrendingCandidatesUncached(
  auth: Authenticator
): Promise<Result<DiscoveryTrendingCandidate[], ElasticsearchError>> {
  const end = new Date();

  const currentStart = new Date(end);
  currentStart.setUTCDate(
    currentStart.getUTCDate() - DISCOVERY_TRENDING_WINDOW_DAYS
  );

  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(
    previousStart.getUTCDate() - DISCOVERY_TRENDING_WINDOW_DAYS
  );

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: previousStart.toISOString(),
    endDate: end.toISOString(),
    extraFilters: [
      { terms: { context_origin: USER_USAGE_ORIGINS } },
      { exists: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
    ],
  });
  const result = await searchConsumptionAnalytics<never, TrendingAggregations>(
    query,
    {
      size: 0,
      track_total_hits: false,
      allow_partial_search_results: false,
      aggregations: {
        agents: resourceAggregation(CONSUMPTION_DIMENSION_FIELDS.agent, {
          previousStart,
          currentStart,
          end,
        }),
        skills: resourceAggregation(CONSUMPTION_DIMENSION_FIELDS.skill, {
          previousStart,
          currentStart,
          end,
        }),
      },
    }
  );
  if (result.isErr()) {
    return result;
  }

  const agents = result.value.aggregations?.agents?.buckets;
  const skills = result.value.aggregations?.skills?.buckets;
  if (
    result.value.timed_out ||
    (result.value._shards?.failed ?? 0) > 0 ||
    !Array.isArray(agents) ||
    !Array.isArray(skills)
  ) {
    return incompleteTrendingSnapshot();
  }

  const agentCandidates = candidatesFromBuckets("agent", agents);
  if (agentCandidates.isErr()) {
    return agentCandidates;
  }
  const skillCandidates = candidatesFromBuckets("skill", skills);
  if (skillCandidates.isErr()) {
    return skillCandidates;
  }

  return new Ok(
    [...agentCandidates.value, ...skillCandidates.value]
      .filter(({ userGrowth }) => userGrowth > 0)
      .sort(
        (left, right) =>
          right.userGrowth - left.userGrowth ||
          right.currentUsers - left.currentUsers ||
          left.resourceType.localeCompare(right.resourceType) ||
          left.resourceId.localeCompare(right.resourceId)
      )
  );
}

const fetchCachedDiscoveryTrendingCandidates = cacheWithRedisResult(
  fetchDiscoveryTrendingCandidatesUncached,
  (auth) =>
    [
      DISCOVERY_TRENDING_ALGORITHM_VERSION,
      auth.getNonNullableWorkspace().sId,
    ].join(":"),
  {
    cacheId: "discovery-trending-candidates",
    ttlMs: DISCOVERY_TRENDING_CACHE_TTL_MS,
    useDistributedLock: true,
    skipIfLocked: true,
  }
);

/**
 * @cc [owner:frankaloia,label:product;backend;performance;error-handling] discovery-trending-candidates
 * Candidates MUST compare approximate distinct attributed human users in the last rolling seven
 * days against the preceding seven days, from one bounded agent-and-skill query evaluated when its
 * five-minute workspace cache is populated.
 * A timed-out, partial, or malformed response MUST return an error rather than treating missing data
 * as zero. Results MUST have positive growth, ordered by growth, current users, type, then id, and
 * cached without viewer-specific permission filtering.
 * The returned pool is intentionally larger than the roughly five displayed items so callers can
 * apply current-viewer permissions before limiting it. A concurrent fleet-wide cache miss MUST
 * return `Ok(null)` while the lock holder populates the cache.
 */
export function fetchDiscoveryTrendingCandidates(
  auth: Authenticator
): Promise<Result<DiscoveryTrendingCandidate[] | null, ElasticsearchError>> {
  return fetchCachedDiscoveryTrendingCandidates(auth);
}
