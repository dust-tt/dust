import type {
  ConsumptionFacetCatalog,
  ConsumptionFacetCatalogEntry,
} from "@app/lib/api/analytics/consumption/facet_catalog";
import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionFacetScope,
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_DIMENSION_FILTER_KEYS,
  CONSUMPTION_SCOPE_DIMENSIONS,
  TRIGGER_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import tracer from "@app/logger/tracer";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

// The workspace catalog includes selectable entities that have never generated
// consumption. Period-scoped buckets supplement it with historical values after
// users, agents, or skills are deleted.
const FACET_COMPOSITE_PAGE_SIZE = 1_000;
const FACET_ES_QUERY_CONCURRENCY = 6;

function facetScopeFilters(
  scope: ConsumptionFacetScope
): estypes.QueryDslQueryContainer[] {
  switch (scope) {
    case "all":
      return [];
    case "automations":
      return [{ exists: { field: TRIGGER_ID_FIELD } }];
    default:
      return assertNever(scope);
  }
}

const EMPTY_FACET_CATALOG: ConsumptionFacetCatalog = {
  agent: [],
  user: [],
  api_key: [],
  group: [],
  model: [],
  tool: [],
  skill: [],
  source: [],
};

export type ConsumptionFacet = {
  value: string;
  label: string;
  pictureUrl: string | null;
  icon?: string | null;
  documentCount: number;
  disabled: boolean;
};

export type ConsumptionAgentFacet = ConsumptionFacet & {
  scope?: AgentConfigurationScope;
};

export type ConsumptionModelFacet = ConsumptionFacet & {
  maker?: ModelMakerIdType;
  tier?: ModelsTierName;
};

export type ConsumptionFacets = {
  period: ConsumptionPeriod;
  facets: {
    agent: ConsumptionAgentFacet[];
    user: ConsumptionFacet[];
    api_key: ConsumptionFacet[];
    group: ConsumptionFacet[];
    model: ConsumptionModelFacet[];
    tool: ConsumptionFacet[];
    skill: ConsumptionFacet[];
    source: ConsumptionFacet[];
  };
};

export type GetConsumptionFacetsResponse = ConsumptionFacets;

type FacetBuckets = {
  contextual: Map<string, number>;
};

type CompositeFacetBucket = {
  key: { value: string };
  contextual?: estypes.AggregationsSingleBucketAggregateBase;
};

type CompositeFacetAggregations = {
  values?: estypes.AggregationsCompositeAggregate & {
    buckets: CompositeFacetBucket[];
    after_key?: { value: string };
  };
};

function filterWithoutDimension(
  filter: ConsumptionScopeFilter,
  dimension: ConsumptionScopeDimension
): ConsumptionScopeFilter {
  const filterKey = CONSUMPTION_DIMENSION_FILTER_KEYS[dimension];
  return { ...filter, [filterKey]: undefined };
}

type FetchDimensionFacetBucketsArgs = {
  auth: Authenticator;
  period: ConsumptionPeriod;
  filter: ConsumptionScopeFilter;
  userId?: string;
  agentId?: string;
  dimension: ConsumptionScopeDimension;
  scopeFilters: estypes.QueryDslQueryContainer[];
};

async function fetchDimensionFacetBuckets(
  args: FetchDimensionFacetBucketsArgs
): Promise<Result<FacetBuckets, ElasticsearchError>> {
  const { dimension } = args;
  return tracer.trace(
    "analytics.consumption.facets.fetch_buckets",
    { resource: dimension },
    async (span) => {
      span?.setTag("facet.dimension", dimension);
      const result = await fetchDimensionFacetBucketsWithoutTracing(args);
      if (result.isErr()) {
        span?.setTag("error", result.error);
      } else {
        span?.setTag("facet.bucket_count", result.value.contextual.size);
      }
      return result;
    }
  );
}

async function fetchDimensionFacetBucketsWithoutTracing({
  auth,
  period,
  filter,
  userId,
  agentId,
  dimension,
  scopeFilters,
}: FetchDimensionFacetBucketsArgs): Promise<
  Result<FacetBuckets, ElasticsearchError>
