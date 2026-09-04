import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import {
  buildCreditsScopeQuery,
  MODEL_ID_FIELD,
  NOT_API_GROUP_KEY,
  NOT_API_GROUP_NAME,
} from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { getProgrammaticUsageFilterClause } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export type CreditBreakdownBy =
  | "agent"
  | "user"
  | "origin"
  | "api_key"
  | "model";

type CreditGroupBy = CreditBreakdownBy | "none";

type CreditUsageRow = {
  groupKey: string;
  name: string;
  totalCredits: number;
};

type CreditUsageResult = {
  totalCredits: number;
  rows: CreditUsageRow[];
};

type CreditTimeseriesPoint = {
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

type CreditTimeseriesBreakdownPoint = {
  timestamp: number;
  date: string;
  totalCredits: number;
  otherCredits: number;
  groupCredits: number[];
};

type CreditTimeseriesBreakdown = {
  groups: { groupKey: string; name: string }[];
  points: CreditTimeseriesBreakdownPoint[];
};

type CreditUsageTypePoint = {
  timestamp: number;
  date: string;
  userCredits: number;
  programmaticCredits: number;
};

type UsageTypeDateBucket = {
  key: number;
  user?: CreditSlice;
  programmatic?: CreditSlice;
};

type CreditUsageTypeAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<UsageTypeDateBucket>;
};

const creditSubAggs = {
  total_cost: { sum: { field: "cost.billable_awu" } },
} satisfies Record<string, estypes.AggregationsAggregationContainer>;

function totalCreditsFromSlice(slice: CreditSlice): number {
  return Math.round(slice.total_cost?.value ?? 0);
}

function groupFieldFor(
  groupBy: CreditBreakdownBy
):
  | "agent_id"
  | "user_id"
  | "context_origin"
  | "api_key_name"
  | typeof MODEL_ID_FIELD {
  switch (groupBy) {
    case "agent":
      return "agent_id";
    case "user":
      return "user_id";
    case "origin":
      return "context_origin";
    case "api_key":
      return "api_key_name";
    case "model":
      return MODEL_ID_FIELD;
    default:
      return assertNever(groupBy);
  }
}

// api_key_name is only set on API-key authenticated messages. Instead of
// dropping the other messages (exists filter), bucket them under a "Not API"
// group via the terms-agg `missing` value so the series still sums to the
// total consumption.
function groupTermsAggFor(
  groupBy: CreditBreakdownBy
): estypes.AggregationsTermsAggregation {
  const terms: estypes.AggregationsTermsAggregation = {
    field: groupFieldFor(groupBy),
  };
  if (groupBy === "api_key") {
    terms.missing = NOT_API_GROUP_KEY;
    terms.value_type = "string";
  }
  return terms;
}

function fallbackGroupName(
  groupBy: Exclude<CreditBreakdownBy, "agent">
): string {
  switch (groupBy) {
    case "user":
      return "Programmatic usage";
    case "origin":
      return "Unknown source";
    case "api_key":
      return "Unknown API key";
    case "model":
      return "Unknown model";
    default:
      return assertNever(groupBy);
  }
}

async function resolveGroupNames(
  auth: Authenticator,
  groupBy: CreditBreakdownBy,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  switch (groupBy) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, ids);
      return new Map(
        Array.from(labels, ([agentId, label]) => [agentId, label.name])
      );
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
    case "origin":
      // Match the chart's user-facing source labels (e.g. web -> Conversation),
      // falling back to the raw origin for anything unlabeled.
      return new Map(ids.map((id) => [id, sourceLabelForOrigin(id) ?? id]));
    case "api_key":
      // The group key is already the key's display name; only the sentinel
      // bucket for non-API messages needs a label.
      return new Map(
        ids.map((id) => [
          id,
          id === NOT_API_GROUP_KEY ? NOT_API_GROUP_NAME : id,
        ])
      );
    case "model":
      // The group key is the resolved model id; fall back to the raw id for
      // models that are no longer part of the catalog.
      return new Map(
        ids.map((id) => [id, getModelConfigByModelId(id)?.displayName ?? id])
      );
    default:
      return assertNever(groupBy);
  }
}

// Date histogram for the credit timeseries. When `fillWindow` is set, empty
// buckets are emitted across the whole [startDate, endDate] window so the
// series spans the full range instead of collapsing to days with data.
function buildCreditDateHistogram({
  granularity,
  timezone,
  startDate,
  endDate,
  fillWindow,
}: {
  granularity: "day" | "week" | "month";
  timezone: string;
  startDate: string;
  endDate: string;
  fillWindow?: boolean;
}): estypes.AggregationsAggregationContainer["date_histogram"] {
  const dateHistogram: estypes.AggregationsAggregationContainer["date_histogram"] =
    {
      field: "timestamp",
      calendar_interval: granularity,
      time_zone: timezone,
    };
  if (!fillWindow) {
    return dateHistogram;
  }
  return {
    ...dateHistogram,
    min_doc_count: 0,
    extended_bounds: {
      min: new Date(startDate).getTime(),
      max: new Date(endDate).getTime(),
    },
  };
}

