import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
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

/**
 * The period's triggers ranked by gross credits, highest first. Ranking and
 * paging both happen in Elasticsearch, so neither grows with the number of
 * triggers the workspace holds.
 */
async function fetchTriggersRanking(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
  }
): Promise<
  Result<{ ranking: RankedTrigger[]; totalCount: number }, ElasticsearchError>
> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const result = await searchConsumptionAnalytics<never, TriggerAggs>(query, {
    aggregations: {
      by_trigger: {
        terms: {
          field: TRIGGER_ID_FIELD,
          size: offset + limit,
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

  return new Ok({
    ranking: buckets.slice(offset, offset + limit).map((bucket) => ({
      triggerId: String(bucket.key),
      runCount: Math.round(bucket[RUNS_AGG]?.value ?? 0),
      credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
    })),
    totalCount: Math.round(
      result.value.aggregations?.[TOTAL_COUNT_AGG]?.value ?? 0
    ),
  });
}

type WebhookSourceLabel = {
  name: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
};

async function resolveWebhookSources(
  auth: Authenticator,
  triggers: TriggerResource[]
): Promise<Map<ModelId, WebhookSourceLabel>> {
  const webhookSourceViewModelIds = [
    ...new Set(removeNulls(triggers.map((t) => t.webhookSourceViewId))),
  ];
  if (webhookSourceViewModelIds.length === 0) {
    return new Map();
  }

  const views = await WebhookSourcesViewResource.fetchByModelIds(
    auth,
    webhookSourceViewModelIds
  );

  return new Map(
    views.map((view) => [
      view.id,
      { name: view.name, icon: normalizeWebhookIcon(view.icon) },
    ])
  );
}

export async function fetchAutomationTriggers(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
  }
): Promise<Result<AutomationTriggers, ElasticsearchError>> {
  const rankingResult = await fetchTriggersRanking(auth, {
    period,
    limit,
    offset,
  });
  if (rankingResult.isErr()) {
    return rankingResult;
  }
  const { ranking, totalCount } = rankingResult.value;

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
      ? webhookSources.get(trigger.webhookSourceViewId)
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
      // A webhook trigger always points at a view; if it didn't resolve, the
      // caller lacks read access to the space that holds it.
      webhookSourceRestricted:
        trigger.kind === "webhook" &&
        !!trigger.webhookSourceViewId &&
        !webhookSource,
      webhookIcon: webhookSource?.icon ?? null,
      runCount,
      credits,
    };
  });

  return new Ok({
    period,
    totalCount,
    triggers: rows,
  });
}
