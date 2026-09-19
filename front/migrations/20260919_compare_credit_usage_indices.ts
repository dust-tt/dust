/**
 * Compare the credit dashboards' aggregations between the legacy
 * `front.agent_message_analytics` index and the consumption
 * `front.agent_message_consumption_analytics` index they were migrated to.
 *
 * Both sides are built here rather than imported so the legacy queries stay out
 * of runtime code. They mirror the five fetchers in
 * `lib/api/assistant/observability/credit_usage.ts`: the window total, the
 * per-dimension ranking, the timeseries, the usage-type split and the top
 * conversations. Dashboard filters are not exercised: the comparison runs the
 * unfiltered workspace scope, which is what the charts load by default.
 *
 * Known sources of divergence, which this script is meant to quantify:
 * - the legacy index recomputes `cost.billable_awu` at index time, while
 *   `credit_micro` reconciles to the authoritative billed charge;
 * - the legacy index holds every message, the consumption index only billed
 *   consumption, and it skips messages whose attribution fails reconciliation;
 * - the usage-type split moves from a heuristic over `auth_method` /
 *   `context_origin` / `user_id` to the stored `usage_type` field.
 *
 * npx tsx migrations/20260919_compare_credit_usage_indices.ts \
 *   --workspaceId <wId> [--days 30] [--timezone UTC] [--limit 10]
 */
import {
  COMPLETED_AT_FIELD,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_CREDIT_GROUP_FIELDS,
  daysToInstantRange,
  NOT_API_GROUP_KEY,
} from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { getProgrammaticUsageFilterClause } from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import { FREE_ORIGINS } from "@app/lib/metronome/events";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

const DIMENSIONS = ["agent", "user", "origin", "api_key", "model"] as const;

type Dimension = (typeof DIMENSIONS)[number];

const LEGACY_GROUP_FIELDS: Record<Dimension, string> = {
  agent: "agent_id",
  user: "user_id",
  origin: "context_origin",
  api_key: "api_key_name",
  model: "model.model_id",
};

// The consumption module's analytics convention for the agent dimension, which
// rolls hidden helper agents up to their user-facing parent. The migration
// deliberately kept `agent.id` to preserve the legacy grouping; this field is
// reported alongside so the cost of adopting the convention is visible.
const ATTRIBUTED_AGENT_ID_FIELD = "agent.attributed_id";

type CreditSlice = {
  total_cost?: estypes.AggregationsSumAggregate;
};

type GroupBucket = CreditSlice & { key: string };

type DateBucket = CreditSlice & { key: number };

type UsageTypeDateBucket = {
  key: number;
  programmatic?: CreditSlice;
  user?: CreditSlice;
};

type TotalsAggs = CreditSlice;

type GroupedAggs = { by_group?: { buckets: GroupBucket[] } };

type TimeseriesAggs = { by_date?: { buckets: DateBucket[] } };

type UsageTypeAggs = { by_date?: { buckets: UsageTypeDateBucket[] } };

type Search = <TAggregations>(
  query: estypes.QueryDslQueryContainer,
  options: {
    aggregations: Record<string, estypes.AggregationsAggregationContainer>;
    size: number;
  }
) => Promise<
  Result<estypes.SearchResponse<never, TAggregations>, ElasticsearchError>
>;

type Dialect = {
  name: "legacy" | "consumption";
  creditField: string;
  // Divides the raw Elasticsearch sum into credits.
  divisor: number;
  dateField: string;
  groupFields: Record<Dimension, string>;
  programmaticFilter: estypes.QueryDslQueryContainer;
  scope: estypes.QueryDslQueryContainer;
  search: Search;
};

function scopeQuery({
  workspaceId,
  dateField,
  startDate,
  endDate,
}: {
  workspaceId: string;
  dateField: string;
  startDate: string;
  endDate: string;
}): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { range: { [dateField]: { gte: startDate, lte: endDate } } },
      ],
      must_not: [{ terms: { context_origin: [...FREE_ORIGINS] } }],
    },
  };
}

