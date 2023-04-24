import { WorkflowClient } from "@temporalio/client";

import { printSlackChannelsWorkflow } from "./workflow.js";

/**
 * Temporal client only here for demo purposes.
 */
export async function slackGetChannelsViaTemporal(
  nangoConnectionId: string
): Promise<void> {
  const client = new WorkflowClient();
  await client.start(printSlackChannelsWorkflow, {
    workflowId: `getSlackChannelsWorkflow ${new Date().getTime()}`,
    taskQueue: "slack-sync",
    args: [nangoConnectionId],
  });
  return;
}
