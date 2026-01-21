import type { PublicTriggerType } from "@dust-tt/client";

import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { ModelId } from "@app/types";
import { removeNulls } from "@app/types";
import type { ScheduleConfig, WebhookConfig } from "@app/types/assistant/triggers";

interface TransformOptions {
  editorNamesMap?: Map<ModelId, string>;
  webhookSourcesMap?: Map<ModelId, WebhookSourcesViewResource>;
}

/**
 * Transform a TriggerResource to the public API schema.
 * Excludes sensitive data like webhook secrets and URLs.
 */
export function toPublicTrigger(
  trigger: TriggerResource,
  options: TransformOptions = {}
): PublicTriggerType {
  const { editorNamesMap, webhookSourcesMap } = options;

  const base = {
    sId: trigger.sId,
    name: trigger.name,
    agentConfigurationSId: trigger.agentConfigurationId,
    status: trigger.status,
    createdAt: trigger.createdAt.getTime(),
    naturalLanguageDescription: trigger.naturalLanguageDescription,
    customPrompt: trigger.customPrompt,
    origin: trigger.origin,
    editor: editorNamesMap?.has(trigger.editor)
      ? { fullName: editorNamesMap.get(trigger.editor)! }
      : null,
  };

  if (trigger.kind === "schedule") {
    return {
      ...base,
      kind: "schedule" as const,
      configuration: trigger.configuration as ScheduleConfig,
    };
  }

  // Webhook trigger - include safe metadata only (no secrets/URLs)
  const webhookSourceView =
    trigger.webhookSourceViewId && webhookSourcesMap
      ? webhookSourcesMap.get(trigger.webhookSourceViewId)
      : null;

  return {
    ...base,
    kind: "webhook" as const,
    configuration: trigger.configuration as WebhookConfig,
    executionMode: trigger.executionMode,
    webhookSource: webhookSourceView
      ? {
          sId: webhookSourceView.sId,
          name: webhookSourceView.customName ?? "Unknown",
          provider: webhookSourceView.toJSON().provider,
        }
      : null,
  };
}

/**
 * Batch fetch editor names for triggers.
 */
export async function fetchEditorNamesMap(
  triggers: TriggerResource[]
): Promise<Map<ModelId, string>> {
  const editorIds = Array.from(new Set(triggers.map((t) => t.editor)));
  const editorUsers = await UserResource.fetchByModelIds(editorIds);

  return new Map(editorUsers.map((user) => [user.id, user.fullName()]));
}

/**
 * Batch fetch webhook source views for triggers.
 */
export async function fetchWebhookSourcesMap(
  auth: Authenticator,
  triggers: TriggerResource[]
): Promise<Map<ModelId, WebhookSourcesViewResource>> {
  const webhookSourceViewIds = removeNulls(
    triggers
      .filter((t) => t.kind === "webhook" && t.webhookSourceViewId)
      .map((t) => t.webhookSourceViewId)
  );

  if (webhookSourceViewIds.length === 0) {
    return new Map();
  }

  const views = await WebhookSourcesViewResource.fetchByModelIds(
    auth,
    webhookSourceViewIds
  );

  return new Map(views.map((view) => [view.id, view]));
}

/**
 * Transform multiple triggers to public API schema with batched data fetching.
 */
export async function toPublicTriggers(
  auth: Authenticator,
  triggers: TriggerResource[]
): Promise<PublicTriggerType[]> {
  if (triggers.length === 0) {
    return [];
  }

  const [editorNamesMap, webhookSourcesMap] = await Promise.all([
    fetchEditorNamesMap(triggers),
    fetchWebhookSourcesMap(auth, triggers),
  ]);

  return triggers.map((trigger) =>
    toPublicTrigger(trigger, { editorNamesMap, webhookSourcesMap })
  );
}
