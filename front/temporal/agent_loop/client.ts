import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClient } from "@app/lib/temporal";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import type { RunAgentAsynchronousArgs } from "@app/types/assistant/agent_run";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  authType,
  runAsynchronousAgentArgs,
  startStep,
}: {
  authType: AuthenticatorType;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
  startStep: number;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowId = makeAgentLoopWorkflowId(
    authType,
    runAsynchronousAgentArgs
  );

  await client.workflow.start(agentLoopWorkflow, {
    args: [{ authType, runAsynchronousAgentArgs, startStep }],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  return new Ok(undefined);
}
