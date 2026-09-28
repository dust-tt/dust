import {
  buildConsumptionScopeQuery,
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
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber, isString } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

export const DISCOVERY_TRENDING_WINDOW_DAYS = 7;

// Intentionally querying more than required so callers can
// apply current-viewer permissions before limiting it.
const TRENDING_CANDIDATES_PER_TYPE = 100;
const TRENDING_CARDINALITY_PRECISION_THRESHOLD = 1_000;
const PREFERRED_CURRENT_USERS = 5;
const DISCOVERY_TRENDING_CACHE_TTL_MS = 60 * 60 * 1000;
const DISCOVERY_TRENDING_ALGORITHM_VERSION = "v2";

type ActiveUsersAggregation = {
  users?: {
    value?: number | null;
  };
};

type CandidateSelectionBucket = {
  key?: string;
};

type CandidateMetricsBucket = {
  current?: ActiveUsersAggregation;
  previous?: ActiveUsersAggregation;
};

type CandidateSelectionAggregations = {
  agents?: {
    buckets?: Array<CandidateSelectionBucket | null>;
  };
  skills?: {
    buckets?: Array<CandidateSelectionBucket | null>;
  };
};

type CandidateMetricsAggregations = {
  agents?: {
    buckets?: Record<string, CandidateMetricsBucket | null>;
  };
  skills?: {
    buckets?: Record<string, CandidateMetricsBucket | null>;
  };
};

export type DiscoveryTrendingCandidate = {
  resourceType: SearchUsageDimension;
  resourceId: string;
  currentUsers: number;
  previousUsers: number;
  userGrowth: number;
};

export type DiscoveryTrendingCandidatePools = {
  agents: DiscoveryTrendingCandidate[];
  skills: DiscoveryTrendingCandidate[];
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
          precision_threshold: TRENDING_CARDINALITY_PRECISION_THRESHOLD,
        },
      },
    },
  };
}

function candidateSelectionAggregation(
  field: string
): estypes.AggregationsAggregationContainer {
  // This is intentionally a heuristic shortlist: shard-local terms truncation can omit a globally
  // popular resource. That tradeoff keeps candidate selection bounded; the metrics query below
  // recomputes distinct-user growth across all shards for every selected candidate.
  return {
    terms: {
      field,
      size: TRENDING_CANDIDATES_PER_TYPE,
      order: { _count: "desc" },
    },
  };
}

