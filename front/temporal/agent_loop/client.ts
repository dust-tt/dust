import { getTemporalClient } from "@app/lib/temporal";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  agentMessageId,
}: {
  agentMessageId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowId = `agent-loop-workflow-${agentMessageId}`;

  await client.workflow.start(agentLoopWorkflow, {
    args: [{ agentMessageId }],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  return new Ok(undefined);
}