function buildDialects({
  workspaceId,
  startDate,
  endDate,
}: {
  workspaceId: string;
  startDate: string;
  endDate: string;
}): [Dialect, Dialect] {
  return [
    {
      name: "legacy",
      creditField: "cost.billable_awu",
      divisor: 1,
      dateField: "timestamp",
      groupFields: LEGACY_GROUP_FIELDS,
      programmaticFilter: getProgrammaticUsageFilterClause(),
      scope: scopeQuery({
        workspaceId,
        dateField: "timestamp",
        startDate,
        endDate,
      }),
      search: searchAnalytics,
    },
    {
      name: "consumption",
      creditField: CREDIT_MICRO_FIELD,
      divisor: MICRO_CREDITS_PER_CREDIT,
      dateField: COMPLETED_AT_FIELD,
      groupFields: CONSUMPTION_CREDIT_GROUP_FIELDS,
      programmaticFilter: { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
      scope: scopeQuery({
        workspaceId,
        dateField: COMPLETED_AT_FIELD,
        startDate,
        endDate,
      }),
      search: searchConsumptionAnalytics,
    },
  ];
}

function creditsFromSlice(dialect: Dialect, slice: CreditSlice): number {
  return Math.round((slice.total_cost?.value ?? 0) / dialect.divisor);
}

function creditSubAggs(
  dialect: Dialect
): Record<string, estypes.AggregationsAggregationContainer> {
  return { total_cost: { sum: { field: dialect.creditField } } };
}

async function runAggregation<TAggregations>(
  dialect: Dialect,
  aggregations: Record<string, estypes.AggregationsAggregationContainer>
): Promise<TAggregations> {
  const result = await dialect.search<TAggregations>(dialect.scope, {
    aggregations,
    size: 0,
  });
  if (result.isErr()) {
    throw new Error(
      `[${dialect.name}] Elasticsearch query failed: ${result.error.message}`
    );
  }
  return (result.value.aggregations ?? {}) as TAggregations;
}

async function fetchTotalCredits(dialect: Dialect): Promise<number> {
  const aggs = await runAggregation<TotalsAggs>(
    dialect,
    creditSubAggs(dialect)
  );
  return creditsFromSlice(dialect, aggs);
}

async function fetchGroupedCredits(
  dialect: Dialect,
  field: string,
  limit: number,
  { missing }: { missing?: string } = {}
): Promise<Map<string, number>> {
  const terms: estypes.AggregationsTermsAggregation = {
    field,
    size: limit,
    order: { total_cost: "desc" },
  };
  if (missing !== undefined) {
    terms.missing = missing;
    terms.value_type = "string";
  }
  const aggs = await runAggregation<GroupedAggs>(dialect, {
    by_group: { terms, aggs: creditSubAggs(dialect) },
  });
  return new Map(
    bucketsToArray<GroupBucket>(aggs.by_group?.buckets).map((bucket) => [
      String(bucket.key),
      creditsFromSlice(dialect, bucket),
    ])
  );
}

async function fetchTimeseries(
  dialect: Dialect,
  timezone: string
): Promise<Map<number, number>> {
  const aggs = await runAggregation<TimeseriesAggs>(dialect, {
    by_date: {
      date_histogram: {
        field: dialect.dateField,
        calendar_interval: "day",
        time_zone: timezone,
      },
      aggs: creditSubAggs(dialect),
    },
  });
  return new Map(
    bucketsToArray<DateBucket>(aggs.by_date?.buckets).map((bucket) => [
      bucket.key,
      creditsFromSlice(dialect, bucket),
    ])
  );
}

async function fetchUsageTypeSplit(
  dialect: Dialect,
  timezone: string
): Promise<Map<number, { programmaticCredits: number; userCredits: number }>> {
  const aggs = await runAggregation<UsageTypeAggs>(dialect, {
    by_date: {
      date_histogram: {
        field: dialect.dateField,
        calendar_interval: "day",
        time_zone: timezone,
      },
      aggs: {
        programmatic: {
          filter: dialect.programmaticFilter,
          aggs: creditSubAggs(dialect),
        },
        user: {
          filter: { bool: { must_not: [dialect.programmaticFilter] } },
          aggs: creditSubAggs(dialect),
        },
      },
    },
  });
  return new Map(
    bucketsToArray<UsageTypeDateBucket>(aggs.by_date?.buckets).map((bucket) => [
      bucket.key,
      {
        programmaticCredits: creditsFromSlice(
          dialect,
          bucket.programmatic ?? {}
        ),
        userCredits: creditsFromSlice(dialect, bucket.user ?? {}),
      },
    ])
  );
}

type SeriesDelta = {
  comparedKeys: number;
  keysOnlyInLegacy: string[];
  keysOnlyInConsumption: string[];
  maxAbsoluteDelta: number;
  legacyCredits: number;
  consumptionCredits: number;
  worstKeys: {
    key: string;
    legacyCredits: number;
    consumptionCredits: number;
  }[];
};

const WORST_KEYS_LIMIT = 5;

function compareSeries(
  legacy: Map<string | number, number>,
  consumption: Map<string | number, number>
): SeriesDelta {
  const keys = new Set([...legacy.keys(), ...consumption.keys()]);
  const rows = [...keys].map((key) => ({
    key: String(key),
    legacyCredits: legacy.get(key) ?? 0,
    consumptionCredits: consumption.get(key) ?? 0,
  }));
  const worst = [...rows].sort(
    (a, b) =>
      Math.abs(b.consumptionCredits - b.legacyCredits) -
      Math.abs(a.consumptionCredits - a.legacyCredits)
  );

  return {
    comparedKeys: keys.size,
    keysOnlyInLegacy: rows
      .filter((row) => !consumption.has(row.key))
      .map((row) => row.key),
    keysOnlyInConsumption: rows
      .filter((row) => !legacy.has(row.key))
      .map((row) => row.key),
    maxAbsoluteDelta: worst.length
      ? Math.abs(worst[0].consumptionCredits - worst[0].legacyCredits)
      : 0,
    legacyCredits: rows.reduce((sum, row) => sum + row.legacyCredits, 0),
    consumptionCredits: rows.reduce(
      (sum, row) => sum + row.consumptionCredits,
      0
    ),
    worstKeys: worst.slice(0, WORST_KEYS_LIMIT),
  };
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
    days: {
      default: 30,
      description: "Length of the comparison window, in days.",
      type: "number" as const,
    },
    timezone: {
      default: "UTC",
      description: "Timezone used to bucket the timeseries.",
      type: "string" as const,
    },
    limit: {
      default: 10,
      description: "Number of groups ranked per dimension.",
      type: "number" as const,
    },
  },
  async ({ workspaceId, days, timezone, limit }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    // Resolves the workspace the same way the dashboards do, and fails early if
    // the script is pointed at a workspace it cannot read.
    await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { startDate, endDate } = daysToInstantRange(days, timezone);
    const [legacy, consumption] = buildDialects({
      workspaceId: workspace.sId,
      startDate,
      endDate,
    });

    const [legacyTotalCredits, consumptionTotalCredits] = await Promise.all([
      fetchTotalCredits(legacy),
      fetchTotalCredits(consumption),
    ]);

    const byDimension: Record<string, SeriesDelta> = {};
    for (const dimension of DIMENSIONS) {
      // `api_key` buckets messages without a key under the sentinel instead of
      // dropping them, matching `groupTermsAggFor`.
      const missing = dimension === "api_key" ? NOT_API_GROUP_KEY : undefined;
      const [legacyGroups, consumptionGroups] = await Promise.all([
        fetchGroupedCredits(legacy, legacy.groupFields[dimension], limit, {
          missing,
        }),
        fetchGroupedCredits(
          consumption,
          consumption.groupFields[dimension],
          limit,
          { missing }
        ),
      ]);
      byDimension[dimension] = compareSeries(legacyGroups, consumptionGroups);
    }

    // How much the agent ranking would move by adopting the consumption
    // module's `agent.attributed_id` convention instead of `agent.id`.
    const attributedAgentGroups = await fetchGroupedCredits(
      consumption,
      ATTRIBUTED_AGENT_ID_FIELD,
      limit
    );
    const agentAttributionDelta = compareSeries(
      await fetchGroupedCredits(
        consumption,
        consumption.groupFields.agent,
        limit
      ),
      attributedAgentGroups
    );

    const [legacySeries, consumptionSeries] = await Promise.all([
      fetchTimeseries(legacy, timezone),
      fetchTimeseries(consumption, timezone),
    ]);

    const [legacySplit, consumptionSplit] = await Promise.all([
      fetchUsageTypeSplit(legacy, timezone),
      fetchUsageTypeSplit(consumption, timezone),
    ]);

    const [legacyConversations, consumptionConversations] = await Promise.all([
      fetchGroupedCredits(legacy, "conversation_id", limit),
      fetchGroupedCredits(consumption, "conversation_id", limit),
    ]);

    const summary = {
      workspaceId: workspace.sId,
      startDate,
      endDate,
      limit,
      total: {
        legacyCredits: legacyTotalCredits,
        consumptionCredits: consumptionTotalCredits,
        delta: consumptionTotalCredits - legacyTotalCredits,
      },
      byDimension,
      agentAttributionDelta,
      timeseries: compareSeries(legacySeries, consumptionSeries),
      usageTypeSplit: {
        programmatic: compareSeries(
          new Map(
            [...legacySplit].map(([key, value]) => [
              key,
              value.programmaticCredits,
            ])
          ),
          new Map(
            [...consumptionSplit].map(([key, value]) => [
              key,
              value.programmaticCredits,
            ])
          )
        ),
        user: compareSeries(
          new Map([...legacySplit].map(([key, v]) => [key, v.userCredits])),
          new Map([...consumptionSplit].map(([key, v]) => [key, v.userCredits]))
        ),
      },
      topConversations: compareSeries(
        legacyConversations,
        consumptionConversations
      ),
    };

    if (legacyTotalCredits !== consumptionTotalCredits) {
      logger.warn(summary, "Credit usage differs between indices");
      return;
    }
    logger.info(summary, "Credit usage matches between indices");
  }
);
