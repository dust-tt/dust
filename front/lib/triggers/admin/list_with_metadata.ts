import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { TriggerType } from "@app/types/assistant/triggers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";

export type TriggerWithProviderAndEditor = TriggerType & {
  provider?: WebhookProvider | null;
  editorUser?: UserType | null;
};

/**
 * Returns every trigger in the workspace, enriched with the webhook provider
 * of its source view (when applicable) and the editor's user record. Used by
 * the poke admin UI.
 */
export async function listTriggersWithProviderAndEditor(
  auth: Authenticator
): Promise<TriggerWithProviderAndEditor[]> {
  const triggers = await TriggerResource.listByWorkspace(auth);
  const triggerJSONs = triggers.map((t) => t.toJSON());

  const webhookSourceViewIds = removeNulls(
    triggerJSONs.map((t) =>
      t.kind === "webhook" ? t.webhookSourceViewId : null
    )
  );

  const webhookSourceViews =
    webhookSourceViewIds.length > 0
      ? await WebhookSourcesViewResource.fetchByIds(auth, webhookSourceViewIds)
      : [];

  const providerMap = new Map<string, WebhookProvider | null>();
  for (const view of webhookSourceViews) {
    const viewJSON = view.toJSON();
    providerMap.set(viewJSON.sId, viewJSON.provider);
  }

  const editorIds = removeNulls(triggerJSONs.map((t) => t.editor));
  const editorUsers =
    editorIds.length > 0 ? await UserResource.fetchByModelIds(editorIds) : [];
  const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

  return triggerJSONs.map((t) => {
    const editorUser = editorUserMap.get(t.editor) ?? null;
    if (t.kind === "webhook" && t.webhookSourceViewId) {
      return {
        ...t,
        provider: providerMap.get(t.webhookSourceViewId) ?? null,
        editorUser,
      };
    }
    return {
      ...t,
      provider: t.kind === "schedule" ? undefined : null,
      editorUser,
    };
  });
}