function candidateMetricsAggregation(
  field: string,
  resourceIds: string[],
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
    filters: {
      filters: Object.fromEntries(
        resourceIds.map((resourceId) => [
          resourceId,
          { term: { [field]: resourceId } },
        ])
      ),
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

function candidateIdsFromBuckets(
  buckets: Array<CandidateSelectionBucket | null>
): Result<string[], ElasticsearchError> {
  const resourceIds: string[] = [];

  for (const bucket of buckets) {
    const resourceId = bucket?.key;
    if (!isString(resourceId)) {
      return incompleteTrendingSnapshot();
    }
    resourceIds.push(resourceId);
  }

  return new Ok([...new Set(resourceIds)]);
}

function candidatesFromMetrics(
  dimension: SearchUsageDimension,
  resourceIds: string[],
  buckets: Record<string, CandidateMetricsBucket | null> | undefined
): Result<DiscoveryTrendingCandidate[], ElasticsearchError> {
  const candidates: DiscoveryTrendingCandidate[] = [];

  for (const resourceId of resourceIds) {
    const bucket = buckets?.[resourceId];
    const currentUsers = bucket?.current?.users?.value;
    const previousUsers = bucket?.previous?.users?.value;
    if (
      !isNumber(currentUsers) ||
      !Number.isFinite(currentUsers) ||
      currentUsers < 0 ||
      !isNumber(previousUsers) ||
      !Number.isFinite(previousUsers) ||
      previousUsers < 0
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

  const commonFilters: estypes.QueryDslQueryContainer[] = [
    { terms: { context_origin: USER_USAGE_ORIGINS } },
    { exists: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
  ];
  const selectionQuery = buildConsumptionScopeQuery({
    auth,
    startDate: currentStart.toISOString(),
    endDate: end.toISOString(),
    extraFilters: commonFilters,
  });
  const selectionResult = await searchConsumptionAnalytics<
    never,
    CandidateSelectionAggregations
  >(selectionQuery, {
    size: 0,
    track_total_hits: false,
    allow_partial_search_results: false,
    aggregations: {
      agents: candidateSelectionAggregation(CONSUMPTION_DIMENSION_FIELDS.agent),
      skills: candidateSelectionAggregation(CONSUMPTION_DIMENSION_FIELDS.skill),
    },
  });
  if (selectionResult.isErr()) {
    return selectionResult;
  }

  const agentBuckets = selectionResult.value.aggregations?.agents?.buckets;
  const skillBuckets = selectionResult.value.aggregations?.skills?.buckets;
  if (
    selectionResult.value.timed_out ||
    (selectionResult.value._shards?.failed ?? 0) > 0 ||
    !Array.isArray(agentBuckets) ||
    !Array.isArray(skillBuckets)
  ) {
    return incompleteTrendingSnapshot();
  }

  const agentIdsResult = candidateIdsFromBuckets(agentBuckets);
  if (agentIdsResult.isErr()) {
    return agentIdsResult;
  }
  const skillIdsResult = candidateIdsFromBuckets(skillBuckets);
  if (skillIdsResult.isErr()) {
    return skillIdsResult;
  }

  const agentIds = agentIdsResult.value;
  const skillIds = skillIdsResult.value;
  if (agentIds.length === 0 && skillIds.length === 0) {
    return new Ok([]);
  }

  const candidateFilters: estypes.QueryDslQueryContainer[] = [];
  if (agentIds.length > 0) {
    candidateFilters.push({
      terms: { [CONSUMPTION_DIMENSION_FIELDS.agent]: agentIds },
    });
  }
  if (skillIds.length > 0) {
    candidateFilters.push({
      terms: { [CONSUMPTION_DIMENSION_FIELDS.skill]: skillIds },
    });
  }

  const metricsQuery = buildConsumptionScopeQuery({
    auth,
    startDate: previousStart.toISOString(),
    endDate: end.toISOString(),
    extraFilters: [
      ...commonFilters,
      {
        bool: {
          should: candidateFilters,
          minimum_should_match: 1,
        },
      },
    ],
  });
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {};
  if (agentIds.length > 0) {
    aggregations.agents = candidateMetricsAggregation(
      CONSUMPTION_DIMENSION_FIELDS.agent,
      agentIds,
      { previousStart, currentStart, end }
    );
  }
  if (skillIds.length > 0) {
    aggregations.skills = candidateMetricsAggregation(
      CONSUMPTION_DIMENSION_FIELDS.skill,
      skillIds,
      { previousStart, currentStart, end }
    );
  }

  const metricsResult = await searchConsumptionAnalytics<
    never,
    CandidateMetricsAggregations
  >(metricsQuery, {
    size: 0,
    track_total_hits: false,
    allow_partial_search_results: false,
    aggregations,
  });
  if (metricsResult.isErr()) {
    return metricsResult;
  }
  if (
    metricsResult.value.timed_out ||
    (metricsResult.value._shards?.failed ?? 0) > 0
  ) {
    return incompleteTrendingSnapshot();
  }

  const agentCandidates = candidatesFromMetrics(
    "agent",
    agentIds,
    metricsResult.value.aggregations?.agents?.buckets
  );
  if (agentCandidates.isErr()) {
    return agentCandidates;
  }
  const skillCandidates = candidatesFromMetrics(
    "skill",
    skillIds,
    metricsResult.value.aggregations?.skills?.buckets
  );
  if (skillCandidates.isErr()) {
    return skillCandidates;
  }

  return new Ok([...agentCandidates.value, ...skillCandidates.value]);
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

function rankCandidatePool(
  candidates: DiscoveryTrendingCandidate[]
): DiscoveryTrendingCandidate[] {
  const ranked = candidates.sort(
    (left, right) =>
      right.userGrowth - left.userGrowth ||
      right.currentUsers - left.currentUsers ||
      left.resourceId.localeCompare(right.resourceId)
  );

  return [
    ...ranked.filter(
      ({ currentUsers }) => currentUsers >= PREFERRED_CURRENT_USERS
    ),
    ...ranked.filter(
      ({ currentUsers }) => currentUsers < PREFERRED_CURRENT_USERS
    ),
  ];
}

/**
 * @cc [owner:frankaloia,label:product;backend;performance;error-handling] discovery-trending-candidates
 * Candidates MUST compare approximate distinct attributed human users in the last rolling seven
 * days against the preceding seven days. A bounded query MUST select the most-used agent and skill
 * candidates from the current seven-day window, then one filtered query MUST compute their metrics
 * across all shards when the one-hour workspace cache is populated.
 * A timed-out, partial, or malformed response MUST return an error rather than treating missing data
 * as zero. Agent and skill pools MUST be returned separately, exclude the default Dust agent, and
 * prefer candidates with at least five current-period users before lower-volume candidates. Within
 * each volume group, results MUST be ordered by growth, current users, then id; non-positive growth
 * remains eligible. Cached metrics MUST remain free of viewer-specific permission filtering.
 * Each returned pool is intentionally larger than the roughly five displayed items so callers can
 * apply current-viewer permissions before limiting it. A concurrent fleet-wide cache miss MUST
 * return `Ok(null)` while the lock holder populates the cache.
 */
export async function fetchDiscoveryTrendingCandidates(
  auth: Authenticator
): Promise<Result<DiscoveryTrendingCandidatePools | null, ElasticsearchError>> {
  const result = await fetchCachedDiscoveryTrendingCandidates(auth);
  if (result.isErr()) {
    return result;
  }
  if (result.value === null) {
    return new Ok(null);
  }

  return new Ok({
    agents: rankCandidatePool(
      result.value.filter(
        ({ resourceType, resourceId }) =>
          resourceType === "agent" && resourceId !== GLOBAL_AGENTS_SID.DUST
      )
    ),
    skills: rankCandidatePool(
      result.value.filter(({ resourceType }) => resourceType === "skill")
    ),
  });
}
