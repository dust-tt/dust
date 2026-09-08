import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TriggerType as PublicTriggerType } from "@dust-tt/client";

/**
 * @cc [owner:adrien,label:api] public-api-trigger-serialization
 * Serializes a workspace-wide `TriggerResource` list for the read-only public API: internal
 * fields with no meaning outside the workspace (`editor`, `origin`, `spaceId`,
 * `webhookSourceViewId`) are dropped, and webhook triggers get a `webhookSource` label
 * (`name`/`provider`) resolved from their view instead of the raw internal view id.
 */
export async function serializeTriggersForPublicApi(
  auth: Authenticator,
  triggers: TriggerResource[]
): Promise<PublicTriggerType[]> {
  const webhookSourceViewIds = [
    ...new Set(removeNulls(triggers.map((t) => t.webhookSourceViewId))),
  ];
  const views =
    webhookSourceViewIds.length > 0
      ? await WebhookSourcesViewResource.fetchByModelIds(
          auth,
          webhookSourceViewIds
        )
      : [];
  const viewsById = new Map(views.map((view) => [view.id, view]));

  return triggers.map((trigger) => {
    const triggerJSON = trigger.toJSON();
    const base = {
      id: triggerJSON.id,
      sId: triggerJSON.sId,
      name: triggerJSON.name,
      agentConfigurationId: triggerJSON.agentConfigurationId,
      customPrompt: triggerJSON.customPrompt,
      status: triggerJSON.status,
      createdAt: triggerJSON.createdAt,
      naturalLanguageDescription: triggerJSON.naturalLanguageDescription,
      executionMode: triggerJSON.executionMode,
    };

    if (triggerJSON.kind !== "webhook") {
      return {
        ...base,
        kind: "schedule" as const,
        configuration: triggerJSON.configuration,
      };
    }

    const view = trigger.webhookSourceViewId
      ? viewsById.get(trigger.webhookSourceViewId)
      : undefined;

    return {
      ...base,
      kind: "webhook" as const,
      configuration: triggerJSON.configuration,
      webhookSource: view
        ? { name: view.name, provider: view.webhookSource.provider ?? "custom" }
        : null,
    };
  });
}
