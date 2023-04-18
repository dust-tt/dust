import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as slack_activities from './full_sync';
import { DustConfig, SlackConfig } from './interface';

const { syncAllChannels } = proxyActivities<typeof slack_activities>({
  startToCloseTimeout: '180 minute',
  retry: {
    maximumAttempts: 2,
  },
});

/** A workflow that simply calls an activity */
export async function slack_workflow(slackConfig: SlackConfig, dustConfig: DustConfig): Promise<void> {
  await syncAllChannels(slackConfig, dustConfig);
}
