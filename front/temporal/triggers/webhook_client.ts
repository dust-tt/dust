import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type {WebhookSourceResource} from "@app/lib/resources/webhook_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { launchAgentTriggerWorkflow } from "@app/temporal/triggers/client";
import type { ContentFragmentInputWithFileIdType } from "@app/types/api/internal/assistant";
import type { WebhookTriggerType } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function launchTriggersWorkflows(
  auth: Authenticator,
  {
    filteredTriggers,
    webhookSource,
    body,
    webhookRequest,
  }: {
    filteredTriggers: WebhookTriggerType[];
    webhookSource: WebhookSourceResource;
    body: Record<string, unknown>;
    webhookRequest: WebhookRequestResource;
  }
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const webhookRequestId = webhookRequest.id;
  // Check if any of the triggers requires the payload.
  const requiresPayload = filteredTriggers.some(
    (t) => t.configuration.includePayload
  );

  // If we need the payload, create a content fragment for it.
  let contentFragment: ContentFragmentInputWithFileIdType | undefined;
  if (requiresPayload) {
    const contentFragmentRes = await toFileContentFragment(auth, {
      contentFragment: {
        contentType: "application/json",
        content: JSON.stringify(body),
        title: `Webhook body (source id: ${webhookSource.id}, date: ${new Date().toISOString()})`,
      },
      fileName: `webhook_body_${webhookSource.id}_${Date.now()}.json`,
    });

    if (contentFragmentRes.isErr()) {
      const errorMessage =
        "Error creating file content fragment from webhook request.";
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);
      return new Err(new Error(errorMessage));
    }

    contentFragment = contentFragmentRes.value;
  }

  // Launch all the triggers' workflows concurrently.
  await concurrentExecutor(
    filteredTriggers,
    async (trigger) => {
      // Get the trigger's user and create a new authenticator
      const user = await UserResource.fetchByModelId(trigger.editor);

      if (!user) {
        logger.error(
          {
            triggerId: trigger.sId,
          },
          "Trigger editor not found."
        );
        await webhookRequest.markRelatedTrigger({
          trigger,
          status: "workflow_start_failed",
        });
      } else {
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspaceId
        );
        if (trigger.configuration.includePayload && !contentFragment) {
          const errorMessage =
            "One of the triggers requires the payload, but the contentFragment is missing. It should never happen as the content fragment is created if any of the triggers requires the payload.";
          logger.error(
            {
              triggerId: trigger.sId,
            },
            errorMessage
          );
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_failed",
          });
          return;
        }

        // Fire and forget
        const result = await launchAgentTriggerWorkflow({
          auth,
          trigger,
          contentFragment,
          webhookRequestId,
        });

        if (result.isErr()) {
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_failed",
          });
          logger.error(
            {
              triggerId: trigger.sId,
              error: result.error,
            },
            "Error launching agent trigger workflow."
          );
        } else {
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_succeeded",
          });
        }
      }
    },
    { concurrency: 10 }
  );

  return new Ok(undefined);
}
