import type { AutomationTriggersFilter } from "@app/lib/api/analytics/automations/schema";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  CONVERSATION_ID_FIELD,
  CREDIT_MICRO_FIELD,
  TRIGGER_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import type {
  TriggerExecutionMode,
  TriggerKind,
  TriggerStatus,
} from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/types/resources_icon_names";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

export type AutomationTriggerRow = {
  triggerId: string;
  name: string;
  kind: TriggerKind;
  status: TriggerStatus;
  agent: {
    agentId: string;
    name: string;
    pictureUrl: string | null;
    description: string | null;
    modelId: string | null;
    modelDisplayName: string | null;
  };
  editor: {
    name: string;
    email: string | null;
    pictureUrl: string | null;
  };
  scheduleDescription: string | null;
  webhookSourceName: string | null;
  webhookSourceRestricted: boolean;
  webhookIcon: InternalAllowedIconType | CustomResourceIconType | null;
  runCount: number;
  credits: number;
  executionMode: TriggerExecutionMode;
};

export type AutomationTriggers = {
  period: ConsumptionPeriod;
  // Triggers that consumed over the period, approximate past
  // CARDINALITY_PRECISION_THRESHOLD.
  totalCount: number;
  triggers: AutomationTriggerRow[];
  // Median run count / cost per run across the ranked triggers that ran at
  // least once over the period, so a single row's breakdown can say how it
  // compares to the rest of the workspace's automations.
  medianRunCount: number;
  medianCostPerRun: number;
};

export type GetAutomationTriggersResponse = AutomationTriggers;

const CREDIT_AGG = "credit_micro";
const RUNS_AGG = "runs";
const TOTAL_COUNT_AGG = "total_count";