// Sums the per-message billed AWU credits (cost.billable_awu) precomputed at index
// time with the billing pipeline's conversion. Still an estimate vs the billed
// figure on the usage page (indexing lag, docs indexed before the cost fields
// shipped). Groups are ranked exactly by cost.billable_awu inside ES.
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
    apiKeyNames,
    agentTagIds,
    modelIds,
  }: {
    startDate: string;
    endDate: string;
    limit: number;
    groupBy: CreditGroupBy;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    apiKeyNames?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
  }
): Promise<Result<CreditUsageResult, ElasticsearchError>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    { ...creditSubAggs };
  if (groupBy !== "none") {
    aggregations.by_group = {
      terms: {
        ...groupTermsAggFor(groupBy),
        size: limit,
        order: { total_cost: "desc" },
      },
      aggs: { ...creditSubAggs },
    };
  }

  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
    extraFilters:
      // api_key buckets missing values under "Not API" instead of dropping
      // them, so the rows keep summing to the total.
      groupBy === "none" || groupBy === "api_key"
        ? []
        : [{ exists: { field: groupFieldFor(groupBy) } }],
  });

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

  const rows: CreditUsageRow[] = ranked.flatMap((row) => {
    const name = namesById.get(row.groupKey);
    if (groupBy === "agent") {
      return name ? [{ ...row, name }] : [];
    }
    return [{ ...row, name: name ?? fallbackGroupName(groupBy) }];
  });

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
    apiKeyNames,
    agentTagIds,
    modelIds,
    fillWindow,
  }: {
    startDate: string;
    endDate: string;
    granularity: "day" | "week" | "month";
    timezone: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    apiKeyNames?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
    fillWindow?: boolean;
  }
): Promise<Result<CreditTimeseriesPoint[], ElasticsearchError>> {
  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
  });

  const result = await searchAnalytics<never, CreditTimeseriesAggs>(query, {
    aggregations: {
      by_date: {
        date_histogram: buildCreditDateHistogram({
          granularity,
          timezone,
          startDate,
          endDate,
          fillWindow,
        }),
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

// Credits over time split by usage type: Programmatic (API key / programmatic
// origin, per getProgrammaticUsageFilterClause) vs User (everything else).
// usage_type isn't a stored field, so it's derived with filter sub-aggs. Free
// usage is already out of scope, so the two series partition the total. Same
// source and scope as fetchCreditTimeseries.
export async function fetchCreditTimeseriesByUsageType(
  auth: Authenticator,
  {
    startDate,
    endDate,
    granularity,
    timezone,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
    fillWindow,
  }: {
    startDate: string;
    endDate: string;
    granularity: "day" | "week" | "month";
    timezone: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    apiKeyNames?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
    fillWindow?: boolean;
  }
): Promise<Result<CreditUsageTypePoint[], ElasticsearchError>> {
  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
  });

  const programmaticFilter = getProgrammaticUsageFilterClause();

  const result = await searchAnalytics<never, CreditUsageTypeAggs>(query, {
    aggregations: {
      by_date: {
        date_histogram: buildCreditDateHistogram({
          granularity,
          timezone,
          startDate,
          endDate,
          fillWindow,
        }),
        aggs: {
          programmatic: {
            filter: programmaticFilter,
            aggs: { ...creditSubAggs },
          },
          user: {
            filter: { bool: { must_not: [programmaticFilter] } },
            aggs: { ...creditSubAggs },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<UsageTypeDateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(
    buckets.map((bucket) => ({
      timestamp: bucket.key,
      date: formatDateFromMillis(bucket.key, timezone),
      userCredits: totalCreditsFromSlice(bucket.user ?? {}),
      programmaticCredits: totalCreditsFromSlice(bucket.programmatic ?? {}),
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
    apiKeyNames,
    agentTagIds,
    modelIds,
    fillWindow,
  }: {
    startDate: string;
    endDate: string;
    granularity: "day" | "week" | "month";
    timezone: string;
    breakdownBy: CreditBreakdownBy;
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    apiKeyNames?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
    fillWindow?: boolean;
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
    apiKeyNames,
    agentTagIds,
    modelIds,
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
  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
  });

  const result = await searchAnalytics<never, CreditTimeseriesBreakdownAggs>(
    query,
    {
      aggregations: {
        by_date: {
          date_histogram: buildCreditDateHistogram({
            granularity,
            timezone,
            startDate,
            endDate,
            fillWindow,
          }),
          aggs: {
            ...creditSubAggs,
            by_group: {
              terms: {
                ...groupTermsAggFor(breakdownBy),
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
