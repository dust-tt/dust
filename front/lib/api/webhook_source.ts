import { WEBHOOK_SERVICES } from "@app/lib/api/triggers/built-in-webhooks/services";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import logger from "@app/logger/logger";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  WebhookSourceForAdminType,
  WebhookSourceType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";

/**
 * Deletes a webhook source and all related entities (views, triggers, requests).
 * This function orchestrates the deletion across multiple resources to avoid
 * circular dependencies between WebhookSourceResource and WebhookSourcesViewResource.
 */
export async function deleteWebhookSource(
  auth: Authenticator,
  webhookSource: WebhookSourceResource,
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<undefined, Error>> {
  const canAdministrate = await SpaceResource.canAdministrateSystemSpace(auth);
  assert(
    canAdministrate,
    "The user is not authorized to delete a webhook source"
  );

  // Delete remote webhooks if applicable.
  if (
    webhookSource.provider &&
    webhookSource.remoteMetadata &&
    webhookSource.oauthConnectionId
  ) {
    const service = WEBHOOK_SERVICES[webhookSource.provider];
    const result = await service.deleteWebhooks({
      auth,
      connectionId: webhookSource.oauthConnectionId,
      remoteMetadata: webhookSource.remoteMetadata,
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        `Failed to delete remote webhook on ${webhookSource.provider}`
      );
    }
    // Continue with local deletion even if remote deletion fails.
  }

  // Find all webhook source views for this webhook source.
  const webhookSourceViews =
    await WebhookSourcesViewResource.listByWebhookSourceForInternalProcessing(
      auth,
      webhookSource.id
    );

  // Delete all triggers for each webhook source view.
  for (const view of webhookSourceViews) {
    const triggers = await TriggerResource.listByWebhookSourceViewId(
      auth,
      view.id
    );
    for (const trigger of triggers) {
      await trigger.delete(auth, { transaction });
    }
  }

  // Hard delete all views.
  for (const view of webhookSourceViews) {
    await view.hardDelete(auth, transaction);
  }

  // Delete the webhook requests associated with this webhook source.
  await WebhookRequestResource.deleteByWebhookSourceId(auth, webhookSource.id, {
    transaction,
  });

  // Delete the webhook source itself.
  await webhookSource.hardDelete(auth, { transaction });

  return new Ok(undefined);
}

export type WebhookSourceWithCounts = WebhookSourceType & {
  viewCount: number;
  triggerCount: number;
};

/**
 * Every webhook source in the workspace, with the number of views and the
 * total number of triggers across those views. Used by the poke admin UI.
 */
export async function listWebhookSourcesWithCounts(
  auth: Authenticator
): Promise<WebhookSourceWithCounts[]> {
  const sources = await WebhookSourceResource.listByWorkspace(auth);
  const results: WebhookSourceWithCounts[] = [];

  for (const source of sources) {
    const views = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      source.id
    );
    let triggerCount = 0;
    for (const view of views) {
      const triggers = await TriggerResource.listByWebhookSourceViewId(
        auth,
        view.id
      );
      triggerCount += triggers.length;
    }

    results.push({
      ...source.toJSON(),
      viewCount: views.length,
      triggerCount,
    });
  }

  return results;
}

export type WebhookSourceAdminDetails = {
  webhookSource: WebhookSourceForAdminType;
  views: WebhookSourceViewForAdminType[];
  triggers: Array<TriggerType & { editorUser: UserType | null }>;
  requestStats: { last24h: number; last7d: number; last30d: number };
};

/**
 * For a given webhook source, return its admin-only JSON, all of its views,
 * every trigger across those views (enriched with the editor user record), and
 * request-volume counts over recent periods. Used by the poke admin UI.
 */
export async function getWebhookSourceAdminDetails(
  auth: Authenticator,
  source: WebhookSourceResource
): Promise<WebhookSourceAdminDetails> {
  const views = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    source.id
  );

  // Collect all triggers from all views.
  const allTriggers: TriggerType[] = [];
  for (const view of views) {
    const triggers = await TriggerResource.listByWebhookSourceViewId(
      auth,
      view.id
    );
    for (const t of triggers) {
      allTriggers.push(t.toJSON());
    }
  }

  // Batch-fetch editor users.
  const editorIds = removeNulls(allTriggers.map((t) => t.editor));
  const editorUsers =
    editorIds.length > 0 ? await UserResource.fetchByModelIds(editorIds) : [];
  const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

  const triggersWithEditors = allTriggers.map((t) => ({
    ...t,
    editorUser: editorUserMap.get(t.editor) ?? null,
  }));

  const requestStats = await WebhookRequestResource.countBySourceInPeriods(
    auth,
    source.id
  );

  return {
    webhookSource: source.toJSONForAdmin(),
    views: views.map((v) => v.toJSONForAdmin()),
    triggers: triggersWithEditors,
    requestStats,
  };
}
