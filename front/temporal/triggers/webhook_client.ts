import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/triggers/config";
import { agentTriggerWorkflow } from "@app/temporal/triggers/workflows";
import type { ContentFragmentInputWithFileIdType } from "@app/types/api/internal/assistant";
import type {
  TriggerType,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function launchAgentTriggerWorkflow({
  auth,
  trigger,
  contentFragment,
  webhookRequestId,
}: {
  auth: Authenticator;
  trigger: TriggerType;
  contentFragment?: ContentFragmentInputWithFileIdType;
  webhookRequestId?: number;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentTriggerWorkflowId(
    auth.getNonNullableUser().sId,
    auth.getNonNullableWorkspace().sId,
    trigger
  );

  try {
    await client.workflow.start(agentTriggerWorkflow, {
      args: [
        {
          userId: auth.getNonNullableUser().sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          triggerId: trigger.sId,
          contentFragment,
          webhookRequestId,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
    });
  } catch (error) {
    return new Err(
      new Error(`Could not launch workflow: ${normalizeError(error)}`)
    );
  }

  return new Ok(undefined);
}

function makeAgentTriggerWorkflowId(
  userId: string,
  workspaceId: string,
  trigger: TriggerType
): string {
  return `agent-trigger-${trigger.kind}-${userId}-${workspaceId}-${trigger.sId}-${Date.now()}`;
}

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
