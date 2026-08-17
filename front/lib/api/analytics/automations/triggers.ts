import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
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
import type { TriggerKind, TriggerType } from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

export type AutomationTriggerRow = {
  triggerId: string;
  name: string;
  kind: TriggerKind;
  agent: {
    agentId: string;
    name: string;
    pictureUrl: string | null;
  };
  editor: {
    name: string;
    pictureUrl: string | null;
  };
  webhookSourceName: string | null;
  webhookIcon: InternalAllowedIconType | CustomResourceIconType | null;
  runCount: number;
  credits: number;
};

export type AutomationTriggers = {
  period: ConsumptionPeriod;
  // Rows come from Postgres, so a trigger that never ran still counts.
  totalCount: number;
  triggers: AutomationTriggerRow[];
};

export type GetAutomationTriggersResponse = AutomationTriggers;

const CREDIT_AGG = "credit_micro";
const RUNS_AGG = "runs";

type TriggerBucket = {
  key: string;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [RUNS_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type TriggerAggs = {
  by_trigger?: estypes.AggregationsMultiBucketAggregateBase<TriggerBucket>;
};

type TriggerConsumption = {
  runCount: number;
  credits: number;
};

async function fetchTriggersConsumption(
  auth: Authenticator,
  {
    period,
    triggerIds,
  }: {
    period: ConsumptionPeriod;
    triggerIds: string[];
  }
): Promise<Result<Map<string, TriggerConsumption>, ElasticsearchError>> {
  if (triggerIds.length === 0) {
    return new Ok(new Map());
  }

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
          include: triggerIds,
          size: triggerIds.length,
        },
        aggs: {
          [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          // One trigger run is one conversation.
          [RUNS_AGG]: { cardinality: { field: CONVERSATION_ID_FIELD } },
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

  return new Ok(
    new Map(
      buckets.map((bucket) => [
        String(bucket.key),
        {
          runCount: Math.round(bucket[RUNS_AGG]?.value ?? 0),
          credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
        },
      ])
    )
  );
}

async function resolveWebhookSources(
  auth: Authenticator,
  triggers: TriggerType[]
): Promise<
  Map<
    string,
    { name: string; icon: InternalAllowedIconType | CustomResourceIconType }
  >
> {
  const webhookSourceViewIds = [
    ...new Set(
      removeNulls(
        triggers.map((trigger) =>
          isWebhookTrigger(trigger) ? trigger.webhookSourceViewId : null
        )
      )
    ),
  ];
  if (webhookSourceViewIds.length === 0) {
    return new Map();
  }

  const views = await WebhookSourcesViewResource.fetchByIds(
    auth,
    webhookSourceViewIds
  );

  return new Map(
    views.map((view) => {
      const { sId, customName, icon } = view.toJSON();
      return [sId, { name: customName, icon }];
    })
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
  const triggers = (await TriggerResource.listByWorkspace(auth)).map(
    (trigger) => trigger.toJSON()
  );

  const consumptionResult = await fetchTriggersConsumption(auth, {
    period,
    triggerIds: triggers.map((trigger) => trigger.sId),
  });
  if (consumptionResult.isErr()) {
    return consumptionResult;
  }
  const consumption = consumptionResult.value;

  const creditsFor = (triggerId: string) =>
    consumption.get(triggerId)?.credits ?? 0;
  const page = [...triggers]
    .sort(
      (a, b) =>
        creditsFor(b.sId) - creditsFor(a.sId) || a.name.localeCompare(b.name)
    )
    .slice(offset, offset + limit);

  const [agentLabels, editors, webhookSources] = await Promise.all([
    resolveAnalyticsAgentLabels(auth, [
      ...new Set(page.map((trigger) => trigger.agentConfigurationId)),
    ]),
    UserResource.fetchByModelIds([
      ...new Set(page.map((trigger) => trigger.editor)),
    ]),
    resolveWebhookSources(auth, page),
  ]);
  const editorsByModelId = new Map(
    editors.map((editor) => [editor.id, editor])
  );

  const rows = page.map((trigger) => {
    const metrics = consumption.get(trigger.sId);
    const agentLabel = agentLabels.get(trigger.agentConfigurationId);
    const editor = editorsByModelId.get(trigger.editor);
    const webhookSource =
      isWebhookTrigger(trigger) && trigger.webhookSourceViewId
        ? webhookSources.get(trigger.webhookSourceViewId)
        : undefined;

    return {
      triggerId: trigger.sId,
      name: trigger.name,
      kind: trigger.kind,
      agent: {
        agentId: trigger.agentConfigurationId,
        name: agentLabel?.name ?? trigger.agentConfigurationId,
        pictureUrl: agentLabel?.pictureUrl ?? null,
      },
      editor: {
        name: getUserDisplayName(editor),
        pictureUrl: editor?.imageUrl ?? null,
      },
      webhookSourceName: webhookSource?.name ?? null,
      webhookIcon: webhookSource?.icon ?? null,
      runCount: metrics?.runCount ?? 0,
      credits: metrics?.credits ?? 0,
    };
  });

  return new Ok({
    period,
    totalCount: triggers.length,
    triggers: rows,
  });
}
