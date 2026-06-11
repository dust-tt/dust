import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import {
  awuFromMicroUsd,
  FREE_ORIGINS,
  getToolCategory,
  isFreeToolServer,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export type CreditGroupBy = "agent" | "user" | "none";

export type CreditUsageRow = {
  groupKey: string;
  name: string;
  llmCredits: number;
  toolCredits: number;
  totalCredits: number;
};

export type CreditUsageResult = {
  llmCredits: number;
  toolCredits: number;
  totalCredits: number;
  rows: CreditUsageRow[];
};

export type CreditTimeseriesPoint = {
  timestamp: number;
  date: string;
  llmCredits: number;
  toolCredits: number;
  totalCredits: number;
};

type ServerBucket = { key: string; doc_count: number };

type ToolsNestedAgg = {
  by_server?: estypes.AggregationsMultiBucketAggregateBase<ServerBucket>;
};

// The LLM-cost + tool-usage aggregations from which one slice's credits are
// computed. Shared by the workspace totals, the per-group buckets, and the
// per-date histogram buckets so all of them convert credits identically.
type CreditSlice = {
  llm_cost?: estypes.AggregationsSumAggregate;
  tools?: ToolsNestedAgg;
};

type GroupBucket = CreditSlice & { key: string };

type DateCreditBucket = CreditSlice & { key: number };

type CreditUsageAggs = CreditSlice & {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

type CreditTimeseriesAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<DateCreditBucket>;
};

// Total credits (LLM + tool) cannot be ordered on inside a single ES terms
// aggregation, so we overfetch the most active groups, compute credits for each,
// then rank in JS. This caps how many groups we pull before ranking; workspaces
// with more distinct agents/users than this fall back to an approximate top-N.
const CREDIT_RANKING_FETCH = 500;

const toolsNestedAgg: estypes.AggregationsAggregationContainer = {
  nested: { path: "tools_used" },
  aggs: {
    by_server: {
      terms: { field: "tools_used.server_name", size: 100 },
    },
  },
};

function toolCreditsFromServerBuckets(buckets: ServerBucket[]): number {
  return buckets.reduce((total, bucket) => {
    if (isFreeToolServer(bucket.key)) {
      return total;
    }
    return (
      total +
      TOOL_CATEGORY_AWU_WEIGHTS[getToolCategory(bucket.key)] * bucket.doc_count
    );
  }, 0);
}

const creditSubAggs = {
  llm_cost: { sum: { field: "tokens.cost_micro_usd" } },
  tools: toolsNestedAgg,
} satisfies Record<string, estypes.AggregationsAggregationContainer>;

function creditsFromSlice(slice: CreditSlice): {
  llmCredits: number;
  toolCredits: number;
  totalCredits: number;
} {
  const llmCredits = awuFromMicroUsd(slice.llm_cost?.value ?? 0);
  const toolCredits = toolCreditsFromServerBuckets(
    bucketsToArray<ServerBucket>(slice.tools?.by_server?.buckets)
  );
  return { llmCredits, toolCredits, totalCredits: llmCredits + toolCredits };
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

// Estimates AWU credit consumption from the analytics index, reusing the same
// conversion as the Metronome billing pipeline: LLM credits from
// tokens.cost_micro_usd (markup baked in) and tool credits from per-category
// weights over executed tools. This is an ESTIMATE — costs are aggregated and
// rounded, and per-group rows are rounded independently so they may not sum
// exactly to the workspace total. The billed figure lives on the usage page.
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
        size: Math.max(limit, CREDIT_RANKING_FETCH),
        order: { _count: "desc" },
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

  const { llmCredits, toolCredits, totalCredits } = creditsFromSlice(
    aggs ?? {}
  );

  if (groupBy === "none") {
    return new Ok({ llmCredits, toolCredits, totalCredits, rows: [] });
  }

  const buckets = bucketsToArray<GroupBucket>(aggs?.by_group?.buckets);

  const ranked = buckets
    .map((bucket) => ({
      groupKey: String(bucket.key),
      ...creditsFromSlice(bucket),
    }))
    .sort((a, b) => b.totalCredits - a.totalCredits)
    .slice(0, limit);

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

  return new Ok({ llmCredits, toolCredits, totalCredits, rows });
}

// Estimated AWU credits bucketed over time (the trend behind get_credit_usage's
// totals). Same conversion and non-free scope as fetchCreditUsage; per-bucket
// values are rounded independently so they need not sum to a window total.
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
      ...creditsFromSlice(bucket),
    }))
  );
}
