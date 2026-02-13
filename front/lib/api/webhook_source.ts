import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";
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
    const service = WEBHOOK_PRESETS[webhookSource.provider].webhookService;
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
