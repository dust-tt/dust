import { WorkflowClient } from '@temporalio/client';
import { getSlackChannelsWorkflow } from './workflow';

/**
 * Temporal client only here for demo purposes.
 */
export async function slackGetChannelsViaTemporal(nangoConnectionId: string) {
  const client = new WorkflowClient();
  await client.start(getSlackChannelsWorkflow, {
    workflowId: 'getSlackChannelsWorkflow' + new Date().getTime(),
    taskQueue: 'slack-sync',
    args: [nangoConnectionId],
  });

  return ;
}