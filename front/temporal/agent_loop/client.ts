import { getTemporalClient } from "@app/lib/temporal";
import type { Result, RunAgentArgs } from "@app/types";
import { Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";
import { AuthenticatorType } from "@app/lib/auth";

export async function launchAgentLoopWorkflow({
  authType,
  runAgentArgs,
}: {
  authType: AuthenticatorType;
  runAgentArgs: RunAgentArgs;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowId = `TODO`;

  await client.workflow.start(agentLoopWorkflow, {
    args: [{ authType: authType, runAgentArgs: runAgentArgs }],
    taskQueue: QUEUE_NAME,
    workflowId,
  });

  return new Ok(undefined);
}
