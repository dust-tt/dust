import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
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
import type { TriggerKind, TriggerStatus } from "@app/types/assistant/triggers";
import { isScheduleTrigger } from "@app/types/assistant/triggers";
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

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

type TriggerRestrictions = {
  // Applied as a terms filter on the query, so it scopes the ranking and the
  // median baseline alike. Null means no restriction.
  kindIds: string[] | null;
  // Applied to the ranked buckets instead, so a search narrows the rows
  // without moving the median baseline. Null means no restriction.
  searchIds: Set<string> | null;
};

/**
 * Neither trigger kind nor trigger name is indexed in the consumption
 * Elasticsearch documents, so both restrictions are resolved to concrete sets
 * of trigger ids up front, from one read of the workspace's triggers. Matching
 * names in memory mirrors how the consumption ranking resolves its own search
 * against the facet catalog (resolveConsumptionTopSearchFilter).
 */
async function resolveTriggerRestrictions(
  auth: Authenticator,
  {
    kinds,
    search,
  }: {
    kinds: TriggerKind[] | undefined;
    search: string | undefined;
  }
): Promise<TriggerRestrictions> {
  const kindSet = kinds?.length ? new Set(kinds) : null;
  const normalizedSearch = search?.trim().toLowerCase();
  if (!kindSet && !normalizedSearch) {
    return { kindIds: null, searchIds: null };
  }

  const triggers = await TriggerResource.listByWorkspace(auth);

  return {
    kindIds: kindSet
      ? triggers
          .filter((trigger) => kindSet.has(trigger.kind))
          .map((trigger) => trigger.sId)
      : null,
    searchIds: normalizedSearch
      ? new Set(
          triggers
            .filter((trigger) =>
              trigger.name.toLowerCase().includes(normalizedSearch)
            )
            .map((trigger) => trigger.sId)
        )
      : null,
  };
}

/**
 * The period's triggers ranked by gross credits, highest first. The
 * underlying terms aggregation is capped at CARDINALITY_PRECISION_THRESHOLD
 * buckets (the same approximation boundary used for the total trigger
 * count below), so both the requested page and the median baseline are
 * sliced/derived from that same, page-independent set — a trigger's stats
 * always compare against the full active set, never just the triggers
 * ranked ahead of it, nor just the ones a search matched.
 */
async function fetchTriggersRanking(
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
  const scopeFilter: ConsumptionScopeFilter = {};
  if (filter?.agentIds?.length) {
    scopeFilter.agents = filter.agentIds;
  }
  if (filter?.editorIds?.length) {
    scopeFilter.users = filter.editorIds;
  }

  const { kindIds, searchIds } = await resolveTriggerRestrictions(auth, {
    kinds: filter?.kinds,
    search,
  });

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter: scopeFilter,
    extraFilters:
      kindIds !== null ? [{ terms: { [TRIGGER_ID_FIELD]: kindIds } }] : [],
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
    runCount: Math.round(bucket[RUNS_AGG]?.value ?? 0),
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
  }));
  // Triggers that never ran have nothing to compare a "how often" or "per
  // run cost" stat against, so the baseline only looks at the ones that did.
  const activeRanked = ranked.filter((r) => r.runCount > 0);

  const searched =
    searchIds !== null
      ? ranked.filter((r) => searchIds.has(r.triggerId))
      : ranked;

  return new Ok({
    ranking: searched.slice(offset, offset + limit),
    // The searched set is already fully materialized, so its length is exact
    // where the unsearched count is the aggregation's approximation.
    totalCount:
      searchIds !== null
        ? searched.length
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

  const rows = page.map(({ trigger, runCount, credits }) => {
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
    };
  });

  return new Ok({
    period,
    totalCount,
    triggers: rows,
    medianRunCount,
    medianCostPerRun,
  });
}
