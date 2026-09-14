import type { AutomationTriggersFilter } from "@app/lib/api/analytics/automations/schema";
import { AutomationTriggersBodySchema } from "@app/lib/api/analytics/automations/schema";
import type {
  GetAutomationTriggersResponse,
  RankedTriggerWithResource,
} from "@app/lib/api/analytics/automations/triggers";
import {
  buildAutomationTriggerRows,
  fetchTriggersRanking,
} from "@app/lib/api/analytics/automations/triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_TOP_SORT_ORDER,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const PokeTriggersSearchBodySchema = AutomationTriggersBodySchema.omit({
  format: true,
}).extend({
  sortOrder: z.enum(CONSUMPTION_TOP_SORT_ORDER).optional().default("desc"),
});

export type PokeTriggersSearchBody = z.infer<
  typeof PokeTriggersSearchBodySchema
>;

type TriggerConsumption = { runCount: number; credits: number };

function matchesFilter(
  trigger: TriggerResource,
  {
    filter,
    editorModelIds,
  }: {
    filter?: AutomationTriggersFilter;
    editorModelIds: ReadonlySet<ModelId> | null;
  }
): boolean {
  if (filter?.kinds?.length && !filter.kinds.includes(trigger.kind)) {
    return false;
  }
  if (
    filter?.agentIds?.length &&
    !filter.agentIds.includes(trigger.agentConfigurationId)
  ) {
    return false;
  }
  if (
    filter?.executionModes?.length &&
    !filter.executionModes.includes(trigger.executionMode)
  ) {
    return false;
  }
  if (editorModelIds && !editorModelIds.has(trigger.editor)) {
    return false;
  }
  return true;
}

/** Every live workspace trigger, ordered by its period consumption. */
export async function fetchPokeTriggers(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
    search,
    filter,
    sortOrder,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
    search?: string;
    filter?: AutomationTriggersFilter;
    sortOrder: PokeTriggersSearchBody["sortOrder"];
  }
): Promise<Result<GetAutomationTriggersResponse, ElasticsearchError>> {
  const [liveTriggers, editors, rankingResult] = await Promise.all([
    search
      ? TriggerResource.listByWorkspaceAndNameSearch(auth, search)
      : TriggerResource.listByWorkspace(auth),
    filter?.editorIds?.length
      ? UserResource.fetchByIds(filter.editorIds)
      : Promise.resolve([]),
    fetchTriggersRanking(auth, {
      period,
      limit: CARDINALITY_PRECISION_THRESHOLD,
      offset: 0,
      search,
      filter,
    }),
  ]);
  if (rankingResult.isErr()) {
    return rankingResult;
  }

  const editorModelIds = filter?.editorIds?.length
    ? new Set(editors.map((editor) => editor.id))
    : null;
  const consumptionByTriggerId = new Map<string, TriggerConsumption>(
    rankingResult.value.ranking.map(({ triggerId, runCount, credits }) => [
      triggerId,
      { runCount, credits },
    ])
  );
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const ranked: RankedTriggerWithResource[] = liveTriggers
    .filter((trigger) => matchesFilter(trigger, { filter, editorModelIds }))
    .map((trigger) => ({
      trigger,
      runCount: consumptionByTriggerId.get(trigger.sId)?.runCount ?? 0,
      credits: consumptionByTriggerId.get(trigger.sId)?.credits ?? 0,
    }))
    .sort(
      (a, b) =>
        sortDirection * (a.credits - b.credits) ||
        sortDirection * (a.runCount - b.runCount) ||
        a.trigger.name.localeCompare(b.trigger.name) ||
        a.trigger.sId.localeCompare(b.trigger.sId)
    );

  const rows = await buildAutomationTriggerRows(
    auth,
    ranked.slice(offset, offset + limit)
  );

  return new Ok({
    period,
    totalCount: ranked.length,
    triggers: rows,
    medianRunCount: rankingResult.value.medianRunCount,
    medianCostPerRun: rankingResult.value.medianCostPerRun,
  });
}

export type PokeGetTriggerExecutionStats = {
  statusBreakdown: Record<string, number>;
  dailyVolume: Array<{
    date: string;
    succeeded: number;
    failed: number;
    notMatched: number;
    rateLimited: number;
    creditsExhausted: number;
  }>;
};

export type PokeGetTriggerDetails = {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  editorUser: UserType | null;
  webhookSource: (WebhookSourceType & { payloadsGcsUrl: string }) | null;
};
