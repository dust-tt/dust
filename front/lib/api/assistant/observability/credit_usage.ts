import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { FREE_ORIGINS } from "@app/lib/metronome/events";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export type CreditGroupBy = "agent" | "user" | "none";

export type CreditUsageRow = {
  groupKey: string;
  name: string;
  totalCredits: number;
};

export type CreditUsageResult = {
  totalCredits: number;
  rows: CreditUsageRow[];
};

export type CreditTimeseriesPoint = {
  timestamp: number;
  date: string;
  totalCredits: number;
};

type CreditSlice = {
  total_cost?: estypes.AggregationsSumAggregate;
};

type GroupBucket = CreditSlice & { key: string };

type DateCreditBucket = CreditSlice & { key: number };

type CreditUsageAggs = CreditSlice & {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

type CreditTimeseriesAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<DateCreditBucket>;
};

type BreakdownGroupBucket = CreditSlice & { key: string };

type BreakdownDateBucket = CreditSlice & {
  key: number;
  by_group?: estypes.AggregationsMultiBucketAggregateBase<BreakdownGroupBucket>;
};

type CreditTimeseriesBreakdownAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<BreakdownDateBucket>;
};

export type CreditTimeseriesBreakdownPoint = {
  timestamp: number;
  date: string;
  totalCredits: number;
  otherCredits: number;
  groupCredits: number[];
};

export type CreditTimeseriesBreakdown = {
  groups: { groupKey: string; name: string }[];
  points: CreditTimeseriesBreakdownPoint[];
};

const creditSubAggs = {
  total_cost: { sum: { field: "cost.full_awu" } },
} satisfies Record<string, estypes.AggregationsAggregationContainer>;

function totalCreditsFromSlice(slice: CreditSlice): number {
  return Math.round(slice.total_cost?.value ?? 0);
}

// Workspace query scoped to the window/filters, with free origins excluded to
// mirror the non-free billed scope. Shared by both credit fetchers so the scope
// stays identical.
function buildCreditQuery(
  auth: Authenticator,
  {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  }: {
    startDate: string;
    endDate: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
  },
  extraFilters: estypes.QueryDslQueryContainer[] = []
): estypes.QueryDslQueryContainer {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  });
  return {
    bool: {
      filter: [baseQuery, ...extraFilters],
      must_not: [{ terms: { context_origin: [...FREE_ORIGINS] } }],
    },
  };
}

function groupFieldFor(groupBy: "agent" | "user"): "agent_id" | "user_id" {
  switch (groupBy) {
    case "agent":
      return "agent_id";
    case "user":
      return "user_id";
    default:
      return assertNever(groupBy);
  }
}

async function resolveGroupNames(
  auth: Authenticator,
  groupBy: "agent" | "user",
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  switch (groupBy) {
    case "agent": {
      const agents = await getAgentConfigurations(auth, {
        agentIds: ids,
        variant: "extra_light",
      });
      return new Map(agents.map((agent) => [agent.sId, agent.name]));
    }
    case "user": {
      const users = await UserResource.fetchByIds(ids);
      return new Map(
        users.map((user) => [
          user.sId,
          user.fullName() || user.username || "Unknown user",
        ])
      );
    }
    default:
      return assertNever(groupBy);
  }
}

