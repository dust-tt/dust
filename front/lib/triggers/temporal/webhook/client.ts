import type { Authenticator } from "@app/lib/auth";
import type { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { agentTriggerWebhookWorkflow } from "./workflows";

/**
 * Handle the processing of a received webhook request.
 */
export async function launchAgentTriggerWebhookWorkflow({
  auth,
  webhookRequest,
}: {
  auth: Authenticator;
  webhookRequest: WebhookRequestResource;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentTriggerWebhookWorkflowId(auth, webhookRequest);

  await client.workflow.start(agentTriggerWebhookWorkflow, {
    args: [auth.getNonNullableWorkspace().sId, webhookRequest.id],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  return new Ok(undefined);
}

function makeAgentTriggerWebhookWorkflowId(
  auth: Authenticator,
  webhookRequest: WebhookRequestResource
): string {
  return `agent-trigger-webhook-${webhookRequest.id}-${auth.getNonNullableWorkspace().sId}-${Date.now()}`;
}
