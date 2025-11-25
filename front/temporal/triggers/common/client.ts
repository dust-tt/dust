import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import type { ContentFragmentInputWithFileIdType, Result } from "@app/types";
import { Ok } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

import { QUEUE_NAME } from "./config";
import { agentTriggerWorkflow } from "./workflows";

export async function launchAgentTriggerWorkflow({
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

  return new Ok(undefined);
}

function makeAgentTriggerWorkflowId(
  userId: string,
  workspaceId: string,
  trigger: TriggerType
): string {
  return `agent-trigger-${trigger.kind}-${userId}-${workspaceId}-${trigger.sId}-${Date.now()}`;
}
