import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './slack'; // purely for type safety

const { getChannels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

/**
 * This workflow exists just to show case the interaction with Slack API through a
 * temporal Workflow in this node package.
 */
export async function getSlackChannelsWorkflow(nangoConnectionId: string): Promise<void> {
  const channels = await getChannels(nangoConnectionId);
  console.log('channels: ', channels);

  return;
}