type TriggerBucket = {
  key: string;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [RUNS_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type TriggerAggs = {
  by_trigger?: estypes.AggregationsMultiBucketAggregateBase<TriggerBucket>;
  [TOTAL_COUNT_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type RankedTrigger = {
  triggerId: string;
  runCount: number;
  credits: number;
};

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Neither trigger kind nor execution mode is indexed in the consumption
 * Elasticsearch documents, so those filters are resolved to a concrete set of
 * trigger ids up front and applied as a terms filter on TRIGGER_ID_FIELD.
 * Returns null when neither filter is requested (no restriction).
 */
async function resolveTriggerIdsForTriggerAttributeFilters(
  auth: Authenticator,
  {
    kinds,
    executionModes,
  }: {
    kinds: TriggerKind[] | undefined;
    executionModes: TriggerExecutionMode[] | undefined;
  }
): Promise<string[] | null> {
  if (!kinds?.length && !executionModes?.length) {
    return null;
  }
  const triggers =
    await TriggerResource.listByWorkspaceAndKindsAndExecutionModes(auth, {
      kinds,
      executionModes,
    });
  return triggers.map((trigger) => trigger.sId);
}

/**
 * Trigger name isn't indexed in the consumption documents either, so a search
 * resolves to trigger ids the same way a kind filter does. Unlike the kind
 * filter it stays out of the query: the median baseline has to keep comparing a
 * row against every trigger that ran, not just the ones that matched.
 */
async function resolveTriggerIdsForSearch(
  auth: Authenticator,
  search: string | undefined
): Promise<Set<string> | null> {
  if (!search) {
    return null;
  }
  const triggers = await TriggerResource.listByWorkspaceAndNameSearch(
    auth,
    search
  );
  return new Set(triggers.map((trigger) => trigger.sId));
}

/**
 * The period's triggers ranked by gross credits, highest first. The
 * underlying terms aggregation is capped at CARDINALITY_PRECISION_THRESHOLD
 * buckets (the same approximation boundary used for the total trigger
 * count below), so both the requested page and the median baseline are
 * sliced/derived from that same, page-independent set — a trigger's stats
 * always compare against the full active set, never just the triggers
 * ranked ahead of it.
 */
export async function fetchTriggersRanking(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
    search,
    filter,
    consumptionScopeFilter = {},
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
    search?: string;
    filter?: AutomationTriggersFilter;
    consumptionScopeFilter?: ConsumptionScopeFilter;
  }
): Promise<
  Result<
    {
      ranking: RankedTrigger[];
      totalCount: number;
      medianRunCount: number;
      medianCostPerRun: number;
    },
    ElasticsearchError
  >
> {
  const scopeFilter: ConsumptionScopeFilter = { ...consumptionScopeFilter };
  if (filter?.agentIds?.length) {
    scopeFilter.agents = filter.agentIds;
  }
  if (filter?.editorIds?.length) {
    scopeFilter.users = filter.editorIds;
  }

  const triggerIdsForAttributeFilters =
    await resolveTriggerIdsForTriggerAttributeFilters(auth, {
      kinds: filter?.kinds,
      executionModes: filter?.executionModes,
    });
  const triggerIdsForSearch = await resolveTriggerIdsForSearch(auth, search);

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter: scopeFilter,
    extraFilters:
      triggerIdsForAttributeFilters !== null
        ? [{ terms: { [TRIGGER_ID_FIELD]: triggerIdsForAttributeFilters } }]
        : [],
  });

  const result = await searchConsumptionAnalytics<never, TriggerAggs>(query, {
    aggregations: {
      by_trigger: {
        terms: {
          field: TRIGGER_ID_FIELD,
          size: CARDINALITY_PRECISION_THRESHOLD,
          order: { [CREDIT_AGG]: "desc" },
        },
        aggs: {
          [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          // One trigger run is one conversation.
          [RUNS_AGG]: { cardinality: { field: CONVERSATION_ID_FIELD } },
        },
      },
      [TOTAL_COUNT_AGG]: {
        cardinality: {
          field: TRIGGER_ID_FIELD,
          precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
        },
      },
    },
    size: 0,
  });
  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<TriggerBucket>(
    result.value.aggregations?.by_trigger?.buckets
  );
  const ranked = buckets.map((bucket) => ({
    triggerId: String(bucket.key),
    runCount: bucket[RUNS_AGG]?.value ?? 0,
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
  }));
  // Triggers that never ran have nothing to compare a "how often" or "per
  // run cost" stat against, so the baseline only looks at the ones that did.
  const activeRanked = ranked.filter((r) => r.runCount > 0);
  const matched = triggerIdsForSearch
    ? ranked.filter((r) => triggerIdsForSearch.has(r.triggerId))
    : ranked;

  return new Ok({
    ranking: matched.slice(offset, offset + limit),
    // The cardinality aggregation counts the unsearched set, so a search takes
    // its count from the matched ranking instead. That count is exact, since
    // the ranking itself is unpaginated.
    totalCount: triggerIdsForSearch
      ? matched.length
      : Math.round(result.value.aggregations?.[TOTAL_COUNT_AGG]?.value ?? 0),
    medianRunCount: median(activeRanked.map((r) => r.runCount)),
    medianCostPerRun: median(activeRanked.map((r) => r.credits / r.runCount)),
  });
}

type WebhookSourceLabel = {
  name: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
};

type ResolvedWebhookSources = {
  labels: Map<ModelId, WebhookSourceLabel>;
  // Views that exist (possibly restricted) as opposed to deleted/missing —
  // lets callers tell "restricted" and "gone" apart.
  existingIds: Set<ModelId>;
};

async function resolveWebhookSources(
  auth: Authenticator,
  triggers: TriggerResource[]
): Promise<ResolvedWebhookSources> {
  const webhookSourceViewModelIds = [
    ...new Set(removeNulls(triggers.map((t) => t.webhookSourceViewId))),
  ];
  if (webhookSourceViewModelIds.length === 0) {
    return { labels: new Map(), existingIds: new Set() };
  }

  const [views, existingIds] = await Promise.all([
    WebhookSourcesViewResource.fetchByModelIds(auth, webhookSourceViewModelIds),
    WebhookSourcesViewResource.existsByModelIds(
      auth,
      webhookSourceViewModelIds
    ),
  ]);

  return {
    labels: new Map(
      views.map((view) => [
        view.id,
        { name: view.name, icon: normalizeWebhookIcon(view.icon) },
      ])
    ),
    existingIds,
  };
}

export type RankedTriggerWithResource = {
  trigger: TriggerResource;
  runCount: number;
  credits: number;
};

export async function buildAutomationTriggerRows(
  auth: Authenticator,
  page: RankedTriggerWithResource[]
): Promise<AutomationTriggerRow[]> {
  const [agentLabels, editors, webhookSources] = await Promise.all([
    resolveAnalyticsAgentLabels(auth, [
      ...new Set(page.map(({ trigger }) => trigger.agentConfigurationId)),
    ]),
    UserResource.fetchByModelIds([
      ...new Set(page.map(({ trigger }) => trigger.editor)),
    ]),
    resolveWebhookSources(
      auth,
      page.map(({ trigger }) => trigger)
    ),
  ]);
  const editorsByModelId = new Map(
    editors.map((editor) => [editor.id, editor])
  );

  return page.map(({ trigger, runCount, credits }) => {
    const agentLabel = agentLabels.get(trigger.agentConfigurationId);
    const editor = editorsByModelId.get(trigger.editor);
    const webhookSource = trigger.webhookSourceViewId
      ? webhookSources.labels.get(trigger.webhookSourceViewId)
      : undefined;
    const triggerJSON = trigger.toJSON();

    return {
      triggerId: trigger.sId,
      name: trigger.name,
      kind: trigger.kind,
      status: trigger.status,
      agent: {
        agentId: trigger.agentConfigurationId,
        name: agentLabel?.name ?? trigger.agentConfigurationId,
        pictureUrl: agentLabel?.pictureUrl ?? null,
        description: agentLabel?.description ?? null,
        modelId: agentLabel?.modelId ?? null,
        modelDisplayName: agentLabel?.modelDisplayName ?? null,
      },
      editor: {
        name: getUserDisplayName(editor),
        email: editor?.email ?? null,
        pictureUrl: editor?.imageUrl ?? null,
      },
      scheduleDescription: isScheduleTrigger(triggerJSON)
        ? describeScheduleConfig(triggerJSON.configuration)
        : null,
      webhookSourceName: webhookSource?.name ?? null,
      // Restricted means the view still exists but the caller lacks read
      // access to its space — as opposed to a deleted/missing view, which
      // falls back to a generic "Webhook" label instead.
      webhookSourceRestricted:
        !webhookSource &&
        !!trigger.webhookSourceViewId &&
        webhookSources.existingIds.has(trigger.webhookSourceViewId),
      webhookIcon: webhookSource?.icon ?? null,
      runCount,
      credits,
      executionMode: trigger.executionMode,
    };
  });
}

export async function fetchAutomationTriggers(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
    search,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
    search?: string;
    filter?: AutomationTriggersFilter;
  }
): Promise<Result<AutomationTriggers, ElasticsearchError>> {
  const rankingResult = await fetchTriggersRanking(auth, {
    period,
    limit,
    offset,
    search,
    filter,
  });
  if (rankingResult.isErr()) {
    return rankingResult;
  }
  const { ranking, totalCount, medianRunCount, medianCostPerRun } =
    rankingResult.value;

  const triggers = await TriggerResource.fetchByIds(
    auth,
    ranking.map((ranked) => ranked.triggerId)
  );
  const triggersById = new Map(
    triggers.map((trigger) => [trigger.sId, trigger])
  );

  // A trigger deleted since it ran keeps its consumption in Elasticsearch, with
  // nothing left to name it.
  const page = removeNulls(
    ranking.map((ranked) => {
      const trigger = triggersById.get(ranked.triggerId);
      return trigger ? { ...ranked, trigger } : null;
    })
  );

  const rows = await buildAutomationTriggerRows(auth, page);

  return new Ok({
    period,
    totalCount,
    triggers: rows,
    medianRunCount,
    medianCostPerRun,
  });
}

// Ranked the same way the paginated view ranks them, so a "select all across
// pages" resolves to the ids the table would show on any page.
export async function fetchAutomationTriggerIds(
  auth: Authenticator,
  {
    period,
    search,
    filter,
    limit,
  }: {
    period: ConsumptionPeriod;
    search?: string;
    filter?: AutomationTriggersFilter;
    limit: number;
  }
): Promise<Result<string[], ElasticsearchError>> {
  const rankingResult = await fetchTriggersRanking(auth, {
    period,
    limit: Math.min(limit, CARDINALITY_PRECISION_THRESHOLD),
    offset: 0,
    search,
    filter,
  });
  if (rankingResult.isErr()) {
    return rankingResult;
  }
  return new Ok(rankingResult.value.ranking.map((ranked) => ranked.triggerId));
}
