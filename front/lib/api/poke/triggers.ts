import { AutomationTriggersBodySchema } from "@app/lib/api/analytics/automations/schema";
import type { GetAutomationTriggersResponse } from "@app/lib/api/analytics/automations/triggers";
import { fetchAutomationTriggers } from "@app/lib/api/analytics/automations/triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { TriggerWithProviderAndEditor } from "@app/lib/triggers/admin/list_with_metadata";
import type { PokeAgentTriggerRow } from "@app/types/api/poke/triggers";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export type TriggerWithProviderType = TriggerWithProviderAndEditor;

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

const PokeAgentTriggerSearchBodySchema = z.object({
  scope: z.literal("agent"),
  agentId: z.string().min(1),
});

const PokeWorkspaceTriggerSearchBodySchema = AutomationTriggersBodySchema.omit({
  format: true,
}).extend({
  scope: z.literal("workspace"),
});

export const PokeTriggerSearchBodySchema = z.discriminatedUnion("scope", [
  PokeAgentTriggerSearchBodySchema,
  PokeWorkspaceTriggerSearchBodySchema,
]);

export type PokeTriggerSearchBody = z.infer<typeof PokeTriggerSearchBodySchema>;

export type PokeTriggerSearchResponse =
  | {
      scope: "agent";
      agentId: string;
      triggers: PokeAgentTriggerRow[];
    }
  | ({ scope: "workspace" } & GetAutomationTriggersResponse);

async function listPokeAgentTriggers(
  auth: Authenticator,
  agentId: string
): Promise<PokeAgentTriggerRow[]> {
  const triggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentId
  );
  if (triggers.length === 0) {
    return [];
  }

  const editorModelIds = [
    ...new Set(triggers.map((trigger) => trigger.editor)),
  ];
  const webhookSourceViewModelIds = [
    ...new Set(
      removeNulls(triggers.map((trigger) => trigger.webhookSourceViewId))
    ),
  ];

  const [agentLabels, editors, webhookSourceViews] = await Promise.all([
    resolveAnalyticsAgentLabels(auth, [agentId]),
    UserResource.fetchByModelIds(editorModelIds),
    webhookSourceViewModelIds.length > 0
      ? WebhookSourcesViewResource.fetchByModelIds(
          auth,
          webhookSourceViewModelIds
        )
      : Promise.resolve([]),
  ]);
  const editorsByModelId = new Map(
    editors.map((editor) => [editor.id, editor])
  );
  const webhookSourceViewsByModelId = new Map(
    webhookSourceViews.map((view) => [view.id, view])
  );

  return triggers.map((trigger) => {
    const agentLabel = agentLabels.get(trigger.agentConfigurationId);
    const webhookSourceView = trigger.webhookSourceViewId
      ? webhookSourceViewsByModelId.get(trigger.webhookSourceViewId)
      : undefined;

    return trigger.toPokeListJSON({
      agentName: agentLabel?.name ?? trigger.agentConfigurationId,
      agentIsAvailable: agentLabel !== undefined,
      editor: editorsByModelId.get(trigger.editor) ?? null,
      provider: webhookSourceView?.webhookSource.provider ?? null,
    });
  });
}

export async function searchPokeTriggers(
  auth: Authenticator,
  body: PokeTriggerSearchBody
): Promise<Result<PokeTriggerSearchResponse, ElasticsearchError>> {
  switch (body.scope) {
    case "agent": {
      const triggers = await listPokeAgentTriggers(auth, body.agentId);
      return new Ok({
        scope: "agent",
        agentId: body.agentId,
        triggers,
      });
    }
    case "workspace": {
      const { limit, offset, search, filter } = body;
      const period = await resolveConsumptionPeriod(
        auth,
        toConsumptionPeriodInput(body)
      );
      const result = await fetchAutomationTriggers(auth, {
        period,
        limit,
        offset,
        search,
        filter,
      });
      if (result.isErr()) {
        return result;
      }

      return new Ok({ scope: "workspace", ...result.value });
    }
    default:
      return assertNever(body);
  }
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
};