// Sums the per-message AWU credits (cost.full_awu) precomputed at index time
// with the billing pipeline's conversion. Still an estimate vs the billed
// figure on the usage page (indexing lag, docs indexed before the cost fields
// shipped). Groups are ranked exactly by cost.full_awu inside ES.
export async function fetchCreditUsage(
  auth: Authenticator,
  {
    startDate,
    endDate,
    limit,
    groupBy,
    contextOrigin,
    agentIds,
    userIds,
  }: {
    startDate: string;
    endDate: string;
    limit: number;
    groupBy: CreditGroupBy;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
  }
): Promise<Result<CreditUsageResult, ElasticsearchError>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    { ...creditSubAggs };
  if (groupBy !== "none") {
    aggregations.by_group = {
      terms: {
        field: groupFieldFor(groupBy),
        size: limit,
        order: { total_cost: "desc" },
      },
      aggs: { ...creditSubAggs },
    };
  }

  const query = buildCreditQuery(
    auth,
    { startDate, endDate, contextOrigin, agentIds, userIds },
    groupBy === "none" ? [] : [{ exists: { field: groupFieldFor(groupBy) } }]
  );

  const result = await searchAnalytics<never, CreditUsageAggs>(query, {
    aggregations,
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const aggs = result.value.aggregations;

  const totalCredits = totalCreditsFromSlice(aggs ?? {});

  if (groupBy === "none") {
    return new Ok({ totalCredits, rows: [] });
  }

  const ranked = bucketsToArray<GroupBucket>(aggs?.by_group?.buckets).map(
    (bucket) => ({
      groupKey: String(bucket.key),
      totalCredits: totalCreditsFromSlice(bucket),
    })
  );

  const namesById = await resolveGroupNames(
    auth,
    groupBy,
    ranked.map((row) => row.groupKey)
  );

  const rows: CreditUsageRow[] = ranked.map((row) => ({
    ...row,
    name:
      namesById.get(row.groupKey) ??
      (groupBy === "agent" ? "Unknown agent" : "Programmatic usage"),
  }));

  return new Ok({ totalCredits, rows });
}

// Per-message AWU credits bucketed over time (the trend behind
// get_credit_usage's totals). Same source and scope as fetchCreditUsage.
export async function fetchCreditTimeseries(
  auth: Authenticator,
  {
    startDate,
    endDate,
    granularity,
    timezone,
    contextOrigin,
    agentIds,
    userIds,
  }: {
    startDate: string;
    endDate: string;
    granularity: "day" | "week" | "month";
    timezone: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
  }
): Promise<Result<CreditTimeseriesPoint[], ElasticsearchError>> {
  const query = buildCreditQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  });

  const result = await searchAnalytics<never, CreditTimeseriesAggs>(query, {
    aggregations: {
      by_date: {
        date_histogram: {
          field: "timestamp",
          calendar_interval: granularity,
          time_zone: timezone,
        },
        aggs: { ...creditSubAggs },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<DateCreditBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(
    buckets.map((bucket) => ({
      timestamp: bucket.key,
      date: formatDateFromMillis(bucket.key, timezone),
      totalCredits: totalCreditsFromSlice(bucket),
    }))
  );
}

// Estimated credits over time, split into the top-N agents/users plus an
// "other" bucket holding everything else. Ranks groups once (by total credits),
// then fetches the per-bucket series for just those groups; "other" is the
// per-bucket total minus the shown groups so the series reconciles.
export async function fetchCreditTimeseriesBreakdown(
  auth: Authenticator,
  {
    startDate,
    endDate,
    granularity,
    timezone,
    breakdownBy,
    limit,
    contextOrigin,
    agentIds,
    userIds,
  }: {
    startDate: string;
    endDate: string;
    granularity: "day" | "week" | "month";
    timezone: string;
    breakdownBy: "agent" | "user";
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
  }
): Promise<Result<CreditTimeseriesBreakdown, ElasticsearchError>> {
  const ranking = await fetchCreditUsage(auth, {
    startDate,
    endDate,
    limit,
    groupBy: breakdownBy,
    contextOrigin,
    agentIds,
    userIds,
  });
  if (ranking.isErr()) {
    return ranking;
  }

  const groups = ranking.value.rows.map((row) => ({
    groupKey: row.groupKey,
    name: row.name,
  }));
  if (groups.length === 0) {
    return new Ok({ groups: [], points: [] });
  }

  const groupKeys = groups.map((group) => group.groupKey);
  const query = buildCreditQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  });

  const result = await searchAnalytics<never, CreditTimeseriesBreakdownAggs>(
    query,
    {
      aggregations: {
        by_date: {
          date_histogram: {
            field: "timestamp",
            calendar_interval: granularity,
            time_zone: timezone,
          },
          aggs: {
            ...creditSubAggs,
            by_group: {
              terms: {
                field: groupFieldFor(breakdownBy),
                include: groupKeys,
                size: groupKeys.length,
              },
              aggs: { ...creditSubAggs },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<BreakdownDateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  const points = buckets.map((bucket) => {
    const totalCredits = totalCreditsFromSlice(bucket);
    const creditsByKey = new Map(
      bucketsToArray<BreakdownGroupBucket>(bucket.by_group?.buckets).map(
        (groupBucket) => [
          String(groupBucket.key),
          totalCreditsFromSlice(groupBucket),
        ]
      )
    );
    const groupCredits = groupKeys.map((key) => creditsByKey.get(key) ?? 0);
    const otherCredits = Math.max(
      0,
      totalCredits - groupCredits.reduce((sum, credits) => sum + credits, 0)
    );
    return {
      timestamp: bucket.key,
      date: formatDateFromMillis(bucket.key, timezone),
      totalCredits,
      otherCredits,
      groupCredits,
    };
  });

  return new Ok({ groups, points });
}