> {
  const scopeFilter = {
    ...(userId ? { users: [userId] } : {}),
    ...(agentId ? { agents: [agentId] } : {}),
  };
  const contextual = new Map<string, number>();
  let afterKey: { value: string } | undefined;

  while (true) {
    const result = await searchConsumptionAnalytics<
      never,
      CompositeFacetAggregations
    >(
      buildConsumptionScopeQuery({
        auth,
        startDate: period.startDate,
        endDate: period.endDate,
        filter: scopeFilter,
        extraFilters: scopeFilters,
      }),
      {
        aggregations: {
          values: {
            composite: {
              size: FACET_COMPOSITE_PAGE_SIZE,
              sources: [
                {
                  value: {
                    terms: {
                      field: CONSUMPTION_DIMENSION_FIELDS[dimension],
                    },
                  },
                },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: {
              contextual: {
                filter: buildConsumptionScopeQuery({
                  auth,
                  startDate: period.startDate,
                  endDate: period.endDate,
                  filter: {
                    ...filterWithoutDimension(filter, dimension),
                    ...scopeFilter,
                  },
                  extraFilters: scopeFilters,
                }),
              },
            },
          },
        },
        size: 0,
      }
    );
    if (result.isErr()) {
      return new Err(result.error);
    }

    const aggregation = result.value.aggregations?.values;
    const page = bucketsToArray<CompositeFacetBucket>(aggregation?.buckets);
    for (const bucket of page) {
      const value = String(bucket.key.value);
      contextual.set(value, bucket.contextual?.doc_count ?? 0);
    }

    afterKey = aggregation?.after_key;
    if (!afterKey || page.length === 0) {
      break;
    }
  }

  return new Ok({ contextual });
}

async function resolveFacets(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  buckets: FacetBuckets,
  catalogEntries: ConsumptionFacetCatalogEntry[]
): Promise<
  Array<
    ConsumptionFacet &
      Pick<ConsumptionFacetCatalogEntry, "scope" | "maker" | "tier">
  >
> {
  const catalogByValue = new Map(
    catalogEntries.map((entry) => [entry.value, entry])
  );
  const historicalValues = [...buckets.contextual.keys()];
  const missingCatalogValues = historicalValues.filter(
    (value) => !catalogByValue.has(value)
  );
  const resolvedLabels = await tracer.trace(
    "analytics.consumption.facets.resolve_labels",
    { resource: dimension },
    async (span) => {
      span?.setTag("facet.dimension", dimension);
      span?.setTag(
        "facet.missing_catalog_value_count",
        missingCatalogValues.length
      );
      return resolveDimensionLabels(auth, dimension, missingCatalogValues);
    }
  );
  const entries = [
    ...catalogEntries,
    ...missingCatalogValues.map((value) => {
      const resolved = resolvedLabels.get(value);
      return {
        value,
        label: resolved?.name ?? value,
        pictureUrl: resolved?.pictureUrl ?? null,
        ...(resolved?.icon !== undefined ? { icon: resolved.icon } : {}),
        ...(resolved?.scope ? { scope: resolved.scope } : {}),
        ...(resolved?.maker ? { maker: resolved.maker } : {}),
        ...(resolved?.tier ? { tier: resolved.tier } : {}),
      };
    }),
  ];

  return entries
    .map((entry) => {
      const { value } = entry;
      const documentCount = buckets.contextual.get(value) ?? 0;
      return {
        ...entry,
        value,
        documentCount,
        disabled: documentCount === 0,
      };
    })
    .sort(
      (left, right) =>
        Number(left.disabled) - Number(right.disabled) ||
        left.label.localeCompare(right.label)
    );
}

async function resolveRequestedFacets(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  bucketsByDimension: ReadonlyMap<ConsumptionScopeDimension, FacetBuckets>,
  catalogEntries: ConsumptionFacetCatalogEntry[]
) {
  const buckets = bucketsByDimension.get(dimension);
  if (!buckets) {
    return [];
  }

  return resolveFacets(auth, dimension, buckets, catalogEntries);
}

/**
 * Lists current and historical consumption facets, marking whether each can
 * return a document in the selected context. Each facet applies all active
 * filters except its own dimension, so choosing one value never hides its
 * siblings. Available facets come first, with each availability group sorted
 * alphabetically by label.
 */
async function fetchConsumptionFacetsWithoutTracing(
  auth: Authenticator,
  {
    period,
    filter = {},
    scope = "all",
    dimensions,
    userId,
    agentId,
  }: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
    scope?: ConsumptionFacetScope;
    dimensions?: ConsumptionScopeDimension[];
    userId?: string;
    agentId?: string;
  }
): Promise<Result<ConsumptionFacets, ElasticsearchError>> {
  const requestedDimensions = dimensions ?? [...CONSUMPTION_SCOPE_DIMENSIONS];
  const scopeFilters = facetScopeFilters(scope);
  const bucketResults = await concurrentExecutor(
    requestedDimensions,
    async (dimension) => ({
      dimension,
      result: await fetchDimensionFacetBuckets({
        auth,
        period,
        filter,
        userId,
        agentId,
        dimension,
        scopeFilters,
      }),
    }),
    { concurrency: FACET_ES_QUERY_CONCURRENCY }
  );

  const bucketsByDimension = new Map<ConsumptionScopeDimension, FacetBuckets>();
  for (const { dimension, result } of bucketResults) {
    if (result.isErr()) {
      return result;
    }
    bucketsByDimension.set(dimension, result.value);
  }

  const catalog =
    userId || agentId
      ? EMPTY_FACET_CATALOG
      : await listConsumptionFacetCatalog(auth, requestedDimensions);
  // TODO(2026-08-11 OBSERVABILITY): Historical label resolution still reads
  // from several database-backed resources. Store the relevant labels in the
  // consumption index so these lookups can stay within Elasticsearch.
  const agentFacets = await resolveRequestedFacets(
    auth,
    "agent",
    bucketsByDimension,
    catalog.agent
  );
  const userFacets = await resolveRequestedFacets(
    auth,
    "user",
    bucketsByDimension,
    catalog.user
  );
  const apiKeyFacets = await resolveRequestedFacets(
    auth,
    "api_key",
    bucketsByDimension,
    catalog.api_key
  );
  const groupFacets = await resolveRequestedFacets(
    auth,
    "group",
    bucketsByDimension,
    catalog.group
  );
  const modelFacets = await resolveRequestedFacets(
    auth,
    "model",
    bucketsByDimension,
    catalog.model
  );
  const toolFacets = await resolveRequestedFacets(
    auth,
    "tool",
    bucketsByDimension,
    catalog.tool
  );
  const skillFacets = await resolveRequestedFacets(
    auth,
    "skill",
    bucketsByDimension,
    catalog.skill
  );
  const sourceFacets = await resolveRequestedFacets(
    auth,
    "source",
    bucketsByDimension,
    catalog.source
  );

  return new Ok({
    period,
    facets: {
      agent: agentFacets,
      user: userFacets,
      api_key: apiKeyFacets,
      group: groupFacets,
      model: modelFacets,
      tool: toolFacets,
      skill: skillFacets,
      source: sourceFacets,
    },
  });
}

export async function fetchConsumptionFacets(
  auth: Authenticator,
  input: {
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
    scope?: ConsumptionFacetScope;
    dimensions?: ConsumptionScopeDimension[];
    userId?: string;
    agentId?: string;
  }
): Promise<Result<ConsumptionFacets, ElasticsearchError>> {
  return tracer.trace("analytics.consumption.facets", async (span) => {
    // This endpoint has too little traffic to reliably survive service-level
    // head sampling, but its traces are needed to diagnose slow facet loads.
    span?.setTag("manual.keep", true);
    span?.setTag("workspace.id", auth.getNonNullableWorkspace().sId);
    const result = await fetchConsumptionFacetsWithoutTracing(auth, input);
    if (result.isErr()) {
      span?.setTag("error", result.error);
    }
    return result;
  });
}
