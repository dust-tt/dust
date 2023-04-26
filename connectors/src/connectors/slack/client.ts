import { getTemporalClient } from "@connectors/lib/temporal";

import { printSlackChannelsWorkflow } from "./workflow.js";

/**
 * Temporal client only here for demo purposes.
 */
export async function slackGetChannelsViaTemporal(
  nangoConnectionId: string
): Promise<void> {
  const client = await getTemporalClient();
  await client.workflow.start(printSlackChannelsWorkflow, {
    workflowId: `getSlackChannelsWorkflow ${new Date().getTime()}`,
    taskQueue: "slack-sync",
    args: [nangoConnectionId],
  });
  return;
}
