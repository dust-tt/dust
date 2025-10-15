import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
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
}: {
  auth: Authenticator;
  trigger: TriggerResource;
  contentFragment?: ContentFragmentInputWithFileIdType;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentTriggerWorkflowId(
    auth.getNonNullableUser().sId,
    auth.getNonNullableWorkspace().sId,
    trigger.toJSON()
  );

  await client.workflow.start(agentTriggerWorkflow, {
    args: [
      auth.getNonNullableUser().sId,
      auth.getNonNullableWorkspace().sId,
      trigger.toJSON(),
      contentFragment,
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
